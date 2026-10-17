"""
Central authorization helpers.

Every endpoint that touches a project-scoped resource must go through one of the
`require_*` coroutines below instead of re-implementing owner/member checks.

Rules (mirrors the pre-existing semantics of `tasks.check_task_permissions`):
  * superuser: always allowed
  * project: owner or member
  * task in a project: project owner/member; for READ only, also the task's owner or an assignee
  * independent task (no project): task owner or assignee
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


async def _row(db: AsyncSession, model, obj_id: UUID, *cols):
    """Fetch selected columns only. Returns a Row (attribute access) or None.

    Deliberately avoids `db.get(Model, id)`: that would put a half-loaded ORM instance in the
    session identity map, which later eager-loaded queries (and Pydantic serialisation) must not trip over.
    """
    return (await db.execute(select(*cols).where(model.id == obj_id))).first()


async def has_project_access(db: AsyncSession, project_id: Optional[UUID], user: User) -> bool:
    if user.is_superuser:
        return True
    if project_id is None:
        return False
    row = (await db.execute(select(Project.owner_id).where(Project.id == project_id))).first()
    if row is None:
        return False
    if row[0] == user.id:
        return True
    member = await db.execute(
        select(project_members.c.user_id).where(
            and_(project_members.c.project_id == project_id, project_members.c.user_id == user.id)
        )
    )
    return member.first() is not None


async def _is_assignee(db: AsyncSession, task_id: UUID, user_id: UUID) -> bool:
    res = await db.execute(
        select(task_assignees.c.user_id).where(
            and_(task_assignees.c.task_id == task_id, task_assignees.c.user_id == user_id)
        )
    )
    return res.first() is not None


async def has_task_access(db: AsyncSession, task, user: User, *, write: bool = False) -> bool:
    if user.is_superuser:
        return True
    if task.project_id:
        if await has_project_access(db, task.project_id, user):
            return True
        if write:
            return False
        return task.owner_id == user.id or await _is_assignee(db, task.id, user.id)
    return task.owner_id == user.id or await _is_assignee(db, task.id, user.id)


async def require_project_access(db: AsyncSession, project_id: UUID, user: User):
    project = await _row(db, Project, project_id, Project.id, Project.owner_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not await has_project_access(db, project_id, user):
        raise HTTPException(status_code=403, detail="Not enough permissions for this project")
    return project


async def require_task_access(db: AsyncSession, task_id: UUID, user: User, *, write: bool = False):
    task = await _row(db, Task, task_id, Task.id, Task.project_id, Task.owner_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not await has_task_access(db, task, user, write=write):
        raise HTTPException(status_code=403, detail="Not enough permissions for this task")
    return task


async def require_idea_access(db: AsyncSession, idea_id: UUID, user: User):
    idea = await _row(db, Idea, idea_id, Idea.id, Idea.project_id, Idea.author_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    if not await has_project_access(db, idea.project_id, user):
        raise HTTPException(status_code=403, detail="Not enough permissions for this idea")
    return idea


async def require_whiteboard_access(db: AsyncSession, whiteboard_id: UUID, user: User):
    wb = await _row(db, Whiteboard, whiteboard_id, Whiteboard.id, Whiteboard.owner_id, Whiteboard.project_id)
    if not wb:
        raise HTTPException(status_code=404, detail="Whiteboard not found")
    if wb.owner_id != user.id and not await has_project_access(db, wb.project_id, user):
        raise HTTPException(status_code=403, detail="Not enough permissions for this whiteboard")
    return wb


async def require_folder_access(db: AsyncSession, folder_id: UUID, user: User):
    folder = await _row(db, Folder, folder_id, Folder.id, Folder.owner_id, Folder.project_id, Folder.task_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if user.is_superuser or folder.owner_id == user.id:
        return folder
    if folder.project_id and await has_project_access(db, folder.project_id, user):
        return folder
    if folder.task_id:
        task = await _row(db, Task, folder.task_id, Task.id, Task.project_id, Task.owner_id)
        if task and await has_task_access(db, task, user, write=True):
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
    if project_id:
        await require_project_access(db, project_id, user)
    if task_id:
        await require_task_access(db, task_id, user, write=write)
    if idea_id:
        await require_idea_access(db, idea_id, user)
