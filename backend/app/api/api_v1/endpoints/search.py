from typing import Any, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.api import deps
from app.api.access import visible_project_filter, visible_task_filter
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

    # 1. Search Projects
    project_stmt = select(Project).filter(
        or_(
            Project.name.ilike(query_str, escape="\\"),
            Project.description.ilike(query_str, escape="\\")
        )
    )
    project_stmt = project_stmt.filter(visible_project_filter(current_user))
    
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
    task_stmt = task_stmt.filter(visible_task_filter(current_user))
    
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
    idea_stmt = idea_stmt.filter(Idea.project_id.in_(select(Project.id).where(visible_project_filter(current_user))))
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
