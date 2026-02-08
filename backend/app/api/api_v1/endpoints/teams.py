from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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

@router.get("/activity", response_model=Any)
async def read_team_activity(
    db: AsyncSession = Depends(deps.get_db),
    current_user: models.user.User = Depends(deps.get_current_user),
    limit: int = 20
) -> Any:
    """
    Retrieve recent activity (completions) from teammates.
    """
    from app.models.task import Task
    from app.models.associations import team_members
    from sqlalchemy import select, desc, and_
    
    # 1. Find all teammates (users in the same teams as current_user)
    team_ids_query = select(team_members.c.team_id).where(team_members.c.user_id == current_user.id)
    team_ids_result = await db.execute(team_ids_query)
    team_ids = team_ids_result.scalars().all()
    
    if not team_ids:
        return []
        
    teammates_query = select(team_members.c.user_id).where(team_members.c.team_id.in_(team_ids))
    teammates_result = await db.execute(teammates_query)
    teammate_ids = set(teammates_result.scalars().all())
    
    if current_user.id in teammate_ids:
        teammate_ids.remove(current_user.id)
        
    if not teammate_ids:
        return []

    # 2. Fetch recent completions by these users
    from app.models.associations import task_assignees
    query = (
        select(Task)
        .join(task_assignees)
        .filter(task_assignees.c.user_id.in_(teammate_ids))
        .filter(Task.completed_at != None)
        .order_by(desc(Task.completed_at))
        .limit(limit)
        .options(selectinload(Task.project), selectinload(Task.assignees))
    )
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    return [
        {
            "id": t.id,
            "title": t.title,
            "completed_at": t.completed_at,
            "project_name": t.project.name if t.project else "Unknown",
            "project_id": t.project_id,
            "user": {
                "full_name": next((u.full_name for u in t.assignees if u.id in teammate_ids), "Teammate"),
                "email": next((u.email for u in t.assignees if u.id in teammate_ids), "")
            }
        }
        for t in tasks
    ]

@router.post("/", response_model=schemas.team.Team)
async def create_team(
    *,
    db: AsyncSession = Depends(deps.get_db),
    obj_in: schemas.team.TeamCreate,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new team.
    """
    obj_in.owner_id = current_user.id
    team = await crud.team.create(db, obj_in=obj_in)
    return team

@router.put("/{id}", response_model=schemas.team.Team)
async def update_team(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    obj_in: schemas.team.TeamUpdate,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a team. Owners and admins only.
    """
    team = await crud.team.get(db, id=id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if not current_user.is_superuser and team.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions to manage this team")
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
    
    # Check permissions: admin or owner or member
    if not current_user.is_superuser and team.owner_id != current_user.id:
        member_ids = [m.id for m in team.members]
        if current_user.id not in member_ids:
            raise HTTPException(status_code=403, detail="Not enough permissions to view this team")
            
    return team

@router.delete("/{id}", response_model=schemas.team.Team)
async def delete_team(
    *,
    db: AsyncSession = Depends(deps.get_db),
    id: UUID,
    current_user: models.user.User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a team. Owners and admins only.
    """
    team = await crud.team.get(db, id=id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if not current_user.is_superuser and team.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions to delete this team")
    team = await crud.team.remove(db, id=id)
    return team
