from typing import Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import io
import pandas as pd
from datetime import datetime

from app.api import deps
from app.crud import crud_project, crud_task
from app.schemas.project import Project, ProjectCreate, ProjectUpdate
from app.models.user import User

router = APIRouter()

@router.get("/{project_id}/export")
async def export_project(
    project_id: UUID,
    format: str = Query("csv", regex="^(csv|excel)$"),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Export project tasks as CSV or Excel.
    """
    project = await crud_project.project.get(db, id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check permissions
    if not current_user.is_superuser and project.owner_id != current_user.id:
        member_ids = [m.id for m in project.members]
        if current_user.id not in member_ids:
            raise HTTPException(status_code=403, detail="Not enough permissions")

    # Fetch all tasks (flattened)
    # We need to fetch all tasks recursively. 
    # The current get_multi_by_project only gets top-level.
    # Let's use a helper to get all.
    from app.models.task import Task
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    
    # Simple query to get everything for this project
    query = select(Task).filter(Task.project_id == project_id).options(
        selectinload(Task.assignees),
        selectinload(Task.owner)
    ).order_by(Task.sort_index.asc(), Task.created_at.asc())
    
    res = await db.execute(query)
    all_tasks = res.scalars().all()
    
    # WBS calculation logic (frontend logic mirrored here or simple dump)
    # Since we have the data, let's prepare the list of dicts
    data = []
    for t in all_tasks:
        duration = 0
        if t.start_date and t.due_date:
            duration = (t.due_date - t.start_date).days + 1
        
        data.append({
            "WBS": t.wbs_code or "",
            "Title": t.title,
            "Description": t.description or "",
            "Status": t.status.value if hasattr(t.status, 'value') else str(t.status),
            "Priority": t.priority.value if hasattr(t.priority, 'value') else str(t.priority),
            "Start Date": t.start_date.strftime("%Y-%m-%d") if t.start_date else "",
            "Due Date": t.due_date.strftime("%Y-%m-%d") if t.due_date else "",
            "Deadline": t.deadline_at.strftime("%Y-%m-%d") if t.deadline_at else "",
            "Completed At": t.completed_at.strftime("%Y-%m-%d %H:%M") if t.completed_at else "",
            "Duration (Days)": duration,
            "Assignees": ", ".join([u.full_name or u.email for u in t.assignees]),
            "Milestone": "Yes" if t.is_milestone else "No",
            "Tags": ", ".join(t.tags or [])
        })

    df = pd.DataFrame(data)
    
    if format == "csv":
        stream = io.StringIO()
        df.to_csv(stream, index=False)
        response = StreamingResponse(
            io.BytesIO(stream.getvalue().encode()),
            media_type="text/csv",
        )
        filename = f"export_{project.name}_{datetime.now().strftime('%Y%m%d')}.csv"
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        return response
    else:
        # Excel
        stream = io.BytesIO()
        with pd.ExcelWriter(stream, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Tasks')
        
        response = StreamingResponse(
            io.BytesIO(stream.getvalue()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        filename = f"export_{project.name}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        return response

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
        # Use new method to fetch projects where user is owner OR member
        projects = await crud_project.project.get_multi_by_user(
            db, user_id=current_user.id, skip=skip, limit=limit
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
    from sqlalchemy import and_, or_
    from app.models.project import Project as ProjectModel
    from app.models.associations import project_members
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    query = select(ProjectModel).where(
        and_(
            ProjectModel.start_date != None,
            ProjectModel.due_date != None
        )
    ).options(
        selectinload(ProjectModel.topic_ref),
        selectinload(ProjectModel.type_ref),
        selectinload(ProjectModel.members),
        selectinload(ProjectModel.topics),
        selectinload(ProjectModel.types)
    )
    
    if not current_user.is_superuser:
        query = query.outerjoin(project_members).where(
            or_(
                ProjectModel.owner_id == current_user.id,
                project_members.c.user_id == current_user.id
            )
        ).distinct()
    
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

    project = await crud_project.project.get(db, id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check permissions
    if not current_user.is_superuser and project.owner_id != current_user.id:
        member_ids = [m.id for m in project.members]
        if current_user.id not in member_ids:
             raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Activity query: count all completed tasks in this project per day
    # Using unified Task model
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
    
    # Check permissions (Owner or Member)
    if not current_user.is_superuser and project.owner_id != current_user.id:
        member_ids = [m.id for m in project.members]
        if current_user.id not in member_ids:
            raise HTTPException(status_code=403, detail="Not enough permissions")
            
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
    
    # Only owner or superuser can update project settings/members
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="Only the project owner can update settings")
        
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
    
    # Only owner or superuser can delete
    if not current_user.is_superuser and (project.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="Only the project owner can delete the project")
        
    project = await crud_project.project.remove(db=db, id=project_id)
    return project
