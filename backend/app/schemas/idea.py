from typing import Optional, List
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from app.core.enums import IdeaStatus
from app.schemas.user import User as UserSchema
from app.schemas.idea_comment import IdeaComment

class IdeaBase(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[IdeaStatus] = IdeaStatus.PROPOSED

class IdeaCreate(IdeaBase):
    title: str
    project_id: UUID

class IdeaUpdate(IdeaBase):
    pass

class IdeaInDBBase(IdeaBase):
    id: UUID
    project_id: UUID
    author_id: Optional[UUID] = None
    converted_task_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class Idea(IdeaInDBBase):
    author: Optional[UserSchema] = None
    comments: List[IdeaComment] = []

