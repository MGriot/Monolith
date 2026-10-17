from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AutomationRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    enabled: bool = True
    trigger: str
    conditions: List[Dict[str, Any]] = []
    actions: List[Dict[str, Any]]


class AutomationRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    enabled: Optional[bool] = None
    trigger: Optional[str] = None
    conditions: Optional[List[Dict[str, Any]]] = None
    actions: Optional[List[Dict[str, Any]]] = None


class AutomationRule(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    enabled: bool
    trigger: str
    conditions: List[Dict[str, Any]]
    actions: List[Dict[str, Any]]
    created_by: Optional[UUID] = None
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class AutomationRun(BaseModel):
    id: UUID
    rule_id: UUID
    task_id: Optional[UUID] = None
    status: str
    message: Optional[str] = None
    ran_at: datetime
    model_config = ConfigDict(from_attributes=True)
