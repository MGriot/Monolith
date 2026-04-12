from typing import List, Dict
from pydantic import BaseModel

class DayWorkload(BaseModel):
    date: str
    hours: float
    task_count: int

class UserWorkload(BaseModel):
    user_id: str
    user_name: str
    workload: List[DayWorkload]
    is_overallocated: bool = False

class TeamWorkloadResponse(BaseModel):
    users: List[UserWorkload]
