from typing import List, Optional, Any, Dict
from uuid import UUID
from pydantic import BaseModel, ConfigDict

class ProjectTemplateBase(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tasks_json: Optional[List[Dict[str, Any]]] = []
    is_active: Optional[bool] = True

# Using Dict[str, Any] for tasks_json for now, 
# but we could define a more rigid TemplateTask schema
from typing import Dict

class ProjectTemplateCreate(ProjectTemplateBase):
    name: str

class ProjectTemplateUpdate(ProjectTemplateBase):
    pass

class ProjectTemplate(ProjectTemplateBase):
    id: UUID
    owner_id: UUID
    
    model_config = ConfigDict(from_attributes=True)
