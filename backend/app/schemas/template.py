from typing import List, Optional, Any, Dict
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from .user import User as UserSchema

class ProjectTemplateBase(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tasks_json: Optional[List[Dict[str, Any]]] = []
    topics_preset: Optional[List[Dict[str, Any]]] = []
    work_types_preset: Optional[List[Dict[str, Any]]] = []
    allowed_global_topics: Optional[List[UUID]] = []
    allowed_global_work_types: Optional[List[UUID]] = []
    is_active: Optional[bool] = True
    is_public: Optional[bool] = False
    shared_with_ids: Optional[List[UUID]] = []

class ProjectTemplateCreate(ProjectTemplateBase):
    name: str

class ProjectTemplateUpdate(ProjectTemplateBase):
    pass

class ProjectTemplate(ProjectTemplateBase):
    id: UUID
    owner_id: UUID
    shared_with: List[UserSchema] = []
    
    model_config = ConfigDict(from_attributes=True)
