from typing import Any, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.api import deps
from app.models.associations import project_members, task_assignees
from app.models.project import Project
from app.models.task import Task
from app.models.idea import Idea
from app.models.user import User
from app.schemas.search import SearchResult

router = APIRouter()

@router.get("/", response_model=List[SearchResult])
async def search_all(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Search across Projects, Tasks, and Ideas.
    """
    results = []
    # Escape LIKE wildcards so "100%" or "a_b" are searched literally (and "%" cannot match everything)
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    query_str = f"%{escaped}%"
    uid = current_user.id
    member_projects = select(project_members.c.project_id).where(project_members.c.user_id == uid)
    owned_projects = select(Project.id).where(Project.owner_id == uid)

    # 1. Search Projects
    project_stmt = select(Project).filter(
        or_(
            Project.name.ilike(query_str, escape="\\"),
            Project.description.ilike(query_str, escape="\\")
        )
    )
    if not current_user.is_superuser:
        project_stmt = project_stmt.filter(or_(Project.owner_id == uid, Project.id.in_(member_projects)))
    
    project_res = await db.execute(project_stmt.limit(20))
    for p in project_res.scalars().all():
        results.append(SearchResult(
            id=p.id,
            title=p.name,
            description=p.description,
            type="project",
            link=f"/projects/{p.id}",
            status=p.status.value if hasattr(p.status, 'value') else str(p.status)
        ))

    # 2. Search Tasks
    task_stmt = select(Task).filter(
        or_(
            Task.title.ilike(query_str, escape="\\"),
            Task.description.ilike(query_str, escape="\\")
        )
    )
    # Filter by owner or assignment
    # This is more complex, but we'll try to be efficient
    if not current_user.is_superuser:
        task_stmt = task_stmt.filter(or_(
            Task.owner_id == uid,
            Task.project_id.in_(owned_projects),
            Task.project_id.in_(member_projects),
            Task.id.in_(select(task_assignees.c.task_id).where(task_assignees.c.user_id == uid)),
        ))
    
    task_res = await db.execute(task_stmt.limit(20))
    for t in task_res.scalars().all():
        link = f"/projects/{t.project_id}" if t.project_id else "/tasks"
        results.append(SearchResult(
            id=t.id,
            title=t.title,
            description=t.description,
            type="task",
            link=link,
            status=t.status.value if hasattr(t.status, 'value') else str(t.status)
        ))

    # 3. Search Ideas
    idea_stmt = select(Idea).filter(
        or_(
            Idea.title.ilike(query_str, escape="\\"),
            Idea.description.ilike(query_str, escape="\\")
        )
    )
    # Only ideas from projects the user owns or belongs to
    if not current_user.is_superuser:
        idea_stmt = idea_stmt.filter(or_(
            Idea.project_id.in_(owned_projects),
            Idea.project_id.in_(member_projects),
        ))
    idea_res = await db.execute(idea_stmt.limit(20))
    for i in idea_res.scalars().all():
        results.append(SearchResult(
            id=i.id,
            title=i.title,
            description=i.description,
            type="idea",
            link=f"/projects/{i.project_id}?tab=ideas",
            status=i.status.value if hasattr(i.status, 'value') else str(i.status)
        ))

    return results[:20]  # Limit to top 20
