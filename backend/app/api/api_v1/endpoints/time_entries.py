"""Time tracking: start/stop timer (one running timer per user), manual entries, per-task totals, timesheet report.

Authorization: every task-scoped route goes through `require_task_access` (read level: anyone who can see a task may
log their own time on it). Entries can only be edited or deleted by their author or a superuser.
"""
from datetime import date, datetime, time, timedelta
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import extract, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.access import require_project_access, require_task_access
from app.core.time_tracking import entry_seconds, estimate_hours, estimate_vs_actual
from app.core.utils import make_naive
from app.models.project import Project
from app.models.task import Task
from app.models.time_entry import TimeEntry as TimeEntryModel
from app.models.user import User
from app.schemas import time_entry as schemas

router = APIRouter()

RUNNING_TIMER_CONFLICT = "You already have a running timer; stop it first"


def _out(entry: TimeEntryModel, now: Optional[datetime] = None) -> dict:
    return {
        "id": entry.id,
        "task_id": entry.task_id,
        "user_id": entry.user_id,
        "started_at": entry.started_at,
        "ended_at": entry.ended_at,
        "note": entry.note,
        "duration_seconds": entry_seconds(entry.started_at, entry.ended_at, now),
        "user": entry.user,
    }


async def _get_entry(db: AsyncSession, entry_id: UUID) -> Optional[TimeEntryModel]:
    return (await db.execute(select(TimeEntryModel).where(TimeEntryModel.id == entry_id))).unique().scalars().first()


async def _running_entry(db: AsyncSession, user_id: UUID) -> Optional[TimeEntryModel]:
    res = await db.execute(
        select(TimeEntryModel).where(TimeEntryModel.user_id == user_id, TimeEntryModel.ended_at.is_(None))
    )
    return res.unique().scalars().first()


@router.get("/running", response_model=Optional[schemas.TimeEntry])
async def get_running_timer(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """The current user's running timer, or null."""
    entry = await _running_entry(db, current_user.id)
    return _out(entry) if entry else None


@router.post("/stop", response_model=schemas.TimeEntry)
async def stop_timer(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Stop the current user's running timer."""
    entry = await _running_entry(db, current_user.id)
    if not entry:
        raise HTTPException(status_code=404, detail="No running timer")
    entry.ended_at = datetime.utcnow()
    await db.commit()
    return _out(await _get_entry(db, entry.id))


@router.get("/tasks/{task_id}", response_model=schemas.TaskTimeResponse)
async def read_task_time(
    task_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Entries, total and estimate-vs-actual for one task."""
    await require_task_access(db, task_id, current_user)
    now = datetime.utcnow()
    res = await db.execute(
        select(TimeEntryModel).where(TimeEntryModel.task_id == task_id).order_by(TimeEntryModel.started_at.desc())
    )
    entries = res.unique().scalars().all()
    total = sum(entry_seconds(e.started_at, e.ended_at, now) for e in entries)

    row = (
        await db.execute(
            select(Task.optimistic_days, Task.normal_days, Task.pessimistic_days, Task.duration_days).where(
                Task.id == task_id
            )
        )
    ).first()
    # Transient instance only to reuse the PERT formula (Task.expected_duration_days); never added to the session
    pert = Task(optimistic_days=row[0], normal_days=row[1], pessimistic_days=row[2])
    est = estimate_hours(pert.expected_duration_days, row[3])
    summary = {
        "task_id": task_id,
        "total_seconds": total,
        "entry_count": len(entries),
        "running": any(e.ended_at is None for e in entries),
        **estimate_vs_actual(est, total),
    }
    return {"summary": summary, "entries": [_out(e, now) for e in entries]}


@router.post("/tasks/{task_id}/start", response_model=schemas.TimeEntry)
async def start_timer(
    task_id: UUID,
    body: schemas.TimerStart = schemas.TimerStart(),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Start a timer on a task. A user can have only one running timer."""
    await require_task_access(db, task_id, current_user, participate=True)
    if await _running_entry(db, current_user.id):
        raise HTTPException(status_code=409, detail=RUNNING_TIMER_CONFLICT)
    entry = TimeEntryModel(task_id=task_id, user_id=current_user.id, started_at=datetime.utcnow(), note=body.note)
    db.add(entry)
    try:
        await db.commit()
    except IntegrityError:  # lost a race against another start: the partial unique index caught it
        await db.rollback()
        raise HTTPException(status_code=409, detail=RUNNING_TIMER_CONFLICT)
    return _out(await _get_entry(db, entry.id))


@router.post("/tasks/{task_id}/entries", response_model=schemas.TimeEntry)
async def create_manual_entry(
    task_id: UUID,
    body: schemas.TimeEntryCreate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Log a finished span of work by hand."""
    await require_task_access(db, task_id, current_user, participate=True)
    started, ended = make_naive(body.started_at), make_naive(body.ended_at)
    if ended > datetime.utcnow() + timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="A time entry cannot end in the future")
    entry = TimeEntryModel(task_id=task_id, user_id=current_user.id, started_at=started, ended_at=ended, note=body.note)
    db.add(entry)
    await db.commit()
    return _out(await _get_entry(db, entry.id))


async def _own_entry(db: AsyncSession, entry_id: UUID, user: User) -> TimeEntryModel:
    entry = await _get_entry(db, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found")
    if entry.user_id != user.id and not user.is_superuser:
        raise HTTPException(status_code=403, detail="Only the author can change a time entry")
    return entry


@router.put("/entries/{entry_id}", response_model=schemas.TimeEntry)
async def update_entry(
    entry_id: UUID,
    body: schemas.TimeEntryUpdate,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    entry = await _own_entry(db, entry_id, current_user)
    data = body.model_dump(exclude_unset=True)
    started = make_naive(data["started_at"]) if data.get("started_at") else entry.started_at
    ended = make_naive(data["ended_at"]) if data.get("ended_at") else entry.ended_at
    if "ended_at" in data and data["ended_at"] is None and entry.ended_at is not None:
        raise HTTPException(status_code=400, detail="A finished entry cannot be reopened")
    if ended is not None and ended < started:
        raise HTTPException(status_code=400, detail="ended_at must not be before started_at")
    entry.started_at, entry.ended_at = started, ended
    if "note" in data:
        entry.note = data["note"]
    await db.commit()
    return _out(await _get_entry(db, entry_id))


@router.delete("/entries/{entry_id}", status_code=204)
async def delete_entry(
    entry_id: UUID,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> None:
    entry = await _own_entry(db, entry_id, current_user)
    await db.delete(entry)
    await db.commit()


@router.get("/timesheet", response_model=schemas.Timesheet)
async def timesheet(
    project_id: Optional[UUID] = Query(None),
    user_id: Optional[UUID] = Query(None),
    date_from: Optional[date] = Query(None, description="inclusive"),
    date_to: Optional[date] = Query(None, description="inclusive"),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """Hours per user and project over a date range (by entry start date).

    With `project_id` (members only) the whole project's entries are reported, optionally for one `user_id`.
    Without it only your own entries are (a superuser may pass any `user_id`, or none for everybody).
    """
    if date_from and date_to and date_to < date_from:
        raise HTTPException(status_code=400, detail="date_to must not be before date_from")
    if project_id:
        await require_project_access(db, project_id, current_user)
    elif not current_user.is_superuser:
        if user_id and user_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only report on your own time")
        user_id = current_user.id

    now = datetime.utcnow()
    seconds = func.coalesce(
        func.sum(extract("epoch", func.coalesce(TimeEntryModel.ended_at, now) - TimeEntryModel.started_at)), 0
    )
    query = (
        select(
            TimeEntryModel.user_id,
            User.full_name,
            User.email,
            Task.project_id,
            Project.name,
            seconds,
            func.count(TimeEntryModel.id),
        )
        .join(Task, Task.id == TimeEntryModel.task_id)
        .join(User, User.id == TimeEntryModel.user_id)
        .outerjoin(Project, Project.id == Task.project_id)
        .group_by(TimeEntryModel.user_id, User.full_name, User.email, Task.project_id, Project.name)
        .order_by(seconds.desc())
    )
    if project_id:
        query = query.where(Task.project_id == project_id)
    if user_id:
        query = query.where(TimeEntryModel.user_id == user_id)
    if date_from:
        query = query.where(TimeEntryModel.started_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.where(TimeEntryModel.started_at < datetime.combine(date_to + timedelta(days=1), time.min))

    rows = [
        {
            "user_id": uid,
            "user_name": full_name or email,
            "project_id": pid,
            "project_name": pname,
            "total_seconds": max(0, int(secs)),
            "entry_count": count,
        }
        for uid, full_name, email, pid, pname, secs, count in (await db.execute(query)).all()
    ]
    return {
        "date_from": date_from,
        "date_to": date_to,
        "total_seconds": sum(r["total_seconds"] for r in rows),
        "rows": rows,
    }
