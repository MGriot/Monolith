from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from app.api import deps
from app.schemas.ai import TaskDecompositionRequest, TaskDecompositionResponse, SubtaskSuggestion
from app.core.llm import llm_service
from app.models.user import User

router = APIRouter()

@router.post("/decompose", response_model=TaskDecompositionResponse)
async def decompose_task(
    *,
    request: TaskDecompositionRequest,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Suggest subtasks for a given task using AI.
    """
    try:
        suggestions = await llm_service.decompose_task(
            title=request.title,
            description=request.description
        )
        
        # Format the result to match the schema
        subtasks = []
        for s in suggestions:
            if isinstance(s, dict) and "title" in s:
                subtasks.append(SubtaskSuggestion(
                    title=s["title"],
                    description=s.get("description")
                ))
            elif isinstance(s, str):
                subtasks.append(SubtaskSuggestion(title=s))
        
        if not subtasks:
            raise HTTPException(status_code=500, detail="AI failed to generate valid subtasks.")
            
        return TaskDecompositionResponse(subtasks=subtasks)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"AI Decomposition error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")
