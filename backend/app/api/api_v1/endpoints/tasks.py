from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.crud import crud_task, crud_project
from app.schemas.task import Task, TaskCreate, TaskUpdate
from app.models.user import User

router = APIRouter()

@router.get("/", response_model=List[Task])
async def read_tasks(
    project_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve tasks for a project.
    """
    project = await crud_project.project.get(db, id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    tasks = await crud_task.task.get_multi_by_project(
        db, project_id=project_id, skip=skip, limit=limit
    )
    return tasks

@router.post("/", response_model=Task)
async def create_task(
    *,
    db: AsyncSession = Depends(deps.get_db),
    task_in: TaskCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new task.
    """
    project = await crud_project.project.get(db, id=task_in.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    task = await crud_task.task.create(db=db, obj_in=task_in)
    return task

@router.get("/{task_id}", response_model=Task)
async def read_task(
    task_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get task by ID.
    """
    task = await crud_task.task.get(db, id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    project = await crud_project.project.get(db, id=task.project_id)
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    return task

@router.put("/{task_id}", response_model=Task)
async def update_task(
    *,
    db: AsyncSession = Depends(deps.get_db),
    task_id: UUID,
    task_in: TaskUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a task.
    """
    task = await crud_task.task.get(db, id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    project = await crud_project.project.get(db, id=task.project_id)
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    task = await crud_task.task.update(db=db, db_obj=task, obj_in=task_in)
    return task

@router.delete("/{task_id}", response_model=Task)
async def delete_task(
    *,
    db: AsyncSession = Depends(deps.get_db),
    task_id: UUID,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a task.
    """
    task = await crud_task.task.get(db, id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    project = await crud_project.project.get(db, id=task.project_id)
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    task = await crud_task.task.remove(db=db, id=task_id)
    return task
