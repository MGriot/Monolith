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
    parent_task = await crud_task.task.get(db, id=task_id)
    if not parent_task:
        raise HTTPException(status_code=404, detail="Parent task not found")
    
    project = await crud_project.project.get(db, id=parent_task.project_id)
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    subtasks = await crud_task.task.get_multi_by_project(
        db, project_id=parent_task.project_id, parent_id=task_id, skip=skip, limit=limit
    )
    return subtasks

@router.post("/", response_model=Task)
async def create_subtask(
    *,
    db: AsyncSession = Depends(deps.get_db),
    subtask_in: TaskCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new subtask (using unified Task model).
    """
    if not subtask_in.parent_id:
        raise HTTPException(status_code=400, detail="parent_id is required for subtasks")
        
    parent_task = await crud_task.task.get(db, id=subtask_in.parent_id)
    if not parent_task:
        raise HTTPException(status_code=404, detail="Parent task not found")
    
    if not subtask_in.owner_id:
        subtask_in.owner_id = current_user.id
        
    subtask_obj = await crud_task.task.create(db=db, obj_in=subtask_in)
    return subtask_obj

@router.get("/{subtask_id}", response_model=Task)
async def read_subtask(
    subtask_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get subtask by ID.
    """
    subtask_obj = await crud_task.task.get(db, id=subtask_id)
    if not subtask_obj:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    return subtask_obj

@router.put("/{subtask_id}", response_model=Task)
async def update_subtask(
    *,
    db: AsyncSession = Depends(deps.get_db),
    subtask_id: UUID,
    subtask_in: TaskUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a subtask.
    """
    subtask_obj = await crud_task.task.get(db, id=subtask_id)
    if not subtask_obj:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    subtask_obj = await crud_task.task.update(db=db, db_obj=subtask_obj, obj_in=subtask_in)
    return subtask_obj

@router.delete("/{subtask_id}", response_model=Task)
async def delete_subtask(
    *,
    db: AsyncSession = Depends(deps.get_db),
    subtask_id: UUID,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a subtask.
    """
    subtask_obj = await crud_task.task.get(db, id=subtask_id)
    if not subtask_obj:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    subtask_obj = await crud_task.task.remove(db=db, id=subtask_id)
    return subtask_obj