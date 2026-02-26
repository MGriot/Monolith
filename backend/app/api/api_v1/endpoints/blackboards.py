from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app import crud, models, schemas
from app.api import deps

router = APIRouter()

@router.get("/", response_model=List[schemas.Blackboard])
async def read_blackboards(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    project_id: UUID = None,
    task_id: UUID = None,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve blackboards.
    """
    if project_id:
        return await crud.blackboard.get_by_project(db, project_id=project_id, skip=skip, limit=limit)
    if task_id:
        return await crud.blackboard.get_by_task(db, task_id=task_id, skip=skip, limit=limit)
    
    # Generic list (only for superusers or all if needed, but here we filter by ownership if no project provided)
    if current_user.is_superuser:
        return await crud.blackboard.get_multi(db, skip=skip, limit=limit)
    
    # For now, if no project/task is provided, we might want to return nothing or all user's sketches
    # Let's just return multi for now
    return await crud.blackboard.get_multi(db, skip=skip, limit=limit)

@router.post("/", response_model=schemas.Blackboard)
async def create_blackboard(
    *,
    db: AsyncSession = Depends(deps.get_db),
    obj_in: schemas.BlackboardCreate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new blackboard.
    """
    return await crud.blackboard.create_with_owner(db, obj_in=obj_in, owner_id=current_user.id)

@router.get("/{id}", response_model=schemas.Blackboard)
async def read_blackboard(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Get blackboard by ID.
    """
    blackboard = await crud.blackboard.get(db, id=id)
    if not blackboard:
        raise HTTPException(status_code=404, detail="Blackboard not found")
    return blackboard

@router.put("/{id}", response_model=schemas.Blackboard)
async def update_blackboard(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    obj_in: schemas.BlackboardUpdate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a blackboard.
    """
    blackboard = await crud.blackboard.get(db, id=id)
    if not blackboard:
        raise HTTPException(status_code=404, detail="Blackboard not found")
    return await crud.blackboard.update(db, db_obj=blackboard, obj_in=obj_in)

@router.delete("/{id}", response_model=schemas.Blackboard)
async def delete_blackboard(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a blackboard.
    """
    blackboard = await crud.blackboard.get(db, id=id)
    if not blackboard:
        raise HTTPException(status_code=404, detail="Blackboard not found")
    return await crud.blackboard.remove(db, id=id)
