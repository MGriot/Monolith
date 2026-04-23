from typing import Any, List, Optional
import os
import shutil
import uuid
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from app.api import deps
from app.crud.crud_comment import crud_comment
from app.crud import crud_project, crud_task, crud_idea
from app.schemas.comment import CommentCreate, CommentUpdate, CommentResponse
from app.models.user import User
from app.core.config import settings

router = APIRouter()

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'}

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

@router.post("/upload")
async def upload_comment_image(
    file: UploadFile = File(...),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Upload an image for a comment.
    """
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return {"url": f"/uploads/{unique_filename}"}

@router.get("/available-images")
async def get_available_images(
    db: AsyncSession = Depends(deps.get_db),
    project_id: Optional[UUID] = Query(None),
    task_id: Optional[UUID] = Query(None),
    idea_id: Optional[UUID] = Query(None),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get all images and whiteboards available in the current context.
    """
    from sqlalchemy import select
    from app.models.task import Task
    from app.models.project import Project
    from app.models.idea import Idea
    from app.models.whiteboard import Whiteboard

    assets = []
    
    def is_image(url: str) -> bool:
        ext = os.path.splitext(url.lower())[1]
        return ext in IMAGE_EXTENSIONS

    # 1. Contextualize Project ID
    effective_project_id = project_id
    if task_id:
        task = await crud_task.task.get(db, id=task_id)
        if task: effective_project_id = task.project_id
    elif idea_id:
        idea = await crud_idea.idea.get(db, id=idea_id)
        if idea: effective_project_id = idea.project_id

    # 2. Fetch Project Whiteboards
    if effective_project_id:
        wb_res = await db.execute(select(Whiteboard).filter(Whiteboard.project_id == effective_project_id))
        whiteboards = wb_res.scalars().all()
        for wb in whiteboards:
            if wb.preview_image:
                assets.append({
                    "url": wb.preview_image,
                    "name": wb.title,
                    "source": "Whiteboard",
                    "is_whiteboard": True,
                    "whiteboard_id": str(wb.id)
                })

    # 3. Fetch Task Attachments
    if task_id:
        task = await crud_task.task.get(db, id=task_id)
        if task:
            for attr in (task.attachments or []):
                if is_image(attr):
                    assets.append({"url": attr, "name": os.path.basename(attr), "source": "Task"})

    # 4. Fetch Project Attachments
    if effective_project_id:
        project = await crud_project.project.get(db, id=effective_project_id)
        if project:
            for attr in (project.attachments or []):
                if is_image(attr):
                    # Deduplicate
                    if not any(a["url"] == attr for a in assets):
                        assets.append({"url": attr, "name": os.path.basename(attr), "source": "Project"})
            
            # ALL task images in this project
            result = await db.execute(select(Task.attachments).filter(Task.project_id == effective_project_id))
            all_task_attachments = result.scalars().all()
            for task_attrs in all_task_attachments:
                if task_attrs:
                    for attr in task_attrs:
                        if is_image(attr):
                            if not any(a["url"] == attr for a in assets):
                                assets.append({"url": attr, "name": os.path.basename(attr), "source": "Tasks"})

    return assets

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
