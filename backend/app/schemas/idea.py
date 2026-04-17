from typing import Optional, List
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, computed_field
from app.core.enums import IdeaStatus
from app.schemas.user import User as UserSchema
from app.schemas.comment import CommentResponse

class IdeaBase(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[IdeaStatus] = IdeaStatus.PROPOSED

class IdeaCreate(IdeaBase):
    title: str
    project_id: UUID
    task_id: Optional[UUID] = None

class IdeaUpdate(IdeaBase):
    pass

class IdeaInDBBase(IdeaBase):
    id: UUID
    project_id: UUID
    task_id: Optional[UUID] = None
    author_id: Optional[UUID] = None
    converted_task_id: Optional[UUID] = None
    promoted_project_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class Idea(IdeaInDBBase):
    author: Optional[UserSchema] = None
    vote_count: int = 0
    has_voted: bool = False
    downvote_count: int = 0
    has_downvoted: bool = False

    @computed_field
    @property
    def comment_count(self) -> int:
        return len(getattr(self, "threaded_comments", []))

