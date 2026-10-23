from typing import Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload
from collections import defaultdict
from datetime import datetime, time, timedelta

from app.api import deps
from app.api.access import visible_project_filter, visible_task_filter
from app.models.associations import project_members
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.core.enums import Status
from app.core.reports import notify_near_deadlines
from app.core.summaries import SummaryGenerator
from app.schemas.workload import TeamWorkloadResponse, UserWorkload, DayWorkload

router = APIRouter()

@router.get("/team-workload", response_model=TeamWorkloadResponse)
async def get_team_workload(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    days: int = Query(30, ge=1, le=90)
) -> Any:
    """
    Calculate daily workload per user for the next N days.
    Non-admins see themselves and the people who own or belong to a project they can see, counting only tasks they
    can see; superusers see everyone.
    """
    start_date = datetime.utcnow().date()
    window_end = start_date + timedelta(days=days - 1)

    # 1. Active users: everyone for a superuser, else me and the people I share a project with
    users_stmt = select(User).filter(User.is_active == True)
    if not current_user.is_superuser:
        visible_projects = select(Project.id).where(visible_project_filter(current_user))
        users_stmt = users_stmt.filter(or_(
            User.id == current_user.id,
            User.id.in_(select(project_members.c.user_id).where(project_members.c.project_id.in_(visible_projects))),
            User.id.in_(select(Project.owner_id).where(Project.id.in_(visible_projects))),
        ))
    users_res = await db.execute(users_stmt)
    users = users_res.scalars().all()

    # 2. Open, dated tasks that overlap the window (others add nothing), with their assignees
    tasks_stmt = (
        select(Task)
        .filter(
            and_(
                Task.status != Status.DONE,
                Task.start_date != None,
                Task.due_date != None,
                Task.is_archived == False,
                visible_task_filter(current_user),
                Task.due_date >= datetime.combine(start_date, time.min),
                Task.start_date < datetime.combine(window_end + timedelta(days=1), time.min),
            )
        )
        .options(selectinload(Task.assignees))
    )
    tasks_res = await db.execute(tasks_stmt)
    tasks = tasks_res.scalars().all()

    tasks_by_user = defaultdict(list)
    for t in tasks:
        for u in t.assignees:
            tasks_by_user[u.id].append(t)

    response_users = []

    for user in users:
        day_map = {}
        for i in range(days):
            d = start_date + timedelta(days=i)
            day_map[d.isoformat()] = {"hours": 0.0, "count": 0}

        is_over = False
        for task in tasks_by_user.get(user.id, []):
            t_start = task.start_date.date()
            t_due = task.due_date.date()
            t_dur = (t_due - t_start).days + 1

            if t_dur <= 0: continue

            # Assume 8h per task by default if not specified
            daily_effort = 8.0 / t_dur

            # only the days inside the window
            curr = max(t_start, start_date)
            while curr <= min(t_due, window_end):
                day = day_map[curr.isoformat()]
                day["hours"] += daily_effort
                day["count"] += 1
                if day["hours"] > 8.0:
                    is_over = True
                curr += timedelta(days=1)

        workload_list = [
            DayWorkload(date=d, hours=round(v["hours"], 1), task_count=v["count"])
            for d, v in day_map.items()
        ]

        response_users.append(UserWorkload(
            user_id=str(user.id),
            user_name=user.full_name or user.email,
            workload=workload_list,
            is_overallocated=is_over
        ))

    return TeamWorkloadResponse(users=response_users)

@router.post("/trigger-weekly-summary", status_code=202)
async def trigger_weekly_summary(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin),
) -> Any:
    """
    Manually trigger the generation of weekly email summaries for all users.
    Admin only.
    """
    # The same digest the Monday scheduler job sends (active users who opted in).
    await SummaryGenerator(db).dispatch_all_summaries()
    return {"message": "Weekly summary generation triggered"}

@router.post("/trigger-deadline-notifications", status_code=202)
async def trigger_deadline_notifications(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin),
) -> Any:
    """
    Manually trigger the scanning and notification of near deadlines.
    Admin only.
    """
    await notify_near_deadlines(db)
    return {"message": "Deadline notifications triggered"}

@router.get("/risk-data", response_model=Any)
async def get_risk_data(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get probability/impact data for all active projects and tasks.
    """
    # Projects
    projects_stmt = select(Project).filter(
        visible_project_filter(current_user),
        Project.is_archived == False
    )
    res_p = await db.execute(projects_stmt)
    projects = res_p.scalars().all()

    # Tasks
    tasks_stmt = select(Task).filter(
        visible_task_filter(current_user),
        Task.is_archived == False,
        Task.status != Status.DONE
    )
    res_t = await db.execute(tasks_stmt)
    tasks = res_t.scalars().all()

    items = []
    for p in projects:
        items.append({
            "id": str(p.id),
            "name": p.name,
            "type": "project",
            "probability": p.risk_probability or 1,
            "impact": p.risk_impact or 1,
            "priority": p.priority
        })
    
    for t in tasks:
        items.append({
            "id": str(t.id),
            "name": t.title,
            "type": "task",
            "probability": t.risk_probability or 1,
            "impact": t.risk_impact or 1,
            "priority": t.priority
        })

    return items

@router.get("/activity-recap", response_model=Any)
async def get_activity_recap(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get a detailed recap of all activity across projects.
    """
    # Last 30 days
    limit_date = datetime.utcnow() - timedelta(days=30)

    # 1. New Tasks
    new_tasks_query = select(Task).where(
        Task.created_at >= limit_date,
        Task.is_archived == False
    ).order_by(Task.created_at.desc()).limit(20)

    # 2. Completed Tasks
    completed_tasks_query = select(Task).where(
        Task.completed_at >= limit_date,
        Task.is_archived == False
    ).order_by(Task.completed_at.desc()).limit(20)

    # 3. Upcoming Deadlines (expanded)
    upcoming_deadlines_query = select(Task).where(
        Task.due_date >= datetime.utcnow(),
        Task.status != Status.DONE,
        Task.is_archived == False
    ).order_by(Task.due_date.asc()).limit(20)

    visible = visible_task_filter(current_user)
    new_tasks_query = new_tasks_query.where(visible)
    completed_tasks_query = completed_tasks_query.where(visible)
    upcoming_deadlines_query = upcoming_deadlines_query.where(visible)

    res_new = await db.execute(new_tasks_query)
    res_completed = await db.execute(completed_tasks_query)
    res_upcoming = await db.execute(upcoming_deadlines_query)

    new_tasks = res_new.scalars().all()
    completed_tasks = res_completed.scalars().all()
    upcoming_deadlines = res_upcoming.scalars().all()

    return {
        "new_tasks": [
            {
                "id": str(t.id),
                "title": t.title,
                "created_at": t.created_at.isoformat(),
                "project_id": str(t.project_id)
            } for t in new_tasks
        ],
        "completed_tasks": [
            {
                "id": str(t.id),
                "title": t.title,
                "completed_at": t.completed_at.isoformat(),
                "project_id": str(t.project_id)
            } for t in completed_tasks
        ],
        "upcoming_deadlines": [
            {
                "id": str(t.id),
                "title": t.title,
                "due_date": t.due_date.isoformat(),
                "project_id": str(t.project_id)
            } for t in upcoming_deadlines
        ]
    }

@router.get("/summary", response_model=Any)
async def get_dashboard_summary(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get summary statistics for the dashboard.
    """
    # 1. Projects Count
    proj_query = select(func.count(Project.id)).where(Project.is_archived == False)
    proj_query = proj_query.where(visible_project_filter(current_user))
    
    res = await db.execute(proj_query)
    total_projects = res.scalar()

    # 2. Tasks Count & Breakdown
    # Tasks the user can see, archived ones excluded
    visible = visible_task_filter(current_user)
    count_query = select(Task.status, func.count(Task.id)).where(Task.is_archived == False, visible)

    # One GROUP BY instead of loading every task row into Python just to count them
    res = await db.execute(count_query.group_by(Task.status))
    counts = {status: n for status, n in res.all()}

    total_tasks = sum(counts.values())
    tasks_backlog = counts.get(Status.BACKLOG, 0)
    tasks_todo = counts.get(Status.TODO, 0)
    tasks_in_progress = counts.get(Status.IN_PROGRESS, 0)
    tasks_on_hold = counts.get(Status.ON_HOLD, 0)
    tasks_review = counts.get(Status.REVIEW, 0)
    tasks_done = counts.get(Status.DONE, 0)
    
    # 3. Upcoming Deadlines (next 7 days)
    # Exclude archived
    now = datetime.utcnow()
    next_week = now + timedelta(days=7)
    
    upcoming_query = select(Task).where(
        visible,
        Task.due_date >= now,
        Task.due_date <= next_week,
        Task.status != Status.DONE,
        Task.is_archived == False
    ).order_by(Task.due_date.asc()).limit(5)

    res = await db.execute(upcoming_query)
    upcoming_tasks = res.scalars().all()

    # 4. Recent Activity (last 5 completed tasks)
    activity_query = select(Task).where(
        visible,
        Task.status == Status.DONE,
        Task.completed_at != None
    ).order_by(Task.completed_at.desc()).limit(5)

    res = await db.execute(activity_query)
    recent_activity = res.scalars().all()

    # 5. Global Activity (for heatmap)
    # Using unified Task model
    activity_query = select(
        func.date(Task.completed_at).label("date"),
        func.count(Task.id).label("count")
    ).where(
        Task.completed_at != None,
        visible,
    )

    global_activity_query = activity_query.group_by(
        func.date(Task.completed_at)
    )

    res = await db.execute(global_activity_query)
    global_stats = res.all()

    return {
        "total_projects": total_projects,
        "total_tasks": total_tasks,
        "tasks_backlog": tasks_backlog,
        "tasks_todo": tasks_todo,
        "tasks_in_progress": tasks_in_progress,
        "tasks_on_hold": tasks_on_hold,
        "tasks_review": tasks_review,
        "tasks_done": tasks_done,
        "upcoming_deadlines": [
            {
                "id": str(t.id),
                "title": t.title,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "project_id": str(t.project_id)
            } for t in upcoming_tasks
        ],
        "recent_activity": [
            {
                "id": str(t.id),
                "title": t.title,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                "project_id": str(t.project_id)
            } for t in recent_activity
        ],
        "global_activity": [{"date": str(s.date), "count": s.count} for s in global_stats]
    }
