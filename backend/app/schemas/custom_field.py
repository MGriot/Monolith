from typing import List, Literal, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

FieldType = Literal["text", "number", "select", "date", "user"]


class CustomFieldDefCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    field_type: FieldType
    options: List[str] = []
    position: Optional[int] = None


class CustomFieldDefUpdate(BaseModel):
    """The type cannot change once defined; rename, re-order and edit select options only."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    options: Optional[List[str]] = None
    position: Optional[int] = None


class CustomFieldDef(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    field_type: FieldType
    options: List[str] = []
    position: int = 0
    model_config = ConfigDict(from_attributes=True)
