from typing import List, Optional, ForwardRef
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from app.core.enums import Status, Priority, DependencyType
from app.schemas.user import User as UserSchema

class DependencyBase(BaseModel):
    successor_id: UUID
    predecessor_id: UUID
    type: DependencyType = DependencyType.FS
    lag_days: int = 0

class DependencyCreate(DependencyBase):
    pass

class Dependency(DependencyBase):
    id: UUID
    model_config = ConfigDict(from_attributes=True)

class TaskBase(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    topic: Optional[str] = None
    type: Optional[str] = None
    status: Optional[Status] = Status.TODO
    priority: Optional[Priority] = Priority.MEDIUM
    is_milestone: Optional[bool] = False
    deadline_at: Optional[datetime] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    tags: Optional[List[str]] = []
    attachments: Optional[List[str]] = []
    owner_id: Optional[UUID] = None
    blocked_by_ids: Optional[List[UUID]] = []
    assignee_ids: Optional[List[UUID]] = []
    sort_index: Optional[int] = 0
    wbs_code: Optional[str] = None

class TaskShortCreate(BaseModel):
    title: str
    status: Optional[Status] = Status.TODO
    priority: Optional[Priority] = Priority.MEDIUM
    is_milestone: Optional[bool] = False
    deadline_at: Optional[datetime] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    assignee_ids: Optional[List[UUID]] = []
    # Nested subtasks allowed even here
    subtasks: Optional[List["TaskShortCreate"]] = []

class TaskCreate(TaskBase):
    title: str
    project_id: UUID
    parent_id: Optional[UUID] = None
    subtasks: Optional[List[TaskShortCreate]] = []

class TaskUpdate(TaskBase):
    parent_id: Optional[UUID] = None

class TaskInDBBase(TaskBase):
    id: UUID
    project_id: UUID
    parent_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    owner: Optional[UserSchema] = None
    assignees: List[UserSchema] = []
    
    model_config = ConfigDict(from_attributes=True)

class Task(TaskInDBBase):
    subtasks: List["Task"] = []
    blocked_by: List[Dependency] = []
    blocking: List[Dependency] = []

# For recursive models in Pydantic V2
Task.model_rebuild()
TaskShortCreate.model_rebuild()

# Keep Subtask alias for backward compatibility during migration if needed
# but deprecated
Subtask = Task
SubtaskCreate = TaskCreate
SubtaskUpdate = TaskUpdate
SubtaskShortCreate = TaskShortCreate