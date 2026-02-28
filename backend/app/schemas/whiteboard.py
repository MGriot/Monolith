from typing import Optional, Dict, Any
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel

class WhiteboardBase(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    preview_image: Optional[str] = None
    project_id: Optional[UUID] = None
    task_id: Optional[UUID] = None

class WhiteboardCreate(WhiteboardBase):
    title: str
    data: Dict[str, Any]
    project_id: UUID

class WhiteboardUpdate(WhiteboardBase):
    pass

class WhiteboardInDBBase(WhiteboardBase):
    id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class Whiteboard(WhiteboardInDBBase):
    pass
