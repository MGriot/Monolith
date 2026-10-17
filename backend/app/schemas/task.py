from typing import Any, Dict, List, Literal, Optional, ForwardRef
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, computed_field, field_validator, model_validator
from app.core.enums import Status, Priority, DependencyType
from app.schemas.user import User as UserSchema
from app.schemas.metadata import Topic, WorkType
from .project import ProjectInDBBase

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
    topic_id: Optional[UUID] = None
    type_id: Optional[UUID] = None
    color: Optional[str] = None
    status: Optional[Status] = Status.TODO
    priority: Optional[Priority] = Priority.MEDIUM
    is_milestone: Optional[bool] = False
    deadline_at: Optional[datetime] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    tags: Optional[List[str]] = []
    attachments: Optional[List[str]] = []
    owner_id: Optional[UUID] = None
    # e.g. FREQ=WEEKLY;INTERVAL=2;BYDAY=MO  (null/empty = does not repeat)
    recurrence_rule: Optional[str] = None
    blocked_by_ids: Optional[List[UUID]] = []
    sort_index: Optional[int] = 0
    wbs_code: Optional[str] = None
    is_critical: Optional[bool] = False
    slack_days: Optional[int] = 0
    is_archived: bool = False
    archived_at: Optional[datetime] = None
    # PERT Estimation Fields
    optimistic_days: Optional[int] = 0
    normal_days: Optional[int] = 0
    pessimistic_days: Optional[int] = 0
    expected_duration_days: Optional[float] = 0.0
    duration_days: Optional[int] = 0
    # Financials
    budget: float = 0.0
    real_cost: float = 0.0
    # Risk Management
    risk_probability: int = 1
    risk_impact: int = 1
    # Dynamic Checklist
    checklist: List[dict] = []
    # Custom field values keyed by CustomFieldDef id (validated against the project's definitions)
    custom_values: Dict[str, Any] = {}

    @field_validator("recurrence_rule", mode="before")
    @classmethod
    def _valid_recurrence(cls, v):
        from app.core.recurrence import RecurrenceError, normalize

        try:
            return normalize(v)
        except RecurrenceError as e:
            raise ValueError(str(e))


class TaskShortCreate(BaseModel):
    title: str
    description: Optional[str] = None
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
    project_id: Optional[UUID] = None
    parent_id: Optional[UUID] = None
    subtasks: Optional[List[TaskShortCreate]] = []
    topic_ids: Optional[List[UUID]] = []
    type_ids: Optional[List[UUID]] = []
    assignee_ids: Optional[List[UUID]] = []

class TaskUpdate(TaskBase):
    topic_ids: Optional[List[UUID]] = None
    type_ids: Optional[List[UUID]] = None
    assignee_ids: Optional[List[UUID]] = None
    subtasks: Optional[List[TaskShortCreate]] = []

class TaskInDBBase(TaskBase):
    id: UUID
    project_id: Optional[UUID] = None
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
    topic_ref: Optional[Topic] = None
    type_ref: Optional[WorkType] = None
    topics: List[Topic] = []
    types: List[WorkType] = []
    project: Optional["ProjectInDBBase"] = None

    @computed_field
    @property
    def topic_ids(self) -> List[UUID]:
        return [t.id for t in self.topics]

    @computed_field
    @property
    def type_ids(self) -> List[UUID]:
        return [t.id for t in self.types]

    @computed_field
    @property
    def assignee_ids(self) -> List[UUID]:
        return [u.id for u in self.assignees] if hasattr(self, 'assignees') else []

# For recursive models in Pydantic V2
Task.model_rebuild()
TaskShortCreate.model_rebuild()

# Keep Subtask alias for backward compatibility during migration if needed
# but deprecated
Subtask = Task
SubtaskCreate = TaskCreate
SubtaskUpdate = TaskUpdate
SubtaskShortCreate = TaskShortCreate

# ---- bulk actions (POST /tasks/bulk) ----------------------------------------------------------------------------
BULK_MAX_IDS = 200


class BulkTaskPatch(BaseModel):
    """The only fields a bulk request may change; anything else is rejected (422)."""

    model_config = ConfigDict(extra="forbid")

    status: Optional[Status] = None
    priority: Optional[Priority] = None
    assignee_ids: Optional[List[UUID]] = None


class BulkTaskRequest(BaseModel):
    """Either a `patch` (status/priority/assignees) or an `action`, never both and never neither."""

    model_config = ConfigDict(extra="forbid")

    ids: List[UUID]
    patch: Optional[BulkTaskPatch] = None
    action: Optional[Literal["archive", "restore", "delete"]] = None

    @model_validator(mode="after")
    def _check(self):
        if not self.ids:
            raise ValueError("ids must not be empty")
        if len(self.ids) > BULK_MAX_IDS:
            raise ValueError(f"at most {BULK_MAX_IDS} ids per request")
        has_patch = self.patch is not None and bool(self.patch.model_fields_set)
        if has_patch == (self.action is not None):
            raise ValueError("send exactly one of `patch` (with at least one field) or `action`")
        return self


class BulkTaskResult(BaseModel):
    id: UUID
    ok: bool
    status_code: int = 200
    detail: Optional[str] = None


class BulkTaskResponse(BaseModel):
    results: List[BulkTaskResult]
    succeeded: int
    failed: int
