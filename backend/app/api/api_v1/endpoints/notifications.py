from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.crud import notification as crud_notification
from app.schemas.notification import Notification, NotificationUpdate
from app.models.user import User

router = APIRouter()

@router.get("/", response_model=List[Notification])
async def read_notifications(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve notifications for the current user.
    """
    notifications = await crud_notification.get_multi_by_user(
        db, user_id=current_user.id, skip=skip, limit=limit
    )
    return notifications

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
    
    notification = await crud_notification.update(db, db_obj=notification, obj_in=notification_in)
    return notification

@router.post("/mark-all-as-read")
async def mark_all_notifications_as_read(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Mark all notifications as read for the current user.
    """
    # Simple implementation: fetch all unread and update
    notifications = await crud_notification.get_multi_by_user(db, user_id=current_user.id, limit=1000)
    for n in notifications:
        if not n.is_read:
            n.is_read = True
            db.add(n)
    await db.commit()
    return {"status": "success"}
