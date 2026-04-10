from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel

class SearchResult(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    type: str  # "project", "task", "idea"
    link: str
    status: Optional[str] = None
