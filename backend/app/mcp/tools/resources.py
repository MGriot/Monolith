"""MCP resources (read-only context documents) and prompt templates."""
import json

from app.api.api_v1.endpoints import metadata as metadata_api
from app.api.api_v1.endpoints import projects as projects_api
from app.api.api_v1.endpoints import users as users_api
from app.mcp.context import call
from app.mcp.server import mcp


def _json(data) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False)


@mcp.resource("monolith://me", name="me", mime_type="application/json")
async def me_resource() -> str:
    """The account this MCP token acts as."""
    return _json(await call(users_api.read_user_me))


@mcp.resource("monolith://projects", name="projects", mime_type="application/json")
async def projects_resource() -> str:
    """Every active project you can see."""
    return _json(await call(projects_api.read_projects, skip=0, limit=500, include_archived=False))


@mcp.resource("monolith://projects/{project_id}", name="project", mime_type="application/json")
async def project_resource(project_id: str) -> str:
    """One project's metadata, members and task tree."""
    from app.mcp.tools.projects import get_project
    from uuid import UUID

    return _json(await get_project(UUID(project_id), include_tasks=True))


@mcp.resource("monolith://metadata/topics", name="topics", mime_type="application/json")
async def topics_resource() -> str:
    """Global topics."""
    return _json(await call(metadata_api.read_topics, skip=0, limit=500, project_id=None, task_id=None,
                            all_scopes=False, include_global=True))


@mcp.resource("monolith://metadata/work-types", name="work-types", mime_type="application/json")
async def work_types_resource() -> str:
    """Global work types."""
    return _json(await call(metadata_api.read_work_types, skip=0, limit=500, project_id=None, task_id=None,
                            all_scopes=False, include_global=True))


@mcp.prompt()
def plan_project(goal: str, start_date: str, deadline: str, budget: str = "") -> str:
    """Turn a goal into a fully specified Monolith project (phases, tasks, estimates, dependencies)."""
    return f"""Plan a project in Monolith for this goal: {goal}

Constraints: starts {start_date}, hard deadline {deadline}{f', budget {budget}' if budget else ''}.

1. Call `whoami` and `list_users` to know who can be assigned; `list_topics` / `list_work_types` for tags.
2. `create_project` with name, description, start_date, due_date (planned finish, before the deadline),
   deadline_at, budget, priority, risk_probability / risk_impact and tags.
3. Create 4-6 phase tasks, then their subtasks with `parent_id`, each with optimistic/normal/pessimistic days,
   a budget, assignee_ids and a checklist where useful. Mark go/no-go points with is_milestone.
4. Link work with `add_dependency` (FS by default, lag where needed), then check `get_critical_path` and make sure
   the critical path finishes before the deadline; adjust estimates or scope if it does not.
5. Summarise the plan: phases, critical path, total budget, top risks."""


@mcp.prompt()
def weekly_status_report(project_id: str) -> str:
    """Draft a status report for one project from its live data."""
    return f"""Write a weekly status report for Monolith project {project_id}.

Use `get_project` (metadata, statistics, task tree), `get_critical_path`, `get_timesheet` for the last 7 days and
`list_comments` on the project. Report: overall status (on track / at risk / late vs. deadline_at), progress %,
budget vs. real cost, work completed this week, work due next week, critical-path slips, blockers and risks,
decisions needed. Keep it under 300 words, with a short table of the next milestones."""
