from typing import Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel

class NotificationBase(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    type: Optional[str] = None
    link: Optional[str] = None
    is_read: Optional[bool] = False

class NotificationCreate(NotificationBase):
    title: str
    message: str
    user_id: UUID

class NotificationUpdate(NotificationBase):
    pass

class NotificationInDBBase(NotificationBase):
    id: UUID
    user_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

class Notification(NotificationInDBBase):
    pass
