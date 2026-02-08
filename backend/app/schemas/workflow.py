from typing import Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from .user import User as UserSchema

class WorkflowBase(BaseModel):
    title: str
    description: Optional[str] = None
    content: str

class WorkflowCreate(WorkflowBase):
    pass

class WorkflowUpdate(WorkflowBase):
    title: Optional[str] = None
    content: Optional[str] = None

class WorkflowInDBBase(WorkflowBase):
    id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class Workflow(WorkflowInDBBase):
    owner: Optional[UserSchema] = None
