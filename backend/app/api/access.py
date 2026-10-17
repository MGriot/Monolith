"""
Central authorization helpers.

Every endpoint that touches a project-scoped resource must go through one of the
`require_*` coroutines below instead of re-implementing owner/member checks.

Project roles (highest first):
  * admin  - the project owner, superusers, and members with role "admin": everything an editor can do, plus project
             settings, members, custom-field definitions, archive/restore (deleting the project stays owner/superuser)
  * editor - members with role "editor" (the role every pre-existing member received): create/edit/delete tasks,
             comments, ideas, folders, files, whiteboards
  * viewer - read-only

Resources:
  * task in a project: project role decides; for READ (and "participate", e.g. logging time) the task's owner or an
    assignee is also allowed even without a project role
  * independent task (no project): the task's owner or an assignee
  * superusers: always allowed
"""
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.models  # noqa: F401  (registers every mapper so string relationships resolve)
from app.models.associations import project_members, task_assignees
from app.models.folder import Folder
from app.models.idea import Idea
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.models.whiteboard import Whiteboard

VIEWER, EDITOR, ADMIN = "viewer", "editor", "admin"
ROLES = (VIEWER, EDITOR, ADMIN)
ROLE_RANK = {VIEWER: 1, EDITOR: 2, ADMIN: 3}


async def _row(db: AsyncSession, model, obj_id: UUID, *cols):
    """Fetch selected columns only. Returns a Row (attribute access) or None.

    Deliberately avoids `db.get(Model, id)`: that would put a half-loaded ORM instance in the
    session identity map, which later eager-loaded queries (and Pydantic serialisation) must not trip over.
    """
    return (await db.execute(select(*cols).where(model.id == obj_id))).first()


async def project_role(db: AsyncSession, project_id: Optional[UUID], user: User) -> Optional[str]:
    """The user's role in the project, or None when they have no access (or the project does not exist)."""
    if user.is_superuser:
        return ADMIN
    if project_id is None:
        return None
    row = (await db.execute(select(Project.owner_id).where(Project.id == project_id))).first()
    if row is None:
        return None
    if row[0] == user.id:
        return ADMIN
    member = (
        await db.execute(
            select(project_members.c.role).where(
                and_(project_members.c.project_id == project_id, project_members.c.user_id == user.id)
            )
        )
    ).first()
    if member is None:
        return None
    # an unknown value is treated as the least privilege, never as more
    return member[0] if member[0] in ROLE_RANK else VIEWER


async def has_project_access(
    db: AsyncSession, project_id: Optional[UUID], user: User, min_role: str = VIEWER
) -> bool:
    role = await project_role(db, project_id, user)
    return role is not None and ROLE_RANK[role] >= ROLE_RANK[min_role]


async def _is_assignee(db: AsyncSession, task_id: UUID, user_id: UUID) -> bool:
    res = await db.execute(
        select(task_assignees.c.user_id).where(
            and_(task_assignees.c.task_id == task_id, task_assignees.c.user_id == user_id)
        )
    )
    return res.first() is not None


async def has_task_access(
    db: AsyncSession, task, user: User, *, write: bool = False, participate: bool = False
) -> bool:
    """write: change the task (project editor+). participate: act on it as a worker, e.g. log time (project editor+, or
    the task's owner/assignee). Neither: read (any project role, or owner/assignee)."""
    if user.is_superuser:
        return True
    if task.project_id:
        need = EDITOR if (write or participate) else VIEWER
        if await has_project_access(db, task.project_id, user, min_role=need):
            return True
        if write:
            return False
        return task.owner_id == user.id or await _is_assignee(db, task.id, user.id)
    return task.owner_id == user.id or await _is_assignee(db, task.id, user.id)


async def require_project_access(db: AsyncSession, project_id: UUID, user: User, min_role: str = VIEWER):
    project = await _row(db, Project, project_id, Project.id, Project.owner_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not await has_project_access(db, project_id, user, min_role=min_role):
        detail = "Not enough permissions for this project"
        if min_role != VIEWER:
            detail += f" (requires the {min_role} role)"
        raise HTTPException(status_code=403, detail=detail)
    return project


async def require_task_access(
    db: AsyncSession, task_id: UUID, user: User, *, write: bool = False, participate: bool = False
):
    task = await _row(db, Task, task_id, Task.id, Task.project_id, Task.owner_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not await has_task_access(db, task, user, write=write, participate=participate):
        raise HTTPException(status_code=403, detail="Not enough permissions for this task")
    return task


async def require_idea_access(db: AsyncSession, idea_id: UUID, user: User, min_role: str = VIEWER):
    idea = await _row(db, Idea, idea_id, Idea.id, Idea.project_id, Idea.author_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if not await has_project_access(db, idea.project_id, user, min_role=min_role):
        raise HTTPException(status_code=403, detail="Not enough permissions for this idea")
    return idea


async def require_whiteboard_access(db: AsyncSession, whiteboard_id: UUID, user: User, *, write: bool = False):
    wb = await _row(db, Whiteboard, whiteboard_id, Whiteboard.id, Whiteboard.owner_id, Whiteboard.project_id)
    if not wb:
        raise HTTPException(status_code=404, detail="Whiteboard not found")
    # Reading your own board survives losing project access; changing it needs the editor role in the project.
    if not write and wb.owner_id == user.id:
        return wb
    if not await has_project_access(db, wb.project_id, user, min_role=EDITOR if write else VIEWER):
        raise HTTPException(status_code=403, detail="Not enough permissions for this whiteboard")
    return wb


async def require_folder_access(db: AsyncSession, folder_id: UUID, user: User, *, write: bool = False):
    folder = await _row(db, Folder, folder_id, Folder.id, Folder.owner_id, Folder.project_id, Folder.task_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if user.is_superuser:
        return folder
    if folder.project_id:
        if await has_project_access(db, folder.project_id, user, min_role=EDITOR if write else VIEWER):
            return folder
    elif folder.owner_id == user.id:
        return folder
    if folder.task_id:
        task = await _row(db, Task, folder.task_id, Task.id, Task.project_id, Task.owner_id)
        if task and await has_task_access(db, task, user, write=write):
            return folder
    raise HTTPException(status_code=403, detail="Not enough permissions for this folder")


async def require_context_access(
    db: AsyncSession,
    user: User,
    *,
    project_id: Optional[UUID] = None,
    task_id: Optional[UUID] = None,
    idea_id: Optional[UUID] = None,
    write: bool = False,
) -> None:
    """Validate access for any of project/task/idea scopes (comments, attachments, ...)."""
    min_role = EDITOR if write else VIEWER
    if project_id:
        await require_project_access(db, project_id, user, min_role=min_role)
    if task_id:
        await require_task_access(db, task_id, user, write=write)
    if idea_id:
        await require_idea_access(db, idea_id, user, min_role=min_role)
