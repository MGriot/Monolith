"""Read-only views across projects: dashboard figures, workload, risk, calendar and search."""
from datetime import datetime
from typing import Annotated, Any

from pydantic import Field

from app.api.api_v1.endpoints import calendar as calendar_api
from app.api.api_v1.endpoints import dashboard as dashboard_api
from app.api.api_v1.endpoints import search as search_api
from app.mcp.context import call, Json
from app.mcp.server import mcp


@mcp.tool()
async def get_dashboard_summary() -> Json:
    """Your dashboard: KPI counts, tasks due soon, overdue work and recent changes."""
    return await call(dashboard_api.get_dashboard_summary)


@mcp.tool()
async def get_activity_recap() -> Json:
    """What was created, completed and is coming up across your projects."""
    return await call(dashboard_api.get_activity_recap)


@mcp.tool()
async def get_team_workload(days: Annotated[int, Field(ge=1, le=90)] = 30) -> dict[str, Any]:
    """Assigned work per person and day over the next `days` days (resource allocation / overload view)."""
    return await call(dashboard_api.get_team_workload, days=days)


@mcp.tool()
async def get_risk_matrix() -> Json:
    """Projects and tasks placed on the probability x impact risk matrix."""
    return await call(dashboard_api.get_risk_data)


@mcp.tool()
async def get_calendar(start_date: datetime | None = None, end_date: datetime | None = None) -> dict[str, Any]:
    """Dated tasks and projects (start, due, deadline) between two dates."""
    return await call(calendar_api.get_calendar_events, start_date=start_date, end_date=end_date)


@mcp.tool()
async def search(query: Annotated[str, Field(min_length=1, max_length=200)]) -> list[dict[str, Any]]:
    """Search projects, tasks, ideas and files you can see (title / name / description, up to 20 hits)."""
    return await call(search_api.search_all, q=query)
