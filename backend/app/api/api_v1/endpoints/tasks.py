from typing import Any, List, Optional
import os
import shutil
import uuid
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.api import deps
from app.crud import crud_task, crud_project, crud_dependency
from app.schemas.task import Task, TaskCreate, TaskUpdate, Dependency, DependencyCreate
from app.models.user import User
from app.models.dependency import Dependency as DependencyModel
from app.core.config import settings

router = APIRouter()

@router.get("/assigned", response_model=List[Task])
async def read_assigned_tasks(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve all tasks assigned to the current user.
    """
    from app.models.task import Task as TaskModel
    from app.models.associations import task_assignees
    
    query = (
        select(TaskModel)
        .join(task_assignees)
        .filter(task_assignees.c.user_id == current_user.id)
        .options(
            selectinload(TaskModel.owner),
            selectinload(TaskModel.assignees),
            selectinload(TaskModel.blocked_by),
            selectinload(TaskModel.blocking),
            selectinload(TaskModel.topic_ref),
            selectinload(TaskModel.type_ref),
            selectinload(TaskModel.topics),
            selectinload(TaskModel.types),
            selectinload(TaskModel.project),
            selectinload(TaskModel.subtasks).options(
                selectinload(TaskModel.owner),
                selectinload(TaskModel.assignees),
                selectinload(TaskModel.blocked_by),
                selectinload(TaskModel.blocking),
                selectinload(TaskModel.topic_ref),
                selectinload(TaskModel.type_ref),
                selectinload(TaskModel.topics),
                selectinload(TaskModel.types),
                selectinload(TaskModel.subtasks).options(
                    selectinload(TaskModel.owner),
                    selectinload(TaskModel.assignees),
                    selectinload(TaskModel.blocked_by),
                    selectinload(TaskModel.blocking),
                    selectinload(TaskModel.topic_ref),
                    selectinload(TaskModel.type_ref),
                    selectinload(TaskModel.topics),
                    selectinload(TaskModel.types),
                    selectinload(TaskModel.subtasks)
                )
            )
        )
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    # We don't apply WBS here as these tasks are from different projects/levels
    return tasks

@router.get("/", response_model=List[Task])
async def read_tasks(
    project_id: UUID,
    parent_id: Optional[UUID] = None,
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve tasks for a project.
    """
    from typing import Optional
    project = await crud_project.project.get(db, id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check permissions (Owner or Member)
    if not current_user.is_superuser and project.owner_id != current_user.id:
        member_ids = [m.id for m in project.members]
        if current_user.id not in member_ids:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    
    tasks = await crud_task.task.get_multi_by_project(
        db, project_id=project_id, skip=skip, limit=limit, parent_id=parent_id
    )
    
    from app.core.wbs import apply_wbs_codes
    from app.core.cpm import calculate_cpm
    from app.schemas.task import Task as TaskSchema
    # Convert models to schemas to allow setting wbs_code (which is not in DB)
    task_schemas = [TaskSchema.model_validate(t) for t in tasks]
    
    # Apply WBS and CPM
    task_schemas = apply_wbs_codes(task_schemas, "")
    return calculate_cpm(task_schemas)

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
    
    # Check permissions (Owner or Member)
    if not current_user.is_superuser and project.owner_id != current_user.id:
        member_ids = [m.id for m in project.members]
        if current_user.id not in member_ids:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if not task_in.owner_id:
        task_in.owner_id = current_user.id
        
    try:
        task_obj = await crud_task.task.create(db=db, obj_in=task_in)
        return task_obj
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{task_id}", response_model=Task)
async def read_task(
    task_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get task by ID.
    """
    task_obj = await crud_task.task.get(db, id=task_id)
    if not task_obj:
        raise HTTPException(status_code=404, detail="Task not found")
    
    project = await crud_project.project.get(db, id=task_obj.project_id)
    
    # Check permissions (Owner or Member)
    if not current_user.is_superuser and project.owner_id != current_user.id:
        member_ids = [m.id for m in project.members]
        if current_user.id not in member_ids:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    
    return task_obj

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
    task_obj = await crud_task.task.get(db, id=task_id)
    if not task_obj:
        raise HTTPException(status_code=404, detail="Task not found")
    
    project = await crud_project.project.get(db, id=task_obj.project_id)
    
    # Check permissions (Owner or Member)
    if not current_user.is_superuser and project.owner_id != current_user.id:
        member_ids = [m.id for m in project.members]
        if current_user.id not in member_ids:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    
    try:
        task_obj = await crud_task.task.update(db=db, db_obj=task_obj, obj_in=task_in)
        return task_obj
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
    task_obj = await crud_task.task.get(db, id=task_id)
    if not task_obj:
        raise HTTPException(status_code=404, detail="Task not found")
    
    project = await crud_project.project.get(db, id=task_obj.project_id)
    
    # Check permissions (Owner or Member)
    if not current_user.is_superuser and project.owner_id != current_user.id:
        member_ids = [m.id for m in project.members]
        if current_user.id not in member_ids:
            raise HTTPException(status_code=403, detail="Not enough permissions")
    
    task_obj = await crud_task.task.remove(db=db, id=task_id)
    return task_obj

@router.post("/{task_id}/attachments", response_model=Task)
async def upload_task_attachment(
    task_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Upload an attachment to a task.
    """
    task_obj = await crud_task.task.get(db, id=task_id)
    if not task_obj:
        raise HTTPException(status_code=404, detail="Task not found")
    
    project = await crud_project.project.get(db, id=task_obj.project_id)
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    file_url = f"/uploads/{unique_filename}"
    attachments = list(task_obj.attachments) if task_obj.attachments else []
    attachments.append(file_url)
    
    task_obj = await crud_task.task.update(db=db, db_obj=task_obj, obj_in={"attachments": attachments})
    return task_obj

@router.post("/{task_id}/dependencies", response_model=Dependency)
async def create_task_dependency(
    task_id: UUID,
    dependency_in: DependencyCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create a dependency for a task.
    """
    task_obj = await crud_task.task.get(db, id=task_id)
    if not task_obj:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if dependency_in.successor_id != task_id:
         raise HTTPException(status_code=400, detail="Successor ID must match task ID")
         
    try:
        dep = await crud_dependency.dependency.create(db, obj_in=dependency_in)
        return dep
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{task_id}/dependencies/{predecessor_id}", response_model=List[Dependency])
async def delete_task_dependency(
    task_id: UUID,
    predecessor_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Remove a dependency from a task.
    """
    result = await db.execute(
        select(DependencyModel).filter(
            and_(
                DependencyModel.successor_id == task_id,
                DependencyModel.predecessor_id == predecessor_id
            )
        )
    )
    dep = result.scalars().first()
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found")
        
    await crud_dependency.dependency.remove(db, id=dep.id)
    
    remaining = await crud_dependency.dependency.get_by_successor(db, successor_id=task_id)
    return remaining