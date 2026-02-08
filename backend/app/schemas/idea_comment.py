from typing import Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from app.schemas.user import User as UserSchema

class IdeaCommentBase(BaseModel):
    content: str

class IdeaCommentCreate(IdeaCommentBase):
    idea_id: UUID

class IdeaCommentUpdate(IdeaCommentBase):
    pass

class IdeaCommentInDBBase(IdeaCommentBase):
    id: UUID
    idea_id: UUID
    author_id: UUID
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class IdeaComment(IdeaCommentInDBBase):
    author: Optional[UserSchema] = None
