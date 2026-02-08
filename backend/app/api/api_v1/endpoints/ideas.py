from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, models, schemas
from app.api import deps
from app.crud.crud_idea import idea as crud_idea

router = APIRouter()

@router.get("/", response_model=List[schemas.idea.Idea])
async def read_ideas(
    project_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Retrieve ideas for a project.
    """
    # Check project access (implied by dependency but let's be safe)
    project = await crud.project.get(db, id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    return await crud_idea.get_multi_by_project(db, project_id=project_id, skip=skip, limit=limit)

@router.post("/", response_model=schemas.idea.Idea)
async def create_idea(
    *,
    db: AsyncSession = Depends(deps.get_db),
    idea_in: schemas.idea.IdeaCreate,
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Create a new idea.
    """
    # Check project existence
    project = await crud.project.get(db, id=idea_in.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    return await crud_idea.create(db, obj_in=idea_in, author_id=current_user.id)

@router.put("/{idea_id}", response_model=schemas.idea.Idea)
async def update_idea(
    *,
    db: AsyncSession = Depends(deps.get_db),
    idea_id: UUID,
    idea_in: schemas.idea.IdeaUpdate,
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Update an idea.
    """
    idea = await crud_idea.get(db, id=idea_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    # Check permission (author or project owner)
    project = await crud.project.get(db, id=idea.project_id)
    if idea.author_id != current_user.id and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    return await crud_idea.update(db, db_obj=idea, obj_in=idea_in)

@router.delete("/{idea_id}", response_model=schemas.idea.Idea)
async def delete_idea(
    *,
    db: AsyncSession = Depends(deps.get_db),
    idea_id: UUID,
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Delete an idea.
    """
    idea = await crud_idea.get(db, id=idea_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    project = await crud.project.get(db, id=idea.project_id)
    if idea.author_id != current_user.id and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    return await crud_idea.remove(db, id=idea_id)

@router.post("/{idea_id}/promote", response_model=schemas.task.Task)
async def promote_idea(
    *,
    db: AsyncSession = Depends(deps.get_db),
    idea_id: UUID,
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Promote an idea to a task.
    """
    idea = await crud_idea.get(db, id=idea_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    # Only project owner/admin can promote
    project = await crud.project.get(db, id=idea.project_id)
    if project.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only project owners can promote ideas")
        
    try:
        return await crud_idea.promote_to_task(db, idea_id=idea_id, owner_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
