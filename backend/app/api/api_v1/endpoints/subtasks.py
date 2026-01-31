from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.crud import crud_task, crud_project
from app.schemas.task import Subtask, SubtaskCreate, SubtaskUpdate
from app.models.user import User

router = APIRouter()

@router.get("/", response_model=List[Subtask])
async def read_subtasks(
    task_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve subtasks for a task.
    """
    task = await crud_task.task.get(db, id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    project = await crud_project.project.get(db, id=task.project_id)
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    subtasks = await crud_task.subtask.get_multi_by_task(
        db, task_id=task_id, skip=skip, limit=limit
    )
    return subtasks

@router.post("/", response_model=Subtask)
async def create_subtask(
    *,
    db: AsyncSession = Depends(deps.get_db),
    subtask_in: SubtaskCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new subtask.
    """
    task = await crud_task.task.get(db, id=subtask_in.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    project = await crud_project.project.get(db, id=task.project_id)
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    if not subtask_in.owner_id:
        subtask_in.owner_id = current_user.id
        
    subtask = await crud_task.subtask.create(db=db, obj_in=subtask_in)
    return subtask

@router.get("/{subtask_id}", response_model=Subtask)
async def read_subtask(
    subtask_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get subtask by ID.
    """
    subtask = await crud_task.subtask.get(db, id=subtask_id)
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    task = await crud_task.task.get(db, id=subtask.task_id)
    project = await crud_project.project.get(db, id=task.project_id)
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    return subtask

@router.put("/{subtask_id}", response_model=Subtask)
async def update_subtask(
    *,
    db: AsyncSession = Depends(deps.get_db),
    subtask_id: UUID,
    subtask_in: SubtaskUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a subtask.
    """
    subtask = await crud_task.subtask.get(db, id=subtask_id)
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    task = await crud_task.task.get(db, id=subtask.task_id)
    project = await crud_project.project.get(db, id=task.project_id)
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    subtask = await crud_task.subtask.update(db=db, db_obj=subtask, obj_in=subtask_in)
    return subtask

@router.delete("/{subtask_id}", response_model=Subtask)
async def delete_subtask(
    *,
    db: AsyncSession = Depends(deps.get_db),
    subtask_id: UUID,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a subtask.
    """
    subtask = await crud_task.subtask.get(db, id=subtask_id)
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    task = await crud_task.task.get(db, id=subtask.task_id)
    project = await crud_project.project.get(db, id=task.project_id)
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    subtask = await crud_task.subtask.remove(db=db, id=subtask_id)
    return subtask
