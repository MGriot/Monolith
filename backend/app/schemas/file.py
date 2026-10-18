from typing import List, Optional
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
    # Move to another folder of the same project / task.
    folder_id: Optional[UUID] = None
    # Replace the file's topic tags.
    topic_ids: Optional[List[UUID]] = None


class FileTopic(BaseModel):
    id: UUID
    name: str
    color: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class File(FileBase):
    id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime
    topics: List[FileTopic] = []

    model_config = ConfigDict(from_attributes=True)
