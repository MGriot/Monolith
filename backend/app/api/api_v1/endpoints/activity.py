"""Change log of a project or a task: who created, edited, moved, assigned, archived or deleted what."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.access import require_project_access, require_task_access
from app.models.activity import ActivityEvent
from app.models.user import User
from app.schemas.user import User as UserSchema

router = APIRouter()


class ActivityEventOut(BaseModel):
    id: UUID
    project_id: UUID
    task_id: Optional[UUID] = None
    task_title: Optional[str] = None
    actor: Optional[UserSchema] = None
    actor_label: Optional[str] = None
    kind: str
    summary: str
    changes: Dict[str, Any] = {}
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


def _page(stmt, limit: int, before: Optional[datetime], kind: Optional[str]):
    if before:
        stmt = stmt.where(ActivityEvent.created_at < before)
    if kind:
        stmt = stmt.where(ActivityEvent.kind == kind)
    return stmt.order_by(ActivityEvent.created_at.desc()).limit(limit)


@router.get("/projects/{project_id}/activity", response_model=List[ActivityEventOut])
async def read_project_activity(
    project_id: UUID,
    limit: int = Query(100, ge=1, le=500),
    before: Optional[datetime] = Query(None, description="Only events older than this (paging)"),
    kind: Optional[str] = Query(None, description="created, updated, status_changed, assigned, archived, restored, deleted, dependency_added, dependency_removed"),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """The project's change log, newest first (any project role)."""
    await require_project_access(db, project_id, current_user)
    stmt = _page(select(ActivityEvent).where(ActivityEvent.project_id == project_id), limit, before, kind)
    return (await db.execute(stmt)).scalars().all()


@router.get("/tasks/{task_id}/activity", response_model=List[ActivityEventOut])
async def read_task_activity(
    task_id: UUID,
    limit: int = Query(100, ge=1, le=500),
    before: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """One task's change log, newest first."""
    await require_task_access(db, task_id, current_user)
    stmt = _page(select(ActivityEvent).where(ActivityEvent.task_id == task_id), limit, before, None)
    return (await db.execute(stmt)).scalars().all()
