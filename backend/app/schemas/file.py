from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class FileBase(BaseModel):
    name: str
    url: str
    content: Optional[str] = None
    extension: Optional[str] = None
    size_bytes: Optional[int] = None
    folder_id: UUID

class FileCreate(FileBase):
    pass

class FileUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None

class File(FileBase):
    id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
