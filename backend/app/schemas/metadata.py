from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict

# Topic Schemas
class TopicBase(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = "#64748b"
    is_active: Optional[bool] = True

class TopicCreate(TopicBase):
    name: str

class TopicUpdate(TopicBase):
    pass

class Topic(TopicBase):
    id: UUID
    model_config = ConfigDict(from_attributes=True)

# WorkType Schemas
class WorkTypeBase(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = True

class WorkTypeCreate(WorkTypeBase):
    name: str

class WorkTypeUpdate(WorkTypeBase):
    pass

class WorkType(WorkTypeBase):
    id: UUID
    model_config = ConfigDict(from_attributes=True)
