from datetime import date, datetime
from typing import Annotated, Any
from uuid import UUID

from pydantic import Field

from app.api.api_v1.endpoints import time_entries as time_api
from app.mcp.context import build, call, fields, Json
from app.mcp.server import mcp
from app.schemas.time_entry import TimeEntryCreate, TimeEntryUpdate, TimerStart

Note = Annotated[str | None, Field(max_length=1000)]


@mcp.tool()
async def start_timer(task_id: UUID, note: Note = None) -> dict[str, Any]:
    """Start your timer on a task (a timer already running elsewhere is stopped first)."""
    return await call(time_api.start_timer, task_id=task_id, body=build(TimerStart, {"note": note}))


@mcp.tool()
async def stop_timer() -> dict[str, Any]:
    """Stop your running timer and record the entry."""
    return await call(time_api.stop_timer)


@mcp.tool()
async def get_running_timer() -> Json:
    """Your running timer, or {"ok": true} when none is running."""
    return await call(time_api.get_running_timer)


@mcp.tool()
async def log_time(task_id: UUID, started_at: datetime, ended_at: datetime, note: Note = None) -> dict[str, Any]:
    """Record a finished block of work on a task (manual time entry, as yourself)."""
    body = build(TimeEntryCreate, {"started_at": started_at, "ended_at": ended_at, "note": note})
    return await call(time_api.create_manual_entry, task_id=task_id, body=body)


@mcp.tool()
async def update_time_entry(
    entry_id: UUID, started_at: datetime | None = None, ended_at: datetime | None = None, note: Note = None
) -> dict[str, Any]:
    """Correct one of your time entries."""
    body = build(TimeEntryUpdate, fields(started_at=started_at, ended_at=ended_at, note=note))
    return await call(time_api.update_entry, entry_id=entry_id, body=body)


@mcp.tool()
async def delete_time_entry(entry_id: UUID) -> dict[str, Any]:
    """Delete one of your time entries."""
    return await call(time_api.delete_entry, entry_id=entry_id)


@mcp.tool()
async def get_task_time(task_id: UUID) -> dict[str, Any]:
    """Time logged on a task versus its PERT estimate (8 h per workday), plus every entry."""
    return await call(time_api.read_task_time, task_id=task_id)


@mcp.tool()
async def get_timesheet(
    project_id: UUID | None = None,
    user_id: Annotated[UUID | None, Field(description="Someone else's time (project admins / administrators)")] = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    """Hours per person and project over a date range."""
    return await call(time_api.timesheet, project_id=project_id, user_id=user_id, date_from=date_from, date_to=date_to)
