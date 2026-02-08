from typing import Any, List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta

from app.api import deps
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.core.enums import Status

router = APIRouter()

@router.get("/summary", response_model=Any)
async def get_dashboard_summary(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get summary statistics for the dashboard.
    """
    # 1. Projects Count
    proj_query = select(func.count(Project.id))
    if not current_user.is_superuser:
        proj_query = proj_query.where(Project.owner_id == current_user.id)
    
    res = await db.execute(proj_query)
    total_projects = res.scalar()

    # 2. Tasks Count & Breakdown
    # For tasks, we need to filter by projects owned by the user if not superuser
    if current_user.is_superuser:
        task_query = select(Task)
    else:
        task_query = select(Task).join(Project).where(Project.owner_id == current_user.id)

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
    now = datetime.utcnow()
    next_week = now + timedelta(days=7)
    
    if current_user.is_superuser:
        upcoming_query = select(Task).where(
            Task.due_date >= now,
            Task.due_date <= next_week,
            Task.status != Status.DONE
        ).order_by(Task.due_date.asc()).limit(5)
    else:
        upcoming_query = select(Task).join(Project).where(
            Project.owner_id == current_user.id,
            Task.due_date >= now,
            Task.due_date <= next_week,
            Task.status != Status.DONE
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
