from typing import Any, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.api import deps
from app.api.access import EDITOR, require_project_access, require_task_access
from app.core import activity
from app.core.uploads import save_upload
from app.crud import crud_task, crud_project, crud_dependency, crud_custom_field
from app.schemas.task import (
    Task, TaskCreate, TaskUpdate, Dependency, DependencyCreate,
    BulkTaskRequest, BulkTaskResponse, BulkTaskResult,
)
from app.db.transaction import transaction
from app.models.user import User
from app.models.dependency import Dependency as DependencyModel
from app.core.export import enum_value, fmt_date, tabular_response
from datetime import datetime

router = APIRouter()

@router.get("/export")
async def export_tasks(
    include_archived: bool = Query(False),
    mode: str = Query("summary", pattern="^(summary|details)$"),
    format: str = Query("csv", pattern="^(csv|excel)$"),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Export tasks assigned to the current user as CSV or Excel.
    Summary mode: flat list of tasks.
    Details mode: flat list + subtasks explosion.
    """
    from app.models.task import Task as TaskModel
    from app.models.project import Project as ProjectModel
    from app.models.associations import task_assignees
    from sqlalchemy import or_
    
    # We want tasks assigned to the user
    query = (
        select(TaskModel)
        .join(task_assignees)
        .outerjoin(ProjectModel, TaskModel.project_id == ProjectModel.id)
        .filter(task_assignees.c.user_id == current_user.id)
    )
    
    if not include_archived:
        query = query.filter(TaskModel.is_archived == False).filter(or_(ProjectModel.id == None, ProjectModel.is_archived == False))
        
    query = query.options(
        selectinload(TaskModel.owner),
        selectinload(TaskModel.assignees),
        selectinload(TaskModel.project),
        selectinload(TaskModel.topics),
        selectinload(TaskModel.types),
    )

    result = await db.execute(query)
    tasks = result.scalars().all()
    if mode == "details":
        # Whole subtrees with their assignees and project, in one recursive query: subtasks that are not assigned to
        # the user are not in `tasks`, and lazy-loading their relations in an async session fails (MissingGreenlet).
        await crud_task.task._load_trees(db, [t.id for t in tasks])

    data = []
    
    def process_task(t, parent_title=None):
        duration = 0
        if t.start_date and t.due_date:
            duration = (t.due_date - t.start_date).days + 1
            
        row = {
            "Project": t.project.name if t.project else "N/A",
            "Parent Task": parent_title or "",
            "Title": t.title,
            "Description": t.description or "",
            "Status": enum_value(t.status),
            "Priority": enum_value(t.priority),
            "Start Date": fmt_date(t.start_date),
            "Due Date": fmt_date(t.due_date),
            "Completed At": fmt_date(t.completed_at, "%Y-%m-%d %H:%M"),
            "Duration (Days)": duration,
            "Assignees": ", ".join([u.full_name or u.email for u in t.assignees]),
            "Milestone": "Yes" if t.is_milestone else "No",
            "Tags": ", ".join(t.tags or [])
        }
        data.append(row)
        
        if mode == "details" and t.subtasks:
            for st in t.subtasks:
                process_task(st, t.title)

    for t in tasks:
        process_task(t)

    return tabular_response(data, fmt=format, sheet="My Tasks",
                            basename=f"tasks_export_{datetime.now().strftime('%Y%m%d')}")

@router.get("/assigned", response_model=List[Task])
async def read_assigned_tasks(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve all tasks assigned to the current user.
    """
    from app.models.task import Task as TaskModel
    from app.models.project import Project as ProjectModel
    from app.models.associations import task_assignees
    from sqlalchemy import or_
    
    query = (
        select(TaskModel)
        .join(task_assignees)
        .outerjoin(ProjectModel, TaskModel.project_id == ProjectModel.id)
        .filter(task_assignees.c.user_id == current_user.id)
        .filter(TaskModel.is_archived == False)
        .filter(or_(ProjectModel.id == None, ProjectModel.is_archived == False))
        .options(
            selectinload(TaskModel.owner),
            selectinload(TaskModel.assignees),
            selectinload(TaskModel.blocked_by),
            selectinload(TaskModel.blocking),
            selectinload(TaskModel.topic_ref),
            selectinload(TaskModel.type_ref),
            selectinload(TaskModel.topics),
            selectinload(TaskModel.types),
            selectinload(TaskModel.project),
            selectinload(TaskModel.subtasks).options(
                selectinload(TaskModel.owner),
                selectinload(TaskModel.assignees),
                selectinload(TaskModel.blocked_by),
                selectinload(TaskModel.blocking),
                selectinload(TaskModel.topic_ref),
                selectinload(TaskModel.type_ref),
                selectinload(TaskModel.topics),
                selectinload(TaskModel.types),
                selectinload(TaskModel.subtasks).options(
                    selectinload(TaskModel.owner),
                    selectinload(TaskModel.assignees),
                    selectinload(TaskModel.blocked_by),
                    selectinload(TaskModel.blocking),
                    selectinload(TaskModel.topic_ref),
                    selectinload(TaskModel.type_ref),
                    selectinload(TaskModel.topics),
                    selectinload(TaskModel.types),
                    selectinload(TaskModel.subtasks).options(
                        selectinload(TaskModel.owner),
                        selectinload(TaskModel.assignees),
                        selectinload(TaskModel.blocked_by),
                        selectinload(TaskModel.blocking),
                        selectinload(TaskModel.topic_ref),
                        selectinload(TaskModel.type_ref),
                        selectinload(TaskModel.topics),
                        selectinload(TaskModel.types),
                        selectinload(TaskModel.subtasks)
                    )
                )
            )
        )
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    # We don't apply WBS here as these tasks are from different projects/levels
    return tasks

@router.get("/", response_model=List[Task])
async def read_tasks(
    project_id: UUID,
    parent_id: Optional[UUID] = None,
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve tasks for a project.
    """
    project = await crud_project.project.get(db, id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await require_project_access(db, project_id, current_user)
    
    tasks = await crud_task.task.get_multi_by_project(
        db, 
        project_id=project_id, 
        skip=skip, 
        limit=limit, 
        parent_id=parent_id,
        include_archived=include_archived
    )
    
    from app.core.wbs import apply_wbs_codes
    from app.core.cpm import calculate_cpm
    from app.schemas.task import Task as TaskSchema
    # Convert models to schemas to allow setting wbs_code (which is not in DB)
    # We also ensure the project is attached to the schema if loaded
    task_schemas = []
    for t in tasks:
        ts = TaskSchema.model_validate(t)
        ts.project = project # Attach the project we already fetched
        task_schemas.append(ts)
    
    # Apply WBS and CPM
    task_schemas = apply_wbs_codes(task_schemas, "")
    return calculate_cpm(task_schemas)

@router.post("/", response_model=Task)
async def create_task(
    *,
    db: AsyncSession = Depends(deps.get_db),
    task_in: TaskCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new task.
    """
    if task_in.project_id:
        await require_project_access(db, task_in.project_id, current_user, min_role=EDITOR)

    if task_in.parent_id:
        # A subtask may only hang off a task the caller can write, in the same project.
        parent = await require_task_access(db, task_in.parent_id, current_user, write=True)
        if parent.project_id != task_in.project_id:
            raise HTTPException(status_code=400, detail="Parent task belongs to a different project")

    if not task_in.owner_id:
        task_in.owner_id = current_user.id
        
    try:
        if task_in.custom_values:
            task_in.custom_values = await crud_custom_field.validate_for_project(
                db, task_in.project_id, task_in.custom_values
            )
        task_obj = await crud_task.task.create(db=db, obj_in=task_in)
        return task_obj
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/bulk", response_model=BulkTaskResponse)
async def bulk_update_tasks(
    *,
    db: AsyncSession = Depends(deps.get_db),
    body: BulkTaskRequest,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Apply one patch (status / priority / assignees) or one action (archive / restore / delete) to many tasks.

    Every id is authorized on its own with `require_task_access(write=True)` in a first pass; ids that fail (403/404)
    are reported in `results` and left untouched. The permitted ones are applied in ONE transaction, each inside a
    SAVEPOINT so a task that cannot take the change (e.g. 400 validation) is reported without undoing the others.
    """
    ids = list(dict.fromkeys(body.ids))  # de-duplicate, keep order
    results: dict = {}
    allowed: List[UUID] = []
    for task_id in ids:
        try:
            await require_task_access(db, task_id, current_user, write=True)
            allowed.append(task_id)
        except HTTPException as e:
            results[task_id] = BulkTaskResult(id=task_id, ok=False, status_code=e.status_code, detail=str(e.detail))

    patch = body.patch.model_dump(exclude_unset=True) if body.patch is not None else {}
    # one project roll-up per affected project at the end, not one per task
    async with transaction(db), crud_task.task.project_sync_once(db):
        for task_id in allowed:
            try:
                async with db.begin_nested():
                    task_obj = await crud_task.task.get(db, id=task_id)
                    if not task_obj:
                        raise HTTPException(status_code=404, detail="Task not found")
                    if body.action == "delete":
                        await crud_task.task.remove(db=db, id=task_id)
                    elif body.action == "archive":
                        await crud_task.task.update(
                            db=db, db_obj=task_obj, obj_in={"is_archived": True, "archived_at": datetime.utcnow()}
                        )
                    elif body.action == "restore":
                        await crud_task.task.update(
                            db=db, db_obj=task_obj, obj_in={"is_archived": False, "archived_at": None}
                        )
                    else:
                        await crud_task.task.update(db=db, db_obj=task_obj, obj_in=dict(patch))
                results[task_id] = BulkTaskResult(id=task_id, ok=True)
            except HTTPException as e:
                results[task_id] = BulkTaskResult(id=task_id, ok=False, status_code=e.status_code, detail=str(e.detail))
            except ValueError as e:
                results[task_id] = BulkTaskResult(id=task_id, ok=False, status_code=400, detail=str(e))
    ordered = [results[i] for i in ids]
    ok = sum(1 for r in ordered if r.ok)
    return BulkTaskResponse(results=ordered, succeeded=ok, failed=len(ordered) - ok)


@router.get("/{task_id}", response_model=Task)
async def read_task(
    task_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get task by ID.
    """
    await require_task_access(db, task_id, current_user)
    task_obj = await crud_task.task.get(db, id=task_id)
    return task_obj

@router.put("/{task_id}", response_model=Task)
async def update_task(
    *,
    db: AsyncSession = Depends(deps.get_db),
    task_id: UUID,
    task_in: TaskUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a task.
    """
    await require_task_access(db, task_id, current_user, write=True)
    task_obj = await crud_task.task.get(db, id=task_id)
            
    try:
        if "custom_values" in task_in.model_fields_set:
            task_in.custom_values = await crud_custom_field.validate_for_project(
                db, task_obj.project_id, task_in.custom_values
            )
        task_obj = await crud_task.task.update(db=db, db_obj=task_obj, obj_in=task_in)
        return task_obj
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{task_id}", response_model=Task)
async def delete_task(
    *,
    db: AsyncSession = Depends(deps.get_db),
    task_id: UUID,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a task.
    """
    await require_task_access(db, task_id, current_user, write=True)
    task_obj = await crud_task.task.get(db, id=task_id)
    
    task_obj = await crud_task.task.remove(db=db, id=task_id)
    return task_obj

@router.post("/{task_id}/attachments", response_model=Task)
async def upload_task_attachment(
    task_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Upload an attachment to a task.
    """
    await require_task_access(db, task_id, current_user, write=True)
    task_obj = await crud_task.task.get(db, id=task_id)
    
    unique_filename, _ext, _size = await save_upload(file)
    
    file_url = f"/uploads/{unique_filename}"
    attachments = list(task_obj.attachments) if task_obj.attachments else []
    attachments.append(file_url)
    
    task_obj = await crud_task.task.update(db=db, db_obj=task_obj, obj_in={"attachments": attachments})
    return task_obj

async def _titles(db: AsyncSession, *ids: UUID) -> dict:
    from app.models.task import Task as TaskModel

    rows = await db.execute(select(TaskModel.id, TaskModel.title).where(TaskModel.id.in_(ids)))
    return {r.id: r.title for r in rows}


@router.post("/{task_id}/dependencies", response_model=Dependency)
async def create_task_dependency(
    task_id: UUID,
    dependency_in: DependencyCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create a dependency for a task.
    """
    task_obj = await require_task_access(db, task_id, current_user, write=True)

    if dependency_in.successor_id != task_id:
         raise HTTPException(status_code=400, detail="Successor ID must match task ID")

    predecessor = await require_task_access(db, dependency_in.predecessor_id, current_user, write=True)
    if predecessor.project_id != task_obj.project_id:
        raise HTTPException(status_code=400, detail="Dependencies must stay within one project")
         
    try:
        dep = await crud_dependency.dependency.create(db, obj_in=dependency_in)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    titles = await _titles(db, task_obj.id, predecessor.id)
    kind = getattr(dependency_in.type, "value", dependency_in.type)
    lag = f", {dependency_in.lag_days:+d} d" if dependency_in.lag_days else ""
    activity.record(db, project_id=task_obj.project_id, task_id=task_obj.id, task_title=titles.get(task_obj.id),
                    kind="dependency_added",
                    summary=f"made it depend on “{titles.get(predecessor.id, 'a task')}” ({kind}{lag})",
                    changes={"predecessor": [None, str(predecessor.id)]})
    return dep

@router.delete("/{task_id}/dependencies/{predecessor_id}", response_model=List[Dependency])
async def delete_task_dependency(
    task_id: UUID,
    predecessor_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Remove a dependency from a task.
    """
    task_obj = await require_task_access(db, task_id, current_user, write=True)
    result = await db.execute(
        select(DependencyModel).filter(
            and_(
                DependencyModel.successor_id == task_id,
                DependencyModel.predecessor_id == predecessor_id
            )
        )
    )
    dep = result.scalars().first()
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found")
        
    await crud_dependency.dependency.remove(db, id=dep.id)
    titles = await _titles(db, task_id, predecessor_id)
    activity.record(db, project_id=task_obj.project_id, task_id=task_id, task_title=titles.get(task_id),
                    kind="dependency_removed",
                    summary=f"no longer depends on “{titles.get(predecessor_id, 'a task')}”",
                    changes={"predecessor": [str(predecessor_id), None]})
    
    remaining = await crud_dependency.dependency.get_by_successor(db, successor_id=task_id)
    return remaining

@router.post("/{task_id}/archive", response_model=Task)
async def archive_task(
    *,
    db: AsyncSession = Depends(deps.get_db),
    task_id: UUID,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Archive a task.
    """
    await require_task_access(db, task_id, current_user, write=True)
    task_obj = await crud_task.task.get(db, id=task_id)
        
    task_obj = await crud_task.task.update(
        db=db, 
        db_obj=task_obj, 
        obj_in={"is_archived": True, "archived_at": datetime.utcnow()}
    )
    return task_obj

@router.post("/{task_id}/restore", response_model=Task)
async def restore_task(
    *,
    db: AsyncSession = Depends(deps.get_db),
    task_id: UUID,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Restore an archived task.
    """
    await require_task_access(db, task_id, current_user, write=True)
    task_obj = await crud_task.task.get(db, id=task_id)
        
    task_obj = await crud_task.task.update(
        db=db, 
        db_obj=task_obj, 
        obj_in={"is_archived": False, "archived_at": None}
    )
    return task_obj

@router.get("/archived/all", response_model=List[Task])
async def read_archived_tasks(
    db: AsyncSession = Depends(deps.get_db),
    skip: int = 0,
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve all archived tasks where the current user is either the owner or an assignee.
    """
    from app.models.task import Task as TaskModel
    from app.models.associations import task_assignees
    from sqlalchemy import or_
    
    # Select tasks that are archived AND (user is owner OR user is in assignees)
    query = (
        select(TaskModel)
        .outerjoin(task_assignees)
        .filter(TaskModel.is_archived == True)
        .filter(
            or_(
                TaskModel.owner_id == current_user.id,
                task_assignees.c.user_id == current_user.id
            )
        )
        .options(
            selectinload(TaskModel.owner),
            selectinload(TaskModel.assignees),
            selectinload(TaskModel.project),
            selectinload(TaskModel.topics),
            selectinload(TaskModel.types)
        )
        .distinct()
        .offset(skip)
        .limit(limit)
    )
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    return tasks
