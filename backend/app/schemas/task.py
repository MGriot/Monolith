from typing import List, Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from app.core.enums import Status, Priority
from app.schemas.user import User as UserSchema

class SubtaskBase(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    topic: Optional[str] = None
    type: Optional[str] = None
    status: Optional[Status] = Status.TODO
    priority: Optional[Priority] = Priority.MEDIUM
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    tags: Optional[List[str]] = []
    attachments: Optional[List[str]] = []
    owner_id: Optional[UUID] = None
    assignee_ids: Optional[List[UUID]] = []

class SubtaskCreate(SubtaskBase):
    title: str
    task_id: UUID

class SubtaskShortCreate(BaseModel):
    title: str
    status: Optional[Status] = Status.TODO
    priority: Optional[Priority] = Priority.MEDIUM
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    assignee_ids: Optional[List[UUID]] = []

class SubtaskUpdate(SubtaskBase):
    pass

class SubtaskInDBBase(SubtaskBase):
    id: UUID
    task_id: UUID
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    owner: Optional[UserSchema] = None
    assignees: List[UserSchema] = []

    class Config:
        from_attributes = True

class Subtask(SubtaskInDBBase):
    pass

class TaskBase(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    topic: Optional[str] = None
    type: Optional[str] = None
    status: Optional[Status] = Status.TODO
    priority: Optional[Priority] = Priority.MEDIUM
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    tags: Optional[List[str]] = []
    attachments: Optional[List[str]] = []
    owner_id: Optional[UUID] = None
    blocked_by_ids: Optional[List[UUID]] = []
    assignee_ids: Optional[List[UUID]] = []

class TaskCreate(TaskBase):
    title: str
    project_id: UUID
    subtasks: Optional[List[SubtaskShortCreate]] = []

class TaskUpdate(TaskBase):
    pass

class TaskInDBBase(TaskBase):
    id: UUID
    project_id: UUID
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    owner: Optional[UserSchema] = None
    assignees: List[UserSchema] = []

    class Config:
        from_attributes = True

class Task(TaskInDBBase):
    pass
