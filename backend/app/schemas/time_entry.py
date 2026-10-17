from datetime import date, datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.schemas.user import User as UserSchema


class TimerStart(BaseModel):
    note: Optional[str] = Field(None, max_length=1000)


class TimeEntryCreate(BaseModel):
    """A manual entry: both ends are required."""
    started_at: datetime
    ended_at: datetime
    note: Optional[str] = Field(None, max_length=1000)

    @model_validator(mode="after")
    def _ordered(self):
        if self.ended_at < self.started_at:
            raise ValueError("ended_at must not be before started_at")
        return self


class TimeEntryUpdate(BaseModel):
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    note: Optional[str] = Field(None, max_length=1000)


class TimeEntry(BaseModel):
    id: UUID
    task_id: UUID
    user_id: UUID
    started_at: datetime
    ended_at: Optional[datetime] = None
    note: Optional[str] = None
    duration_seconds: int = 0
    user: Optional[UserSchema] = None
    model_config = ConfigDict(from_attributes=True)


class TaskTimeSummary(BaseModel):
    task_id: UUID
    total_seconds: int
    entry_count: int
    running: bool
    estimate_hours: float
    actual_hours: float
    variance_hours: float
    percent_of_estimate: Optional[float] = None


class TaskTimeResponse(BaseModel):
    summary: TaskTimeSummary
    entries: List[TimeEntry]


class TimesheetRow(BaseModel):
    user_id: UUID
    user_name: Optional[str] = None
    project_id: Optional[UUID] = None
    project_name: Optional[str] = None
    total_seconds: int
    entry_count: int


class Timesheet(BaseModel):
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    total_seconds: int
    rows: List[TimesheetRow]
