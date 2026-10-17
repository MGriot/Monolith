from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app import crud, models, schemas
from sqlalchemy import or_, select
from app.api import deps
from app.api.access import (
    EDITOR, require_project_access, require_task_access, require_whiteboard_access,
)
from app.models.associations import project_members
from app.models.project import Project
from app.models.whiteboard import Whiteboard

router = APIRouter()

@router.get("/", response_model=List[schemas.Whiteboard])
async def read_whiteboards(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = Query(100, ge=1, le=500),
    project_id: UUID = None,
    task_id: UUID = None,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve whiteboards.
    """
    limit = max(1, min(limit, 200))
    if project_id:
        await require_project_access(db, project_id, current_user)
        return await crud.whiteboard.get_by_project(db, project_id=project_id, skip=skip, limit=limit)
    if task_id:
        await require_task_access(db, task_id, current_user)
        return await crud.whiteboard.get_by_task(db, task_id=task_id, skip=skip, limit=limit)

    if current_user.is_superuser:
        return await crud.whiteboard.get_multi(db, skip=skip, limit=limit)

    # Without a scope, only boards the caller owns or can reach through a project.
    uid = current_user.id
    stmt = (
        select(Whiteboard)
        .where(or_(
            Whiteboard.owner_id == uid,
            Whiteboard.project_id.in_(select(Project.id).where(Project.owner_id == uid)),
            Whiteboard.project_id.in_(select(project_members.c.project_id).where(project_members.c.user_id == uid)),
        ))
        .offset(skip).limit(limit)
    )
    return (await db.execute(stmt)).scalars().all()

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
    await require_project_access(db, obj_in.project_id, current_user, min_role=EDITOR)
    if obj_in.task_id:
        await require_task_access(db, obj_in.task_id, current_user, write=True)
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
    await require_whiteboard_access(db, id, current_user)
    whiteboard = await crud.whiteboard.get(db, id=id)
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
    await require_whiteboard_access(db, id, current_user, write=True)
    # Moving a board elsewhere requires access to the destination too.
    if obj_in.project_id:
        await require_project_access(db, obj_in.project_id, current_user, min_role=EDITOR)
    if obj_in.task_id:
        await require_task_access(db, obj_in.task_id, current_user, write=True)
    whiteboard = await crud.whiteboard.get(db, id=id)
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
    await require_whiteboard_access(db, id, current_user, write=True)
    return await crud.whiteboard.remove(db, id=id)
