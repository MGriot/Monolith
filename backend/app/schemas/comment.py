from typing import Optional, List
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel
from app.schemas.user import User

class CommentBase(BaseModel):
    content: str
    parent_id: Optional[UUID] = None
    attachments: Optional[List[str]] = []
    links: Optional[List[str]] = []

class CommentCreate(CommentBase):
    project_id: Optional[UUID] = None
    task_id: Optional[UUID] = None
    idea_id: Optional[UUID] = None

class CommentUpdate(BaseModel):
    content: Optional[str] = None

class CommentResponse(CommentBase):
    id: UUID
    author_id: UUID
    project_id: Optional[UUID] = None
    task_id: Optional[UUID] = None
    idea_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    
    author: Optional[User] = None
    replies: List["CommentResponse"] = []

    class Config:
        from_attributes = True

# Resolve forward reference for recursive model
CommentResponse.model_rebuild()
