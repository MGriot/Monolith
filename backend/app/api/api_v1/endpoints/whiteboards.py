from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app import crud, models, schemas
from app.api import deps

router = APIRouter()

@router.get("/", response_model=List[schemas.Whiteboard])
async def read_whiteboards(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    project_id: UUID = None,
    task_id: UUID = None,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve whiteboards.
    """
    if project_id:
        return await crud.whiteboard.get_by_project(db, project_id=project_id, skip=skip, limit=limit)
    if task_id:
        return await crud.whiteboard.get_by_task(db, task_id=task_id, skip=skip, limit=limit)
    
    # Generic list (only for superusers or all if needed, but here we filter by ownership if no project provided)
    if current_user.is_superuser:
        return await crud.whiteboard.get_multi(db, skip=skip, limit=limit)
    
    # For now, if no project/task is provided, we might want to return nothing or all user's sketches
    # Let's just return multi for now
    return await crud.whiteboard.get_multi(db, skip=skip, limit=limit)

@router.post("/", response_model=schemas.Whiteboard)
async def create_whiteboard(
    *,
    db: AsyncSession = Depends(deps.get_db),
    obj_in: schemas.WhiteboardCreate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new whiteboard.
    """
    return await crud.whiteboard.create_with_owner(db, obj_in=obj_in, owner_id=current_user.id)

@router.get("/{id}", response_model=schemas.Whiteboard)
async def read_whiteboard(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Get whiteboard by ID.
    """
    whiteboard = await crud.whiteboard.get(db, id=id)
    if not whiteboard:
        raise HTTPException(status_code=404, detail="Whiteboard not found")
    return whiteboard

@router.put("/{id}", response_model=schemas.Whiteboard)
async def update_whiteboard(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    obj_in: schemas.WhiteboardUpdate,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a whiteboard.
    """
    whiteboard = await crud.whiteboard.get(db, id=id)
    if not whiteboard:
        raise HTTPException(status_code=404, detail="Whiteboard not found")
    return await crud.whiteboard.update(db, db_obj=whiteboard, obj_in=obj_in)

@router.delete("/{id}", response_model=schemas.Whiteboard)
async def delete_whiteboard(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a whiteboard.
    """
    whiteboard = await crud.whiteboard.get(db, id=id)
    if not whiteboard:
        raise HTTPException(status_code=404, detail="Whiteboard not found")
    return await crud.whiteboard.remove(db, id=id)
