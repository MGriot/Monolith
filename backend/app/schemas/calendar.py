from typing import List, Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from app.core.enums import Status

class CalendarItem(BaseModel):
    id: UUID
    title: str
    item_type: str  # "project", "task", "subtask"
    status: Status
    start_date: Optional[datetime] = None
    due_date: datetime
    project_id: Optional[UUID] = None
    task_id: Optional[UUID] = None

class CalendarResponse(BaseModel):
    items: List[CalendarItem]
