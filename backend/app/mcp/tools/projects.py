from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import Field

from app.api.api_v1.endpoints import activity as activity_api
from app.api.api_v1.endpoints import custom_fields as fields_api
from app.api.api_v1.endpoints import projects as projects_api
from app.api.api_v1.endpoints import tasks as tasks_api
from app.mcp.context import build, call, Json
from app.mcp.server import mcp
from app.schemas.project import ProjectCreate, ProjectUpdate

Role = Literal["viewer", "editor", "admin"]


@mcp.tool()
async def list_projects(
    include_archived: bool = False,
    limit: Annotated[int, Field(ge=1, le=500)] = 100,
    offset: Annotated[int, Field(ge=0)] = 0,
) -> list[dict[str, Any]]:
    """Projects you can see (owner, member, or all for administrators), with their metadata."""
    return await call(projects_api.read_projects, skip=offset, limit=limit, include_archived=include_archived)


@mcp.tool()
async def get_project(project_id: UUID, include_tasks: bool = True) -> dict[str, Any]:
    """One project: full metadata, your role (`my_role`), members, statistics and (optionally) the task tree.

    Tasks come nested (`subtasks`) with WBS codes and critical-path flags (`is_critical`, `slack_days`).
    """
    project = await call(projects_api.read_project, project_id=project_id)
    project["statistics"] = await call(projects_api.read_project_statistics, project_id=project_id)
    if include_tasks:
        project["tasks"] = await call(tasks_api.read_tasks, project_id=project_id, skip=0, limit=500)
    return project


@mcp.tool()
async def create_project(project: ProjectCreate) -> dict[str, Any]:
    """Create a project; you become its owner (admin role).

    Accepts every project field: name (required), description, status, priority, start_date, due_date (planned
    finish), deadline_at (hard deadline), budget (planned) and real_cost (actual), risk_probability / risk_impact
    (1-5), tags, topic_ids / type_ids (see `list_topics`, `list_work_types`), member_ids (they join as editors; use
    `set_project_member_role` to change), template_id (copies a template's task tree).
    """
    return await call(projects_api.create_project, project_in=project)


@mcp.tool()
async def update_project(project_id: UUID, changes: ProjectUpdate) -> dict[str, Any]:
    """Change project fields (editor role or above); only the keys you send are touched."""
    return await call(projects_api.update_project, project_id=project_id, project_in=changes)


@mcp.tool()
async def archive_project(project_id: UUID) -> dict[str, Any]:
    """Archive a project (hidden from lists, kept for history). Admin role."""
    return await call(projects_api.archive_project, project_id=project_id)


@mcp.tool()
async def restore_project(project_id: UUID) -> dict[str, Any]:
    """Bring an archived project back. Admin role."""
    return await call(projects_api.restore_project, project_id=project_id)


@mcp.tool()
async def delete_project(project_id: UUID) -> dict[str, Any]:
    """Permanently delete a project and everything in it. Admin role. Prefer `archive_project`."""
    return await call(projects_api.delete_project, project_id=project_id)


@mcp.tool()
async def get_project_statistics(project_id: UUID) -> Json:
    """Counts by status and priority, progress, overdue tasks, budget versus actual cost."""
    return await call(projects_api.read_project_statistics, project_id=project_id)


@mcp.tool()
async def export_project_json(project_id: UUID) -> dict[str, Any]:
    """Everything about a project in one JSON document: metadata, members, custom fields and the full task tree."""
    project = await get_project(project_id, include_tasks=True)
    project["members_with_roles"] = await call(projects_api.list_project_members, project_id=project_id)
    project["custom_fields"] = await call(fields_api.list_custom_fields, project_id=project_id)
    return project


# --- members -----------------------------------------------------------------------------------------------------

@mcp.tool()
async def list_project_members(project_id: UUID) -> list[dict[str, Any]]:
    """People with access to a project and their role (viewer, editor, admin; the owner is always admin)."""
    return await call(projects_api.list_project_members, project_id=project_id)


@mcp.tool()
async def set_project_member_role(project_id: UUID, user_id: UUID, role: Role) -> dict[str, Any]:
    """Add someone to a project or change their role. Admin role on the project."""
    body = build(projects_api.MemberRoleIn, {"role": role})
    return await call(projects_api.set_project_member_role, project_id=project_id, user_id=user_id, body=body)


@mcp.tool()
async def remove_project_member(project_id: UUID, user_id: UUID) -> dict[str, Any]:
    """Remove someone's access to a project. Admin role on the project."""
    return await call(projects_api.remove_project_member, project_id=project_id, user_id=user_id)


@mcp.tool()
async def get_portfolio_health() -> dict[str, Any]:
    """Health score, risk level and overdue counts for every active project you can see."""
    return await call(projects_api.get_portfolio_health)


@mcp.tool()
async def get_project_activity(
    project_id: UUID,
    limit: Annotated[int, Field(ge=1, le=500)] = 50,
    kind: Annotated[str | None, Field(description="Only one kind: created, updated, status_changed, assigned, "
                                                  "archived, restored, deleted, dependency_added, dependency_removed")] = None,
) -> list[dict[str, Any]]:
    """The project's change log, newest first: who created, edited, moved, assigned or deleted which task.

    `actor` is the person; `actor_label` names automatic changes ("Automation: <rule>", "Automatic (from subtasks)").
    """
    return await call(activity_api.read_project_activity, project_id=project_id, limit=limit, before=None, kind=kind)
