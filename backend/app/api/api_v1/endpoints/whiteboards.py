from typing import Any, List
from uuid import UUID
import asyncio
import json
import time

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession
from app import crud, models, schemas
from sqlalchemy import or_, select
from app.api import deps
from app.api.access import (
    EDITOR, project_role, require_project_access, require_task_access, require_whiteboard_access,
)
from app.models.associations import project_members
from app.models.project import Project
from app.models.whiteboard import Whiteboard
from app.core import previews
from app.core.whiteboard_rooms import rooms
from sqlalchemy.orm import defer

router = APIRouter()

@router.get("/", response_model=List[schemas.WhiteboardSummary])
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
    # Lists never carry the scene itself (it can be megabytes); open a board with GET /whiteboards/{id}.
    stmt = select(Whiteboard).options(defer(Whiteboard.data)).order_by(Whiteboard.updated_at.desc())
    if project_id:
        await require_project_access(db, project_id, current_user)
        stmt = stmt.where(Whiteboard.project_id == project_id)
    elif task_id:
        await require_task_access(db, task_id, current_user)
        stmt = stmt.where(Whiteboard.task_id == task_id)
    elif not current_user.is_superuser:
        # Without a scope, only boards the caller owns or can reach through a project.
        uid = current_user.id
        stmt = stmt.where(or_(
            Whiteboard.owner_id == uid,
            Whiteboard.project_id.in_(select(Project.id).where(Project.owner_id == uid)),
            Whiteboard.project_id.in_(select(project_members.c.project_id).where(project_members.c.user_id == uid)),
        ))
    return (await db.execute(stmt.offset(skip).limit(limit))).scalars().all()

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
    obj_in.preview_image = previews.preview_for(obj_in.preview_image, obj_in.data)
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
    if obj_in.preview_image is not None or obj_in.data is not None:
        obj_in.preview_image = previews.preview_for(
            obj_in.preview_image, obj_in.data if obj_in.data is not None else whiteboard.data, old=whiteboard.preview_image
        )
    updated = await crud.whiteboard.update(db, db_obj=whiteboard, obj_in=obj_in)
    if obj_in.data is not None:
        await rooms.replace_scene(id, updated.data or {})  # people editing live see the new scene at once
    return updated


@router.put("/{id}/preview", response_model=schemas.WhiteboardSummary)
async def update_whiteboard_preview(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    body: schemas.WhiteboardPreviewIn,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """Replace only the preview image (PNG data URL), e.g. after live edits that the server already saved."""
    await require_whiteboard_access(db, id, current_user, write=True)
    whiteboard = await crud.whiteboard.get(db, id=id)
    url = previews.preview_for(body.preview_image, None, old=whiteboard.preview_image)
    return await crud.whiteboard.update(db, db_obj=whiteboard, obj_in={"preview_image": url})

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
    removed = await crud.whiteboard.remove(db, id=id)
    if removed:
        previews.delete_preview(removed.preview_image)
    return removed


WS_AUTH_TIMEOUT_SECONDS = 10


async def _room_identity(whiteboard_id: UUID, user_id: UUID):
    """(user, role) for someone allowed to open the board, else None. Short-lived session, like the auth check."""
    from app.crud import crud_user
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        user = await crud_user.get(db, id=user_id)
        if not user or not user.is_active:
            return None
        try:
            wb = await require_whiteboard_access(db, whiteboard_id, user)
        except HTTPException:
            return None
        role = await project_role(db, wb.project_id, user) or "viewer"  # an owner who lost access may still look
        return user, role


@router.websocket("/{id}/ws")
async def whiteboard_room(websocket: WebSocket, id: UUID):
    """Live editing of one sketch.

    Protocol: send {"type": "auth", "token": "<jwt>"} first. The server answers `init` (your peer entry and role,
    the current elements and files, everyone in the room, and the preview `leader`). Then exchange
    `scene_update` {elements: [changed elements]}, `files` {files: {id: BinaryFileData}}, `pointer`
    {pointer: {x, y, tool}, button}. The server also sends `peers` (presence) and `scene_replace` (the scene was
    rewritten through the API). Viewers receive everything but cannot send edits. Closed with 1008 when the
    token expires or access is missing.
    """
    from app.api.api_v1.endpoints.notifications import _authenticate_ws_token

    await websocket.accept()
    try:
        first = json.loads(await asyncio.wait_for(websocket.receive_text(), timeout=WS_AUTH_TIMEOUT_SECONDS))
        auth = await _authenticate_ws_token(first.get("token") or "") if first.get("type") == "auth" else None
    except (asyncio.TimeoutError, ValueError, WebSocketDisconnect, AttributeError):
        auth = None
    identity = await _room_identity(id, auth[0]) if auth else None
    if identity is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user, role = identity
    exp = auth[1]
    peer = await rooms.join(id, user_id=user.id, name=user.full_name or user.email, role=role,
                            send=websocket.send_text)
    try:
        while True:
            raw = await websocket.receive_text()
            if exp is not None and time.time() >= exp:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                break
            await rooms.handle(id, peer, raw)
            if peer.revoked:  # removed from the project (or deactivated) while connected
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                break
    except WebSocketDisconnect:
        pass
    finally:
        await rooms.leave(id, peer)
