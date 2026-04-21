from typing import Any, List, Dict
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta

from app.api import deps
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.core.enums import Status
from app.core.reports import generate_weekly_summaries, notify_near_deadlines
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
    """
    start_date = datetime.utcnow().date()
    
    # 1. Fetch all active users
    users_res = await db.execute(select(User).filter(User.is_active == True))
    users = users_res.scalars().all()
    
    # 2. Fetch all active tasks with assignees
    tasks_stmt = (
        select(Task)
        .filter(
            and_(
                Task.status != Status.DONE,
                Task.start_date != None,
                Task.due_date != None,
                Task.is_archived == False
            )
        )
        .options(selectinload(Task.assignees))
    )
    tasks_res = await db.execute(tasks_stmt)
    tasks = tasks_res.scalars().all()
    
    response_users = []
    
    for user in users:
        # Filter tasks assigned to this user
        user_tasks = [t for t in tasks if any(u.id == user.id for u in t.assignees)]
        
        day_map = {}
        for i in range(days):
            d = start_date + timedelta(days=i)
            day_map[d.isoformat()] = {"hours": 0.0, "count": 0}
            
        is_over = False
        for task in user_tasks:
            t_start = task.start_date.date()
            t_due = task.due_date.date()
            t_dur = (t_due - t_start).days + 1
            
            if t_dur <= 0: continue
            
            # Assume 8h per task by default if not specified
            daily_effort = 8.0 / t_dur 
            
            curr = t_start
            while curr <= t_due:
                d_str = curr.isoformat()
                if d_str in day_map:
                    day_map[d_str]["hours"] += daily_effort
                    day_map[d_str]["count"] += 1
                    if day_map[d_str]["hours"] > 8.0:
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
    # Run in background ideally, but for test we can await
    await generate_weekly_summaries(db)
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

    if not current_user.is_superuser:
        new_tasks_query = new_tasks_query.join(Project).where(Project.owner_id == current_user.id)
        completed_tasks_query = completed_tasks_query.join(Project).where(Project.owner_id == current_user.id)
        upcoming_deadlines_query = upcoming_deadlines_query.join(Project).where(Project.owner_id == current_user.id)

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
    if not current_user.is_superuser:
        proj_query = proj_query.where(Project.owner_id == current_user.id)
    
    res = await db.execute(proj_query)
    total_projects = res.scalar()

    # 2. Tasks Count & Breakdown
    # For tasks, we need to filter by projects owned by the user if not superuser
    # And EXCLUDE archived tasks
    if current_user.is_superuser:
        task_query = select(Task).where(Task.is_archived == False)
    else:
        task_query = select(Task).join(Project).where(
            Project.owner_id == current_user.id,
            Task.is_archived == False
        )

    res = await db.execute(task_query)
    all_tasks = res.scalars().all()
    
    total_tasks = len(all_tasks)
    tasks_backlog = sum(1 for t in all_tasks if t.status == Status.BACKLOG)
    tasks_todo = sum(1 for t in all_tasks if t.status == Status.TODO)
    tasks_in_progress = sum(1 for t in all_tasks if t.status == Status.IN_PROGRESS)
    tasks_on_hold = sum(1 for t in all_tasks if t.status == Status.ON_HOLD)
    tasks_review = sum(1 for t in all_tasks if t.status == Status.REVIEW)
    tasks_done = sum(1 for t in all_tasks if t.status == Status.DONE)
    
    # 3. Upcoming Deadlines (next 7 days)
    # Exclude archived
    now = datetime.utcnow()
    next_week = now + timedelta(days=7)
    
    if current_user.is_superuser:
        upcoming_query = select(Task).where(
            Task.due_date >= now,
            Task.due_date <= next_week,
            Task.status != Status.DONE,
            Task.is_archived == False
        ).order_by(Task.due_date.asc()).limit(5)
    else:
        upcoming_query = select(Task).join(Project).where(
            Project.owner_id == current_user.id,
            Task.due_date >= now,
            Task.due_date <= next_week,
            Task.status != Status.DONE,
            Task.is_archived == False
        ).order_by(Task.due_date.asc()).limit(5)

    res = await db.execute(upcoming_query)
    upcoming_tasks = res.scalars().all()

    # 4. Recent Activity (last 5 completed tasks)
    if current_user.is_superuser:
        activity_query = select(Task).where(
            Task.status == Status.DONE,
            Task.completed_at != None
        ).order_by(Task.completed_at.desc()).limit(5)
    else:
        activity_query = select(Task).join(Project).where(
            Project.owner_id == current_user.id,
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
        Task.completed_at != None
    )

    if not current_user.is_superuser:
        activity_query = activity_query.join(Project).where(Project.owner_id == current_user.id)

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
