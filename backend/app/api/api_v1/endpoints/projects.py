from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.crud import crud_project
from app.schemas.project import Project, ProjectCreate, ProjectUpdate
from app.models.user import User

router = APIRouter()

@router.get("/", response_model=List[Project])
async def read_projects(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve projects.
    """
    if current_user.is_superuser:
        projects = await crud_project.project.get_multi(db, skip=skip, limit=limit)
    else:
        projects = await crud_project.project.get_multi_by_owner(
            db, owner_id=current_user.id, skip=skip, limit=limit
        )
    return projects

@router.post("/", response_model=Project)
async def create_project(
    *,
    db: AsyncSession = Depends(deps.get_db),
    project_in: ProjectCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new project.
    """
    project = await crud_project.project.create_with_owner(
        db=db, obj_in=project_in, owner_id=current_user.id
    )
    return project

@router.get("/gantt", response_model=List[Project])
async def read_projects_gantt(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve projects for Gantt view (those with start and due dates).
    """
    from sqlalchemy import and_
    from app.models.project import Project as ProjectModel
    from sqlalchemy import select

    query = select(ProjectModel).where(
        and_(
            ProjectModel.start_date != None,
            ProjectModel.due_date != None
        )
    )
    
    if not current_user.is_superuser:
        query = query.where(ProjectModel.owner_id == current_user.id)
    
    result = await db.execute(query)
    projects = result.scalars().all()
    return projects

@router.get("/{project_id}/statistics", response_model=Any)
async def read_project_statistics(
    project_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get project statistics (activity data for heatmap).
    """
    from sqlalchemy import func
    from app.models.task import Task
    from app.models.project import Project as ProjectModel
    from sqlalchemy import select

    project = await db.get(ProjectModel, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Simple activity query: count completed tasks per day
    query = select(
        func.date(Task.completed_at).label("date"),
        func.count(Task.id).label("count")
    ).where(
        Task.project_id == project_id,
        Task.completed_at != None
    ).group_by(
        func.date(Task.completed_at)
    )

    result = await db.execute(query)
    stats = result.all()
    
    return [{"date": str(s.date), "count": s.count} for s in stats]

@router.get("/{project_id}", response_model=Project)
async def read_project(
    project_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get project by ID.
    """
    project = await crud_project.project.get(db, id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    return project

@router.put("/{project_id}", response_model=Project)
async def update_project(
    *,
    db: AsyncSession = Depends(deps.get_db),
    project_id: UUID,
    project_in: ProjectUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a project.
    """
    project = await crud_project.project.get(db, id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    project = await crud_project.project.update(db=db, db_obj=project, obj_in=project_in)
    return project

@router.delete("/{project_id}", response_model=Project)
async def delete_project(
    *,
    db: AsyncSession = Depends(deps.get_db),
    project_id: UUID,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a project.
    """
    project = await crud_project.project.get(db, id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    project = await crud_project.project.remove(db=db, id=project_id)
    return project
