from typing import List, Literal, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

FieldType = Literal["text", "number", "currency", "select", "date", "user", "checkbox", "url"]
AppliesTo = Literal["project", "task"]
Scope = Literal["global", "project"]


class CustomFieldDefCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    field_type: FieldType
    applies_to: AppliesTo = "task"
    options: List[str] = []
    unit: Optional[str] = Field(None, max_length=32, description="number only, e.g. h, kg, %")
    currency: Optional[str] = Field(None, description="currency only, ISO 4217 code; empty = the instance currency")
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    decimals: Optional[int] = Field(None, ge=0, le=6)
    position: Optional[int] = None


class CustomFieldDefUpdate(BaseModel):
    """The type and what the field applies to cannot change once defined; everything else can (null clears)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    options: Optional[List[str]] = None
    unit: Optional[str] = Field(None, max_length=32)
    currency: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    decimals: Optional[int] = Field(None, ge=0, le=6)
    position: Optional[int] = None


class CustomFieldDef(BaseModel):
    id: UUID
    project_id: Optional[UUID] = None
    scope: Scope = "project"
    applies_to: AppliesTo = "task"
    name: str
    field_type: FieldType
    options: List[str] = []
    unit: Optional[str] = None
    currency: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    decimals: Optional[int] = None
    position: int = 0
    model_config = ConfigDict(from_attributes=True)
