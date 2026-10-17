import asyncio
import json
import time
from typing import Any, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
import jwt
from jwt import InvalidTokenError

from app.api import deps
from app.crud import notification as crud_notification
from app.schemas.notification import Notification, NotificationUpdate
from app.models.user import User
from app.core.websockets import manager
from app.core.config import settings
from app.core import security
from app.db.session import AsyncSessionLocal
from app.crud import crud_user

router = APIRouter()

WS_AUTH_TIMEOUT_SECONDS = 10


async def _authenticate_ws_token(token: str):
    """Return (user_id, exp) for a valid token of an active user, else None.

    The DB session lives only for this lookup: holding one for the whole connection would pin a
    pooled connection per open socket and starve the API.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("purpose"):
            return None
        user_id = UUID(payload.get("sub"))
    except (InvalidTokenError, ValueError, TypeError):
        return None
    async with AsyncSessionLocal() as db:
        user = await crud_user.get(db, id=user_id)
    if not user or not user.is_active:
        return None
    return user.id, payload.get("exp")


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time notifications.

    The JWT is NOT taken from the URL (URLs end up in proxy/access logs). Protocol:
      1. client connects to /ws
      2. client sends {"type": "auth", "token": "<jwt>"} within WS_AUTH_TIMEOUT_SECONDS
      3. server answers {"type": "auth_ok"}; "ping" is answered with "pong"
    The socket is closed (1008) once the token expires.
    """
    await websocket.accept()
    try:
        first = await asyncio.wait_for(websocket.receive_text(), timeout=WS_AUTH_TIMEOUT_SECONDS)
        msg = json.loads(first)
        if msg.get("type") != "auth":
            raise ValueError("first message must be auth")
        auth = await _authenticate_ws_token(msg.get("token") or "")
    except (asyncio.TimeoutError, ValueError, WebSocketDisconnect, AttributeError):
        auth = None
    if auth is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id, exp = auth
    await manager.connect(websocket, user_id, accept=False)
    try:
        await websocket.send_text(json.dumps({"type": "auth_ok"}))
        while True:
            data = await websocket.receive_text()
            if exp is not None and time.time() >= exp:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                break
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, user_id)

@router.get("/", response_model=List[Notification])
async def read_notifications(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = Query(100, ge=1, le=500),
    is_read: Optional[bool] = None,
    type: Optional[str] = Query(None, max_length=50),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve notifications for the current user, newest first. Filter with `is_read` and `type`.
    """
    notifications = await crud_notification.get_multi_by_user(
        db, user_id=current_user.id, skip=max(skip, 0), limit=limit, is_read=is_read, type=type
    )
    return notifications


@router.get("/unread-count")
async def unread_notification_count(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Number of unread notifications (the bell badge), without fetching the notifications themselves."""
    return {"count": await crud_notification.count_unread(db, user_id=current_user.id)}

@router.put("/{notification_id}", response_model=Notification)
async def update_notification(
    *,
    db: AsyncSession = Depends(deps.get_db),
    notification_id: UUID,
    notification_in: NotificationUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a notification (e.g., mark as read).
    """
    notification = await crud_notification.get(db, id=notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.user_id != current_user.id:
        raise HTTPException(status_code=400, detail="Not enough permissions")
    
    # Only the read flag is client-editable (true = read, false = back to unread).
    changes = {"is_read": bool(notification_in.is_read)} if "is_read" in notification_in.model_fields_set else {}
    notification = await crud_notification.update(db, db_obj=notification, obj_in=changes)
    return notification

@router.post("/mark-all-as-read")
async def mark_all_notifications_as_read(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Mark all notifications as read for the current user.
    """
    updated = await crud_notification.mark_all_as_read(db, user_id=current_user.id)
    return {"status": "success", "updated": updated}
