from typing import Any, List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from datetime import datetime

from app.api import deps
from app.models.project import Project
from app.models.task import Task, Subtask
from app.models.user import User
from app.schemas.calendar import CalendarResponse, CalendarItem
from app.core.utils import make_naive

router = APIRouter()

@router.get("/", response_model=CalendarResponse)
async def get_calendar_events(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
) -> Any:
    """
    Get all projects and tasks with due dates, filtered by owner.
    """
    start_date = make_naive(start_date)
    end_date = make_naive(end_date)
    
    items = []
    
    # Fetch Projects
    project_query = select(Project).where(Project.due_date != None)
    if not current_user.is_superuser:
        project_query = project_query.where(Project.owner_id == current_user.id)
        
    if start_date and end_date:
        # Overlap logic: (effective_start <= range_end) AND (due_date >= range_start)
        from sqlalchemy import func
        project_query = project_query.where(
            func.coalesce(Project.start_date, Project.due_date) <= end_date
        ).where(
            Project.due_date >= start_date
        )
    
    result = await db.execute(project_query)
    projects = result.scalars().all()
    for p in projects:
        items.append(CalendarItem(
            id=p.id,
            title=p.name,
            item_type="project",
            status=p.status,
            start_date=p.start_date,
            due_date=p.due_date
        ))

    # Fetch Tasks (All levels)
    task_query = select(Task).where(Task.due_date != None)
    if not current_user.is_superuser:
        task_query = task_query.join(Project).where(Project.owner_id == current_user.id)
        
    if start_date and end_date:
        # Overlap logic: (effective_start <= range_end) AND (due_date >= range_start)
        from sqlalchemy import func
        task_query = task_query.where(
            func.coalesce(Task.start_date, Task.due_date) <= end_date
        ).where(
            Task.due_date >= start_date
        )
    
    result = await db.execute(task_query)
    tasks = result.scalars().all()
    for t in tasks:
        # Determine if it's a root task or child for UI labeling if needed
        item_type = "task" if not t.parent_id else "subtask"
        items.append(CalendarItem(
            id=t.id,
            title=t.title,
            item_type=item_type,
            status=t.status,
            start_date=t.start_date,
            due_date=t.due_date,
            project_id=t.project_id,
            task_id=t.parent_id
        ))

    return {"items": items}
