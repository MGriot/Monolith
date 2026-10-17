from typing import Any, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, field_validator
import io
import pandas as pd
from datetime import datetime

from app.api import deps
from app.api.access import ADMIN, ROLES, project_role, require_project_access
from app.db.transaction import commit
from app.crud import crud_project, crud_task
from app.schemas.project import Project, ProjectCreate, ProjectUpdate
from app.models.user import User
from app.models.task import Task

router = APIRouter()

@router.get("/export/all")
async def export_projects_multi(
    include_archived: bool = Query(False),
    mode: str = Query("summary", pattern="^(summary|details)$"),
    format: str = Query("csv", pattern="^(csv|excel)$"),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Export multiple projects as CSV or Excel.
    Summary mode: project list metadata.
    Details mode: project list + tasks/subtasks explosion.
    """
    if current_user.is_superuser:
        projects = await crud_project.project.get_multi(
            db, limit=1000, include_archived=include_archived
        )
    else:
        projects = await crud_project.project.get_multi_by_user(
            db, user_id=current_user.id, limit=1000, include_archived=include_archived
        )

    data = []
    
    if mode == "summary":
        for p in projects:
            data.append({
                "Name": p.name,
                "Description": p.description or "",
                "Status": p.status.value if hasattr(p.status, 'value') else str(p.status),
                "Progress %": p.progress_percent,
                "Topic": ", ".join([t.name for t in p.topics]) if p.topics else (p.topic or ""),
                "Type": ", ".join([t.name for t in p.types]) if p.types else (p.type or ""),
                "Start Date": p.start_date.strftime("%Y-%m-%d") if p.start_date else "",
                "Due Date": p.due_date.strftime("%Y-%m-%d") if p.due_date else "",
                "Archived": "Yes" if p.is_archived else "No",
                "Archived At": p.archived_at.strftime("%Y-%m-%d") if p.archived_at else "",
                "Owner": p.owner.full_name or p.owner.email if p.owner else ""
            })
    else:
        # Details mode: explosion
        from app.core.wbs import apply_wbs_codes
        
        for p in projects:
            # Project header row
            data.append({
                "Project": p.name,
                "WBS": "",
                "Title": "[PROJECT ROOT]",
                "Status": p.status.value if hasattr(p.status, 'value') else str(p.status),
                "Priority": "",
                "Assignees": "",
                "Start Date": p.start_date.strftime("%Y-%m-%d") if p.start_date else "",
                "Due Date": p.due_date.strftime("%Y-%m-%d") if p.due_date else "",
                "Progress %": f"{p.progress_percent}%",
                "Description": p.description or ""
            })
            
            # Fetch hierarchical tasks for this project
            all_tasks_tree = await crud_task.task.get_multi_by_project(db, project_id=p.id, limit=1000)
            apply_wbs_codes(all_tasks_tree)
            
            def flatten_for_export(tasks, project_name):
                for t in tasks:
                    data.append({
                        "Project": project_name,
                        "WBS": getattr(t, 'wbs_code', ""),
                        "Title": t.title,
                        "Status": t.status.value if hasattr(t.status, 'value') else str(t.status),
                        "Priority": t.priority.value if hasattr(t.priority, 'value') else str(t.priority),
                        "Assignees": ", ".join([u.full_name or u.email for u in t.assignees]),
                        "Start Date": t.start_date.strftime("%Y-%m-%d") if t.start_date else "",
                        "Due Date": t.due_date.strftime("%Y-%m-%d") if t.due_date else "",
                        "Progress %": "", 
                        "Description": t.description or ""
                    })
                    if t.subtasks:
                        flatten_for_export(t.subtasks, project_name)
            
            flatten_for_export(all_tasks_tree, p.name)

    df = pd.DataFrame(data)
    
    if format == "csv":
        stream = io.StringIO()
        df.to_csv(stream, index=False)
        response = StreamingResponse(
            io.BytesIO(stream.getvalue().encode()),
            media_type="text/csv",
        )
        filename = f"projects_export_{'archived' if include_archived else 'active'}_{mode}_{datetime.now().strftime('%Y%m%d')}.csv"
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        return response
    else:
        # Excel
        stream = io.BytesIO()
        with pd.ExcelWriter(stream, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Projects')
        
        response = StreamingResponse(
            io.BytesIO(stream.getvalue()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        filename = f"projects_export_{'archived' if include_archived else 'active'}_{mode}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        response.headers["Content-Disposition"] = f"attachment; filename={filename}"
        return response

@router.get("/{project_id}/export")
async def export_project(
    project_id: UUID,
    mode: str = Query("details", pattern="^(summary|details)$"),
    format: str = Query("csv", pattern="^(csv|excel)$"),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Export project tasks as CSV or Excel.
    """
    project = await crud_project.project.get(db, id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await require_project_access(db, project_id, current_user)

    if mode == "summary":
        # Just project metadata
        data = [{
            "Project Name": project.name,
            "Description": project.description or "",
            "Status": project.status.value if hasattr(project.status, 'value') else str(project.status),
            "Progress %": project.progress_percent,
            "Start Date": project.start_date.strftime("%Y-%m-%d") if project.start_date else "",
            "Due Date": project.due_date.strftime("%Y-%m-%d") if project.due_date else "",
            "Archived": "Yes" if project.is_archived else "No",
            "Owner": project.owner.full_name or project.owner.email if project.owner else "N/A",
            "Tags": ", ".join(project.tags or [])
        }]
    else:
        # Fetch hierarchical tasks (Details mode)
        all_tasks_tree = await crud_task.task.get_multi_by_project(db, project_id=project_id, limit=1000)
        
        # Apply WBS codes
        from app.core.wbs import apply_wbs_codes
        apply_wbs_codes(all_tasks_tree)
        
        # Flatten the tree for export
        data = []
        def flatten_for_export(tasks):
            for t in tasks:
                duration = 0
                if t.start_date and t.due_date:
                    duration = (t.due_date - t.start_date).days + 1
                
                data.append({
                    "WBS": getattr(t, 'wbs_code', ""),
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
                if t.subtasks:
                    flatten_for_export(t.subtasks)

        flatten_for_export(all_tasks_tree)

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

from app.schemas.portfolio import PortfolioHealthResponse, ProjectHealth
from app.core.enums import Status as TaskStatus

@router.get("/portfolio/health", response_model=PortfolioHealthResponse)
async def get_portfolio_health(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Calculate health metrics for all active projects.
    """
    # Fetch active projects
    if current_user.is_superuser:
        projects = await crud_project.project.get_multi(db, limit=1000)
        projects = [p for p in projects if not p.is_archived]
    else:
        # Simplified: owner only for now
        projects = await crud_project.project.get_multi_by_owner(db, owner_id=current_user.id)
        projects = [p for p in projects if not p.is_archived]

    project_healths = []
    total_progress = 0.0
    critical_projects = 0
    now = datetime.utcnow()

    for p in projects:
        # Load tasks for analysis
        tasks_stmt = select(Task).filter(Task.project_id == p.id, Task.is_archived == False)
        tasks_res = await db.execute(tasks_stmt)
        tasks = tasks_res.scalars().all()

        overdue = sum(1 for t in tasks if t.due_date and t.due_date < now and t.status != TaskStatus.DONE)
        critical_path = sum(1 for t in tasks if getattr(t, 'is_critical', False))
        
        # Simple health score formula: 100 - (overdue * 5)
        score = 100.0 - (overdue * 5.0)
        if p.status == "On hold": score -= 20
        score = max(0.0, min(100.0, score))

        risk = "Low"
        if score < 50 or overdue > 5: risk = "High"
        elif score < 80 or overdue > 2: risk = "Medium"

        if risk == "High": critical_projects += 1
        total_progress += (p.progress_percent or 0.0)

        project_healths.append(ProjectHealth(
            id=p.id,
            name=p.name,
            progress=p.progress_percent or 0.0,
            status=p.status.value if hasattr(p.status, 'value') else str(p.status),
            health_score=score,
            overdue_tasks=overdue,
            critical_path_tasks=critical_path,
            risk_level=risk,
            variance_days=overdue # Simplified variance
        ))

    return PortfolioHealthResponse(
        projects=project_healths,
        total_active=len(projects),
        average_progress=total_progress / len(projects) if projects else 0.0,
        critical_projects=critical_projects
    )

@router.get("/", response_model=List[Project])
async def read_projects(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = Query(100, ge=1, le=500),
    include_archived: bool = Query(False),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve projects.
    """
    if current_user.is_superuser:
        projects = await crud_project.project.get_multi(
            db, skip=skip, limit=limit, include_archived=include_archived
        )
    else:
        # Use new method to fetch projects where user is owner OR member
        projects = await crud_project.project.get_multi_by_user(
            db, user_id=current_user.id, skip=skip, limit=limit, include_archived=include_archived
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
    if project_in.template_id:
        from app.crud.crud_template import project_template as crud_template
        template = await crud_template.get(db, id=project_in.template_id)
        if template:
            project_in.allowed_global_topics = template.allowed_global_topics
            project_in.allowed_global_work_types = template.allowed_global_work_types

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
            ProjectModel.due_date != None,
            ProjectModel.is_archived == False
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
    
    await require_project_access(db, project_id, current_user)
    
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
    
    role = await project_role(db, project_id, current_user)
    if role is None:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    project.my_role = role  # lets the UI hide what the user cannot do (the API enforces it regardless)
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
    
    # Project admins (owner, superusers and members with the admin role) manage settings and members
    await require_project_access(db, project_id, current_user, min_role=ADMIN)
        
    project = await crud_project.project.update(db=db, db_obj=project, obj_in=project_in)
    return project

class MemberOut(BaseModel):
    user_id: UUID
    email: str
    full_name: Optional[str] = None
    role: str
    is_owner: bool = False


class MemberRoleIn(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def _known_role(cls, v: str) -> str:
        if v not in ROLES:
            raise ValueError(f"role must be one of: {', '.join(ROLES)}")
        return v


@router.get("/{project_id}/members", response_model=List[MemberOut])
async def list_project_members(
    project_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """The owner (always admin) and every member with their role. Any project role may look."""
    from app.models.associations import project_members
    from app.models.project import Project as ProjectModel

    await require_project_access(db, project_id, current_user)
    owner_row = (
        await db.execute(
            select(User).join(ProjectModel, ProjectModel.owner_id == User.id).where(ProjectModel.id == project_id)
        )
    ).scalars().first()
    rows = (
        await db.execute(
            select(User, project_members.c.role)
            .join(project_members, project_members.c.user_id == User.id)
            .where(project_members.c.project_id == project_id)
            .order_by(User.full_name, User.email)
        )
    ).all()
    out = []
    if owner_row:
        out.append(MemberOut(user_id=owner_row.id, email=owner_row.email, full_name=owner_row.full_name, role=ADMIN, is_owner=True))
    out += [
        MemberOut(user_id=u.id, email=u.email, full_name=u.full_name, role=role)
        for u, role in rows
        if not owner_row or u.id != owner_row.id
    ]
    return out


@router.put("/{project_id}/members/{user_id}", response_model=MemberOut)
async def set_project_member_role(
    project_id: UUID,
    user_id: UUID,
    body: MemberRoleIn,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Add a user to the project with `role`, or change an existing member's role. Project admins only."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from app.models.associations import project_members

    project = await require_project_access(db, project_id, current_user, min_role=ADMIN)
    if user_id == project.owner_id:
        raise HTTPException(status_code=400, detail="The owner is always an admin; their role cannot be changed")
    user = (await db.execute(select(User).where(User.id == user_id))).scalars().first()
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")
    await db.execute(
        pg_insert(project_members)
        .values(project_id=project_id, user_id=user_id, role=body.role)
        .on_conflict_do_update(index_elements=["project_id", "user_id"], set_={"role": body.role})
    )
    await commit(db)
    return MemberOut(user_id=user.id, email=user.email, full_name=user.full_name, role=body.role)


@router.delete("/{project_id}/members/{user_id}", status_code=204)
async def remove_project_member(
    project_id: UUID,
    user_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> None:
    """Remove a member. Project admins only; the owner cannot be removed."""
    from sqlalchemy import delete
    from app.models.associations import project_members

    project = await require_project_access(db, project_id, current_user, min_role=ADMIN)
    if user_id == project.owner_id:
        raise HTTPException(status_code=400, detail="The owner cannot be removed from the project")
    await db.execute(
        delete(project_members).where(project_members.c.project_id == project_id, project_members.c.user_id == user_id)
    )
    await commit(db)


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

@router.post("/{project_id}/archive", response_model=Project)
async def archive_project(
    *,
    db: AsyncSession = Depends(deps.get_db),
    project_id: UUID,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Archive a project.
    """
    project = await crud_project.project.get(db, id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await require_project_access(db, project_id, current_user, min_role=ADMIN)
        
    project = await crud_project.project.update(
        db=db, 
        db_obj=project, 
        obj_in={"is_archived": True, "archived_at": datetime.utcnow()}
    )
    return project

@router.post("/{project_id}/restore", response_model=Project)
async def restore_project(
    *,
    db: AsyncSession = Depends(deps.get_db),
    project_id: UUID,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Restore an archived project.
    """
    project = await crud_project.project.get(db, id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await require_project_access(db, project_id, current_user, min_role=ADMIN)
        
    project = await crud_project.project.update(
        db=db, 
        db_obj=project, 
        obj_in={"is_archived": False, "archived_at": None}
    )
    return project

@router.post("/auto-archive", response_model=List[Project])
async def auto_archive_projects(
    db: AsyncSession = Depends(deps.get_db),
    days_threshold: int = Query(7),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Auto-archive projects that are DONE and older than X days.
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Admin only")
        
    from datetime import timedelta
    from app.core.enums import Status
    from sqlalchemy import select, and_
    
    cutoff_date = datetime.utcnow() - timedelta(days=days_threshold)
    
    # Find candidates
    query = select(crud_project.project.model).where(
        and_(
            crud_project.project.model.status == Status.DONE,
            crud_project.project.model.is_archived == False,
            crud_project.project.model.updated_at < cutoff_date
        )
    )
    
    result = await db.execute(query)
    candidates = result.scalars().all()
    
    archived_projects = []
    for proj in candidates:
        updated = await crud_project.project.update(
            db=db, 
            db_obj=proj, 
            obj_in={"is_archived": True, "archived_at": datetime.utcnow()}
        )
        archived_projects.append(updated)
        
    return archived_projects
