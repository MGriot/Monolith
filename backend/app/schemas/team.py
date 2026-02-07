from typing import List, Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from .user import User as UserSchema

class TeamBase(BaseModel):
    name: str
    description: Optional[str] = None

class TeamCreate(TeamBase):
    member_ids: Optional[List[UUID]] = []

class TeamUpdate(TeamBase):
    name: Optional[str] = None
    member_ids: Optional[List[UUID]] = []

class TeamInDBBase(TeamBase):
    id: UUID
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class Team(TeamInDBBase):
    members: List[UserSchema] = []
