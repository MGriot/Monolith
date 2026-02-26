from typing import List, Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from .user import User as UserSchema

class WorkflowBase(BaseModel):
    title: str
    description: Optional[str] = None
    content: str
    is_public: Optional[bool] = False

class WorkflowCreate(WorkflowBase):
    shared_with_ids: Optional[List[UUID]] = []

class WorkflowUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    is_public: Optional[bool] = None
    shared_with_ids: Optional[List[UUID]] = []

class WorkflowInDBBase(WorkflowBase):
    id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class Workflow(WorkflowInDBBase):
    owner: Optional[UserSchema] = None
    shared_with: List[UserSchema] = []
