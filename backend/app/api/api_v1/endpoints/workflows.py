from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, models, schemas
from app.api import deps

router = APIRouter()

@router.get("/", response_model=List[schemas.workflow.Workflow])
async def read_workflows(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve workflows.
    """
    if current_user.is_superuser:
        workflows = await crud.workflow.get_multi(db, skip=skip, limit=limit)
    else:
        workflows = await crud.workflow.get_multi_by_user(
            db, user_id=current_user.id, skip=skip, limit=limit
        )
    return workflows

@router.post("/", response_model=schemas.workflow.Workflow)
async def create_workflow(
    *,
    db: AsyncSession = Depends(deps.get_db),
    obj_in: schemas.workflow.WorkflowCreate,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new workflow.
    """
    workflow = await crud.workflow.create_with_owner(db, obj_in=obj_in, owner_id=current_user.id)
    return workflow

@router.put("/{id}", response_model=schemas.workflow.Workflow)
async def update_workflow(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    obj_in: schemas.workflow.WorkflowUpdate,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a workflow.
    """
    workflow = await crud.workflow.get(db, id=id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    is_owner = workflow.owner_id == current_user.id
    is_shared = any(u.id == current_user.id for u in workflow.shared_with)
    
    if not current_user.is_superuser and not is_owner and not is_shared:
        raise HTTPException(status_code=403, detail="Not enough permissions to modify this workflow")
        
    workflow = await crud.workflow.update(db, db_obj=workflow, obj_in=obj_in)
    return workflow

@router.get("/{id}", response_model=schemas.workflow.Workflow)
async def read_workflow(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Get workflow by ID.
    """
    workflow = await crud.workflow.get(db, id=id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    if workflow.is_public:
        return workflow
        
    is_owner = workflow.owner_id == current_user.id
    is_shared = any(u.id == current_user.id for u in workflow.shared_with)
    
    if not current_user.is_superuser and not is_owner and not is_shared:
        raise HTTPException(status_code=403, detail="Not enough permissions to view this workflow")
        
    return workflow

@router.delete("/{id}", response_model=schemas.workflow.Workflow)
async def delete_workflow(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a workflow.
    """
    workflow = await crud.workflow.get(db, id=id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not current_user.is_superuser and workflow.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete this workflow")
    workflow = await crud.workflow.remove(db, id=id)
    return workflow
