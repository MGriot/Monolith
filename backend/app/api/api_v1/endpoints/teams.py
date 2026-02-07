from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, models, schemas
from app.api import deps

router = APIRouter()

@router.get("/", response_model=List[schemas.team.Team])
async def read_teams(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve teams. Admins see all, users see their teams.
    """
    if current_user.is_superuser:
        teams = await crud.team.get_multi(db, skip=skip, limit=limit)
    else:
        teams = await crud.team.get_multi_by_user(
            db, user_id=current_user.id, skip=skip, limit=limit
        )
    return teams

@router.post("/", response_model=schemas.team.Team)
async def create_team(
    *,
    db: AsyncSession = Depends(deps.get_db),
    obj_in: schemas.team.TeamCreate,
    current_user: models.user.User = Depends(deps.get_current_admin),
) -> Any:
    """
    Create new team. Restricted to superusers.
    """
    team = await crud.team.create(db, obj_in=obj_in)
    return team

@router.put("/{id}", response_model=schemas.team.Team)
async def update_team(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    obj_in: schemas.team.TeamUpdate,
    current_user: models.user.User = Depends(deps.get_current_admin),
) -> Any:
    """
    Update a team. Restricted to superusers.
    """
    team = await crud.team.get(db, id=id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    team = await crud.team.update(db, db_obj=team, obj_in=obj_in)
    return team

@router.get("/{id}", response_model=schemas.team.Team)
async def read_team(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Get team by ID.
    """
    team = await crud.team.get(db, id=id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # Check permissions: admin or member
    if not current_user.is_superuser:
        member_ids = [m.id for m in team.members]
        if current_user.id not in member_ids:
            raise HTTPException(status_code=403, detail="Not enough permissions")
            
    return team

@router.delete("/{id}", response_model=schemas.team.Team)
async def delete_team(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: models.user.User = Depends(deps.get_current_admin),
) -> Any:
    """
    Delete a team. Restricted to superusers.
    """
    team = await crud.team.get(db, id=id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    team = await crud.team.remove(db, id=id)
    return team
