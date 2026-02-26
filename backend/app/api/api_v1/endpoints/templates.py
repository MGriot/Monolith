from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, models, schemas
from app.api import deps

router = APIRouter()

@router.get("/", response_model=List[schemas.template.ProjectTemplate])
async def read_templates(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve templates.
    """
    if current_user.is_superuser:
        templates = await crud.project_template.get_multi(db, skip=skip, limit=limit)
    else:
        templates = await crud.project_template.get_multi_by_user(
            db, user_id=current_user.id, skip=skip, limit=limit
        )
    return templates

@router.post("/", response_model=schemas.template.ProjectTemplate)
async def create_template(
    *,
    db: AsyncSession = Depends(deps.get_db),
    obj_in: schemas.template.ProjectTemplateCreate,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new template.
    """
    template = await crud.project_template.create_with_owner(
        db, obj_in=obj_in, owner_id=current_user.id
    )
    return template

@router.put("/{id}", response_model=schemas.template.ProjectTemplate)
async def update_template(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    obj_in: schemas.template.ProjectTemplateUpdate,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a template.
    """
    template = await crud.project_template.get(db, id=id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Check if user is owner or co-owner (shared_with)
    is_owner = template.owner_id == current_user.id
    is_shared = any(u.id == current_user.id for u in template.shared_with)
    
    if not current_user.is_superuser and not is_owner and not is_shared:
        raise HTTPException(status_code=403, detail="Not enough permissions to modify this template")
        
    template = await crud.project_template.update(db, db_obj=template, obj_in=obj_in)
    return template

@router.get("/{id}", response_model=schemas.template.ProjectTemplate)
async def read_template(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Get template by ID.
    """
    template = await crud.project_template.get(db, id=id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    # Public templates are readable by anyone
    if template.is_public:
        return template
        
    is_owner = template.owner_id == current_user.id
    is_shared = any(u.id == current_user.id for u in template.shared_with)
    
    if not current_user.is_superuser and not is_owner and not is_shared:
        raise HTTPException(status_code=403, detail="Not enough permissions to view this template")
    return template

@router.delete("/{id}", response_model=schemas.template.ProjectTemplate)
async def delete_template(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a template.
    """
    template = await crud.project_template.get(db, id=id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    if not current_user.is_superuser and (template.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="Only the owner can delete this template")
        
    template = await crud.project_template.remove(db, id=id)
    return template
