from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.access import require_task_access
from app.api.api_v1.endpoints import tasks as tasks_api
from app.crud import crud_task
from app.schemas.task import Task, TaskCreate, TaskUpdate
from app.models.user import User

router = APIRouter()

@router.get("/", response_model=List[Task])
async def read_subtasks(
    task_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve subtasks for a task.
    """
    parent_task = await require_task_access(db, task_id, current_user)
    limit = max(1, min(limit, 500))

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
        
    parent_task = await require_task_access(db, subtask_in.parent_id, current_user, write=True)

    # A subtask always lives in its parent's project; never trust the client for this.
    subtask_in.project_id = parent_task.project_id
    # Same path as POST /tasks/ (owner default, custom-field validation, domain errors as 400).
    return await tasks_api.create_task(db=db, task_in=subtask_in, current_user=current_user)

@router.get("/{subtask_id}", response_model=Task)
async def read_subtask(
    subtask_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get subtask by ID.
    """
    await require_task_access(db, subtask_id, current_user)
    subtask_obj = await crud_task.task.get(db, id=subtask_id)
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
    return await tasks_api.update_task(db=db, task_id=subtask_id, task_in=subtask_in, current_user=current_user)

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
    await require_task_access(db, subtask_id, current_user, write=True)

    subtask_obj = await crud_task.task.remove(db=db, id=subtask_id)
    return subtask_obj