from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, models, schemas
from app.api import deps
from app.crud.crud_idea_comment import idea_comment as crud_idea_comment

router = APIRouter()

@router.get("/{idea_id}/comments", response_model=List[schemas.idea_comment.IdeaComment])
async def read_idea_comments(
    idea_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve comments for an idea.
    """
    return await crud_idea_comment.get_multi_by_idea(db, idea_id=idea_id, skip=skip, limit=limit)

@router.post("/{idea_id}/comments", response_model=schemas.idea_comment.IdeaComment)
async def create_idea_comment(
    *,
    db: AsyncSession = Depends(deps.get_db),
    idea_id: UUID,
    comment_in: schemas.idea_comment.IdeaCommentBase,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Create a new comment for an idea.
    """
    # Check idea existence
    idea = await crud.idea.get(db, id=idea_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
        
    obj_in = schemas.idea_comment.IdeaCommentCreate(
        content=comment_in.content,
        idea_id=idea_id
    )
    return await crud_idea_comment.create(db, obj_in=obj_in, author_id=current_user.id)

@router.delete("/comments/{comment_id}", response_model=schemas.idea_comment.IdeaComment)
async def delete_idea_comment(
    *,
    db: AsyncSession = Depends(deps.get_db),
    comment_id: UUID,
    current_user: models.User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a comment.
    """
    comment = await crud_idea_comment.get(db, id=comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    if comment.author_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    return await crud_idea_comment.remove(db, id=comment_id)
