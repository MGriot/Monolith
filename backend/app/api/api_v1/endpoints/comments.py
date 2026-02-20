from typing import Any, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api import deps
from app.crud.crud_comment import crud_comment
from app.schemas.comment import CommentCreate, CommentUpdate, CommentResponse
from app.models.user import User

router = APIRouter()

@router.get("/", response_model=List[CommentResponse])
async def read_comments(
    db: AsyncSession = Depends(deps.get_db),
    project_id: Optional[UUID] = Query(None),
    task_id: Optional[UUID] = Query(None),
    idea_id: Optional[UUID] = Query(None),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve threaded comments.
    Must provide exactly one of project_id, task_id, or idea_id.
    """
    param_count = sum(1 for x in [project_id, task_id, idea_id] if x is not None)
    if param_count != 1:
        raise HTTPException(
            status_code=400, 
            detail="Must provide exactly one of project_id, task_id, or idea_id"
        )
    
    if project_id:
        return await crud_comment.get_by_project(db, project_id=project_id)
    if task_id:
        return await crud_comment.get_by_task(db, task_id=task_id)
    if idea_id:
        return await crud_comment.get_by_idea(db, idea_id=idea_id)
    return []

@router.post("/", response_model=CommentResponse)
async def create_comment(
    *,
    db: AsyncSession = Depends(deps.get_db),
    comment_in: CommentCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new comment.
    """
    # Validation: Ensure linked to something
    if not any([comment_in.project_id, comment_in.task_id, comment_in.idea_id]):
         raise HTTPException(
            status_code=400, 
            detail="Comment must be linked to a project, task, or idea."
        )
    
    # Check if parent comment exists if provided
    if comment_in.parent_id:
        parent = await crud_comment.get(db, id=comment_in.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")
        
    comment = await crud_comment.create(db=db, obj_in=comment_in, author_id=current_user.id)
    return comment

@router.put("/{id}", response_model=CommentResponse)
async def update_comment(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    comment_in: CommentUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a comment.
    """
    comment = await crud_comment.get(db=db, id=id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.author_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    comment = await crud_comment.update(db=db, db_obj=comment, obj_in=comment_in)
    return comment

@router.delete("/{id}", response_model=CommentResponse)
async def delete_comment(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a comment.
    """
    comment = await crud_comment.get(db=db, id=id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.author_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    comment = await crud_comment.delete(db=db, id=id)
    return comment
