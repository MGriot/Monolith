from typing import List, Optional
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from .user import User as UserSchema

class TeamBase(BaseModel):
    name: str
    description: Optional[str] = None
    owner_id: Optional[UUID] = None
    is_public: Optional[bool] = False

class TeamCreate(TeamBase):
    member_ids: Optional[List[UUID]] = []
    shared_with_ids: Optional[List[UUID]] = []

class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None
    member_ids: Optional[List[UUID]] = []
    shared_with_ids: Optional[List[UUID]] = []

class TeamInDBBase(TeamBase):
    id: UUID
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class Team(TeamInDBBase):
    members: List[UserSchema] = []
    owner: Optional[UserSchema] = None
    shared_with: List[UserSchema] = []
