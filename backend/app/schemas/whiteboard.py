from typing import Optional, Dict, Any
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel

class WhiteboardBase(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    # In requests: a PNG data URL (stored as a file). In responses: the preview's URL under /uploads/previews/.
    preview_image: Optional[str] = None
    project_id: Optional[UUID] = None
    task_id: Optional[UUID] = None

class WhiteboardCreate(WhiteboardBase):
    title: str
    data: Dict[str, Any]
    project_id: UUID

class WhiteboardUpdate(WhiteboardBase):
    pass

class WhiteboardPreviewIn(BaseModel):
    preview_image: str

class WhiteboardInDBBase(WhiteboardBase):
    id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class Whiteboard(WhiteboardInDBBase):
    pass

class WhiteboardSummary(BaseModel):
    """List entry: everything but the scene itself."""
    id: UUID
    title: str
    description: Optional[str] = None
    preview_image: Optional[str] = None
    project_id: UUID
    task_id: Optional[UUID] = None
    owner_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
