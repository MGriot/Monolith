from typing import List, Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from app.core.enums import Status

class ProjectBase(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    topic: Optional[str] = None
    type: Optional[str] = None
    status: Optional[Status] = Status.TODO
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    tags: Optional[List[str]] = []

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
    pass
