from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, func, select, or_
from datetime import datetime

from app.api import deps
from app.models.project import Project
from app.models.task import Task, Subtask
from app.models.user import User
from app.schemas.calendar import CalendarResponse, CalendarItem
from app.core.enums import Status
from app.core.ical import Event, build_calendar
from app.core.mailer import absolute_url
from app.core.ratelimit import FailureLimiter
from app.core.utils import make_naive

from app.models.associations import project_members, task_assignees
from sqlalchemy.orm import selectinload

router = APIRouter()

@router.get("/", response_model=CalendarResponse)
async def get_calendar_events(
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
) -> Any:
    """
    Get all projects and tasks with due dates, filtered by access rights.
    """
    start_date = make_naive(start_date)
    end_date = make_naive(end_date)
    
    items = []
    
    # Fetch Projects
    project_query = select(Project).where(Project.due_date != None)
    if not current_user.is_superuser:
        project_query = project_query.outerjoin(project_members).filter(
            or_(
                Project.owner_id == current_user.id,
                project_members.c.user_id == current_user.id
            )
        ).distinct()
        
    if start_date and end_date:
        from sqlalchemy import func
        project_query = project_query.where(
            func.coalesce(Project.start_date, Project.due_date) <= end_date
        ).where(
            Project.due_date >= start_date
        )
    
    result = await db.execute(project_query)
    projects = result.scalars().all()
    for p in projects:
        items.append(CalendarItem(
            id=p.id,
            title=p.name,
            item_type="project",
            status=p.status,
            start_date=p.start_date,
            due_date=p.due_date,
            project_owner_id=p.owner_id
        ))

    # Fetch Tasks (All levels)
    task_query = select(Task).where(Task.due_date != None).options(
        selectinload(Task.assignees),
        selectinload(Task.project)
    )
    if not current_user.is_superuser:
        task_query = task_query.join(Project).outerjoin(project_members).filter(
            or_(
                Project.owner_id == current_user.id,
                project_members.c.user_id == current_user.id
            )
        ).distinct()
        
    if start_date and end_date:
        from sqlalchemy import func
        task_query = task_query.where(
            func.coalesce(Task.start_date, Task.due_date) <= end_date
        ).where(
            Task.due_date >= start_date
        )
    
    result = await db.execute(task_query)
    tasks = result.scalars().all()
    for t in tasks:
        item_type = "task" if not t.parent_id else "subtask"
        items.append(CalendarItem(
            id=t.id,
            title=t.title,
            item_type=item_type,
            status=t.status,
            start_date=t.start_date,
            due_date=t.due_date,
            project_id=t.project_id,
            project_name=t.project.name if t.project else None,
            project_owner_id=t.project.owner_id if t.project else None,
            task_id=t.parent_id,
            assignees=t.assignees
        ))

    return {"items": items}


# --- personal iCalendar feed ------------------------------------------------------------------------------------
# Calendar apps subscribe by URL and cannot send an Authorization header, so the URL itself carries a secret token
# (users.calendar_token, 256 bit, revocable/rotatable via /users/me/calendar-feed). Wrong tokens are throttled per client.
feed_failures = FailureLimiter(30, 3600)


@router.get("/feed/{token}.ics")
async def calendar_feed(
    token: str,
    request: Request,
    include_done: bool = Query(False, description="also list completed tasks"),
    db: AsyncSession = Depends(deps.get_db),
) -> Response:
    """The user's assigned tasks (plus their own tasks outside projects) that have a start or due date, as all-day events."""
    client = request.client.host if request.client else "unknown"
    wait = feed_failures.retry_after(client)
    if wait:
        raise HTTPException(status_code=429, detail="Too many invalid calendar links", headers={"Retry-After": str(wait)})
    user = (
        await db.execute(select(User).where(User.calendar_token == token, User.is_active == True))  # noqa: E712
    ).scalars().first()
    if user is None:
        feed_failures.record_failure(client)
        raise HTTPException(status_code=404, detail="Calendar not found")

    stmt = (
        select(Task)
        .where(
            or_(
                Task.id.in_(select(task_assignees.c.task_id).where(task_assignees.c.user_id == user.id)),
                and_(Task.project_id == None, Task.owner_id == user.id),  # noqa: E711
            ),
            Task.is_archived == False,  # noqa: E712
            or_(Task.due_date != None, Task.start_date != None),  # noqa: E711
        )
        .options(selectinload(Task.project))
        .order_by(func.coalesce(Task.due_date, Task.start_date).asc())
        .limit(2000)
    )
    if not include_done:
        stmt = stmt.where(Task.status != Status.DONE)
    tasks = (await db.execute(stmt)).scalars().all()

    events = [task_to_event(t) for t in tasks]
    body = build_calendar(f"Monolith - {user.full_name or user.email}", events)
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Robots-Tag": "noindex",
            "Referrer-Policy": "no-referrer",
            "Content-Disposition": 'inline; filename="monolith.ics"',
        },
    )


def task_to_event(t: Task) -> Event:
    first = (t.start_date or t.due_date).date()
    last = (t.due_date or t.start_date).date()
    if last < first:
        first, last = last, first
    status = t.status.value if hasattr(t.status, "value") else str(t.status)
    project = t.project.name if t.project else None
    lines = []
    if project:
        lines.append(f"Project: {project}")
    lines.append(f"Status: {status}")
    priority = t.priority.value if hasattr(t.priority, "value") else t.priority
    if priority:
        lines.append(f"Priority: {priority}")
    if t.description:
        lines += ["", t.description[:1000]]
    link = f"/projects/{t.project_id}?task_id={t.id}" if t.project_id else f"/tasks?task_id={t.id}"
    return Event(
        uid=f"task-{t.id}@monolith",
        summary=("\u2713 " if status == "Done" else "") + (t.title or "(untitled)"),
        start=first,
        end_inclusive=last,
        description="\n".join(lines),
        url=absolute_url(link),
        status="CONFIRMED",
        modified=t.updated_at,
        categories=[c for c in (project, status) if c],
    )
