from typing import List, Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from app.core.enums import Status

from .metadata import Topic, WorkType
from .user import User as UserSchema

class ProjectBase(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    topic: Optional[str] = None
    type: Optional[str] = None
    topic_id: Optional[UUID] = None
    type_id: Optional[UUID] = None
    topic_ids: Optional[List[UUID]] = []
    type_ids: Optional[List[UUID]] = []
    member_ids: Optional[List[UUID]] = []
    status: Optional[Status] = Status.TODO
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    tags: Optional[List[str]] = []
    is_archived: bool = False
    archived_at: Optional[datetime] = None

class ProjectCreate(ProjectBase):
    name: str

class ProjectUpdate(ProjectBase):
    pass

class ProjectInDBBase(ProjectBase):
    id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime
    progress_percent: float

    class Config:
        from_attributes = True

class Project(ProjectInDBBase):
    topic_ref: Optional[Topic] = None
    type_ref: Optional[WorkType] = None
    topics: List[Topic] = []
    types: List[WorkType] = []
    members: List[UserSchema] = []
