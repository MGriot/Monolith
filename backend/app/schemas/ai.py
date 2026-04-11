from typing import List, Optional
from pydantic import BaseModel

class TaskDecompositionRequest(BaseModel):
    title: str
    description: Optional[str] = None

class SubtaskSuggestion(BaseModel):
    title: str
    description: Optional[str] = None

class TaskDecompositionResponse(BaseModel):
    subtasks: List[SubtaskSuggestion]
