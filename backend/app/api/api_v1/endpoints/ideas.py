from typing import Any, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, models, schemas
from app.api import deps
from app.crud.crud_idea import idea as crud_idea

router = APIRouter()

@router.get("/", response_model=List[schemas.idea.Idea])
async def read_ideas(
    project_id: Optional[UUID] = Query(None),
    task_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve ideas. If project_id is provided, filters by project.
    Otherwise, returns all ideas relevant to the current user.
    """
    if project_id:
        # Check project access (implied by dependency but let's be safe)
        project = await crud.project.get(db, id=project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
            
        return await crud_idea.get_multi_by_project(db, project_id=project_id, task_id=task_id, skip=skip, limit=limit, current_user_id=current_user.id)
    
    return await crud_idea.get_multi_by_user(db, user_id=current_user.id, skip=skip, limit=limit, current_user_id=current_user.id)

@router.post("/{idea_id}/vote")
async def vote_idea(
    *,
    db: AsyncSession = Depends(deps.get_db),
    idea_id: UUID,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Toggle vote for an idea.
    """
    idea = await crud_idea.get(db, id=idea_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    voted = await crud_idea.toggle_vote(db, idea_id=idea_id, user_id=current_user.id)
    return {"voted": voted}

@router.post("/{idea_id}/downvote")
async def downvote_idea(
    *,
    db: AsyncSession = Depends(deps.get_db),
    idea_id: UUID,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Toggle downvote for an idea.
    """
    idea = await crud_idea.get(db, id=idea_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    voted = await crud_idea.toggle_downvote(db, idea_id=idea_id, user_id=current_user.id)
    return {"voted": voted}

@router.post("/{idea_id}/promote-project", response_model=schemas.project.Project)
async def promote_idea_to_project(
    *,
    db: AsyncSession = Depends(deps.get_db),
    idea_id: UUID,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Promote an idea to a project.
    """
    idea = await crud_idea.get(db, id=idea_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    # Only project owner/admin can promote
    project = await crud.project.get(db, id=idea.project_id)
    if project.owner_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only project owners can promote ideas")
        
    try:
        return await crud_idea.promote_to_project(db, idea_id=idea_id, owner_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/", response_model=schemas.idea.Idea)
async def create_idea(
    *,
    db: AsyncSession = Depends(deps.get_db),
    idea_in: schemas.idea.IdeaCreate,
    current_user: models.User = Depends(deps.get_current_user),
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
    current_user: models.User = Depends(deps.get_current_user),
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
    current_user: models.User = Depends(deps.get_current_user),
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
    current_user: models.User = Depends(deps.get_current_user),
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
