from typing import Any, List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from datetime import datetime

from app.api import deps
from app.models.project import Project
from app.models.task import Task, Subtask
from app.schemas.calendar import CalendarResponse, CalendarItem

router = APIRouter()

@router.get("/", response_model=CalendarResponse)
async def get_calendar_events(
    db: AsyncSession = Depends(deps.get_db),
    current_user: Any = Depends(deps.get_current_user),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
) -> Any:
    """
    Get all projects, tasks, and subtasks with due dates.
    """
    items = []
    
    # Fetch Projects
    project_query = select(Project).where(Project.due_date != None)
    if start_date:
        project_query = project_query.where(Project.due_date >= start_date)
    if end_date:
        project_query = project_query.where(Project.due_date <= end_date)
    
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

    # Fetch Tasks
    task_query = select(Task).where(Task.due_date != None)
    if start_date:
        task_query = task_query.where(Task.due_date >= start_date)
    if end_date:
        task_query = task_query.where(Task.due_date <= end_date)
    
    result = await db.execute(task_query)
    tasks = result.scalars().all()
    for t in tasks:
        items.append(CalendarItem(
            id=t.id,
            title=t.title,
            item_type="task",
            status=t.status,
            start_date=t.start_date,
            due_date=t.due_date,
            project_id=t.project_id
        ))

    # Fetch Subtasks
    subtask_query = select(Subtask, Task.project_id).join(Task, Subtask.task_id == Task.id).where(Subtask.due_date != None)
    if start_date:
        subtask_query = subtask_query.where(Subtask.due_date >= start_date)
    if end_date:
        subtask_query = subtask_query.where(Subtask.due_date <= end_date)
    
    result = await db.execute(subtask_query)
    subtasks_data = result.all()
    for st_row in subtasks_data:
        st = st_row[0]
        p_id = st_row[1]
        items.append(CalendarItem(
            id=st.id,
            title=st.title,
            item_type="subtask",
            status=st.status,
            start_date=st.start_date,
            due_date=st.due_date,
            task_id=st.task_id,
            project_id=p_id
        ))

    return {"items": items}
