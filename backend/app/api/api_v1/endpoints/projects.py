from typing import Any, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, field_validator
from datetime import datetime

from app.api import deps
from app.api.access import ADMIN, ROLES, project_role, require_project_access
from app.core.export import enum_value, fmt_date, tabular_response
from app.core.wbs import apply_wbs_codes
from app.db.transaction import commit
from app.crud import crud_project, crud_task
from app.schemas.project import Project, ProjectCreate, ProjectUpdate
from app.models.user import User
from app.models.task import Task

router = APIRouter()


def _person(user) -> str:
    return user.full_name or user.email


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
                "Status": enum_value(p.status),
                "Progress %": p.progress_percent,
                "Topic": ", ".join([t.name for t in p.topics]) if p.topics else (p.topic or ""),
                "Type": ", ".join([t.name for t in p.types]) if p.types else (p.type or ""),
                "Start Date": fmt_date(p.start_date),
                "Due Date": fmt_date(p.due_date),
                "Deadline": fmt_date(p.deadline_at),
                "Archived": "Yes" if p.is_archived else "No",
                "Archived At": fmt_date(p.archived_at),
                "Owner": _person(p.owner) if p.owner else ""
            })
    else:
        # Details mode: one header row per project, then its task tree
        def flatten_for_export(tasks, project_name):
            for t in tasks:
                data.append({
                    "Project": project_name,
                    "WBS": getattr(t, 'wbs_code', ""),
                    "Title": t.title,
                    "Status": enum_value(t.status),
                    "Priority": enum_value(t.priority),
                    "Assignees": ", ".join([_person(u) for u in t.assignees]),
                    "Start Date": fmt_date(t.start_date),
                    "Due Date": fmt_date(t.due_date),
                    "Progress %": "",
                    "Description": t.description or ""
                })
                if t.subtasks:
                    flatten_for_export(t.subtasks, project_name)

        for p in projects:
            data.append({
                "Project": p.name,
                "WBS": "",
                "Title": "[PROJECT ROOT]",
                "Status": enum_value(p.status),
                "Priority": "",
                "Assignees": "",
                "Start Date": fmt_date(p.start_date),
                "Due Date": fmt_date(p.due_date),
                "Deadline": fmt_date(p.deadline_at),
                "Progress %": f"{p.progress_percent}%",
                "Description": p.description or ""
            })
            all_tasks_tree = await crud_task.task.get_multi_by_project(db, project_id=p.id, limit=1000)
            apply_wbs_codes(all_tasks_tree)
            flatten_for_export(all_tasks_tree, p.name)

    scope = 'archived' if include_archived else 'active'
    return tabular_response(data, fmt=format, sheet="Projects",
                            basename=f"projects_export_{scope}_{mode}_{datetime.now().strftime('%Y%m%d')}")

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
        data = [{
            "Project Name": project.name,
            "Description": project.description or "",
            "Status": enum_value(project.status),
            "Progress %": project.progress_percent,
            "Start Date": fmt_date(project.start_date),
            "Due Date": fmt_date(project.due_date),
            "Deadline": fmt_date(project.deadline_at),
            "Archived": "Yes" if project.is_archived else "No",
            "Owner": _person(project.owner) if project.owner else "N/A",
            "Tags": ", ".join(project.tags or [])
        }]
    else:
        all_tasks_tree = await crud_task.task.get_multi_by_project(db, project_id=project_id, limit=1000)
        apply_wbs_codes(all_tasks_tree)

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
                    "Status": enum_value(t.status),
                    "Priority": enum_value(t.priority),
                    "Start Date": fmt_date(t.start_date),
                    "Due Date": fmt_date(t.due_date),
                    "Deadline": fmt_date(t.deadline_at),
                    "Completed At": fmt_date(t.completed_at, "%Y-%m-%d %H:%M"),
                    "Duration (Days)": duration,
                    "Assignees": ", ".join([_person(u) for u in t.assignees]),
                    "Milestone": "Yes" if t.is_milestone else "No",
                    "Tags": ", ".join(t.tags or [])
                })
                if t.subtasks:
                    flatten_for_export(t.subtasks)

        flatten_for_export(all_tasks_tree)

    return tabular_response(data, fmt=format, sheet="Tasks",
                            basename=f"export_{project.name}_{datetime.now().strftime('%Y%m%d')}")

from sqlalchemy import func, or_
from app.core.cpm import calculate_cpm
from app.schemas.portfolio import PortfolioHealthResponse, ProjectHealth
from app.schemas.task import Task as TaskSchema
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
        # Projects the caller owns or is a member of (same scope as GET /projects/)
        projects = await crud_project.project.get_multi_by_user(db, user_id=current_user.id, limit=1000)
        projects = [p for p in projects if not p.is_archived]

    project_healths = []
    total_progress = 0.0
    critical_projects = 0
    now = datetime.utcnow()
    project_ids = [p.id for p in projects]

    # Overdue tasks per project, one query for the whole portfolio
    overdue_by_project = dict((await db.execute(
        select(Task.project_id, func.count())
        .where(Task.project_id.in_(project_ids), Task.is_archived == False,
               Task.due_date < now, or_(Task.status.is_(None), Task.status != TaskStatus.DONE))
        .group_by(Task.project_id)
    )).all()) if project_ids else {}

    # Critical-path tasks per project: the same CPM the Gantt runs, over every project's task tree at once
    roots = (await db.execute(
        select(Task.id, Task.project_id)
        .where(Task.project_id.in_(project_ids), Task.parent_id == None, Task.is_archived == False)
    )).all() if project_ids else []
    trees = await crud_task.task._load_trees(db, [r.id for r in roots])
    roots_by_project: dict = {}
    for r in roots:
        roots_by_project.setdefault(r.project_id, []).append(TaskSchema.model_validate(trees[r.id]))

    def count_critical(tasks) -> int:
        return sum(bool(t.is_critical) + count_critical(t.subtasks or []) for t in tasks)

    for p in projects:
        overdue = overdue_by_project.get(p.id, 0)
        critical_path = count_critical(calculate_cpm(roots_by_project.get(p.id, [])))

        # Simple health score formula: 100 - (overdue * 5), with penalties for a threatened hard deadline
        score = 100.0 - (overdue * 5.0)
        if p.status == "On hold": score -= 20
        deadline_missed = bool(p.deadline_at and p.deadline_at < now and p.status != TaskStatus.DONE)
        plan_past_deadline = bool(p.deadline_at and p.due_date and p.due_date > p.deadline_at)
        if deadline_missed: score -= 40
        elif plan_past_deadline: score -= 15
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
            variance_days=overdue, # Simplified variance
            deadline_at=p.deadline_at,
            deadline_status="missed" if deadline_missed else ("at_risk" if plan_past_deadline else ("ok" if p.deadline_at else "none")),
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
        
    from app.core.previews import delete_preview
    from app.models.whiteboard import Whiteboard

    previews = (await db.execute(select(Whiteboard.preview_image).where(Whiteboard.project_id == project_id))).scalars().all()
    project = await crud_project.project.remove(db=db, id=project_id)
    for url in previews:  # the sketches went with the project; drop their preview files too
        delete_preview(url)
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
