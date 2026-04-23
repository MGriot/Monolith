from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from enum import Enum

class FolderType(str, Enum):
    GENERIC = "generic"
    MEDIA = "media"
    NOTES = "notes"

class FolderBase(BaseModel):
    name: str
    type: FolderType = FolderType.GENERIC
    parent_id: Optional[UUID] = None
    project_id: Optional[UUID] = None
    task_id: Optional[UUID] = None

class FolderCreate(FolderBase):
    pass

class FolderUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[FolderType] = None

class Folder(FolderBase):
    id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime
    
    # Recursive and related
    subfolders: List["Folder"] = []
    files: List["File"] = [] # Forward ref

    model_config = ConfigDict(from_attributes=True)

from .file import File
Folder.model_rebuild()
