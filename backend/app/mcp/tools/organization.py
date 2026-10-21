"""Workspace-wide objects: teams, taxonomy (topics, work types), templates, SOP workflows, webhooks, notifications."""
from typing import Annotated, Any
from uuid import UUID

from pydantic import Field

from app.api.api_v1.endpoints import metadata as metadata_api
from app.api.api_v1.endpoints import notifications as notifications_api
from app.api.api_v1.endpoints import teams as teams_api
from app.api.api_v1.endpoints import templates as templates_api
from app.api.api_v1.endpoints import webhooks as webhooks_api
from app.api.api_v1.endpoints import workflows as workflows_api
from app.mcp.context import build, call, Json
from app.mcp.server import mcp
from app.schemas.metadata import TopicCreate, TopicUpdate, WorkTypeCreate, WorkTypeUpdate
from app.schemas.notification import NotificationUpdate
from app.schemas.team import TeamCreate, TeamUpdate
from app.schemas.template import ProjectTemplateCreate, ProjectTemplateUpdate
from app.schemas.webhook import WebhookCreate, WebhookUpdate
from app.schemas.workflow import WorkflowCreate, WorkflowUpdate

Limit = Annotated[int, Field(ge=1, le=500)]
Offset = Annotated[int, Field(ge=0)]

# --- teams -------------------------------------------------------------------------------------------------------


@mcp.tool()
async def list_teams(limit: Limit = 100, offset: Offset = 0) -> list[dict[str, Any]]:
    """Teams you own, belong to, or that are shared with you / public."""
    return await call(teams_api.read_teams, skip=offset, limit=limit)


@mcp.tool()
async def get_team_activity(limit: Annotated[int, Field(ge=1, le=200)] = 50) -> Json:
    """Recent work by the members of your teams."""
    return await call(teams_api.read_team_activity, limit=limit)


@mcp.tool()
async def create_team(team: TeamCreate) -> dict[str, Any]:
    """Create a team (name, description, member_ids, shared_with_ids, is_public)."""
    return await call(teams_api.create_team, obj_in=team)


@mcp.tool()
async def update_team(team_id: UUID, changes: TeamUpdate) -> dict[str, Any]:
    """Change a team you own or co-own."""
    return await call(teams_api.update_team, id=team_id, obj_in=changes)


@mcp.tool()
async def delete_team(team_id: UUID) -> dict[str, Any]:
    """Delete a team you own."""
    return await call(teams_api.delete_team, id=team_id)


# --- taxonomy ----------------------------------------------------------------------------------------------------


@mcp.tool()
async def list_topics(project_id: UUID | None = None, task_id: UUID | None = None,
                      include_global: bool = True, all_scopes: bool = False) -> list[dict[str, Any]]:
    """Topics (coloured tags). Global ones, plus those scoped to a project or task when you pass its id."""
    return await call(metadata_api.read_topics, skip=0, limit=500, project_id=project_id, task_id=task_id,
                      all_scopes=all_scopes, include_global=include_global)


@mcp.tool()
async def create_topic(topic: TopicCreate) -> dict[str, Any]:
    """Create a topic: global (administrators) or scoped to a project/task (its admins)."""
    return await call(metadata_api.create_topic, topic_in=topic)


@mcp.tool()
async def update_topic(topic_id: UUID, changes: TopicUpdate) -> dict[str, Any]:
    """Rename / recolour / deactivate a topic."""
    return await call(metadata_api.update_topic, id=str(topic_id), topic_in=changes)


@mcp.tool()
async def delete_topic(topic_id: UUID) -> dict[str, Any]:
    """Delete a topic."""
    return await call(metadata_api.delete_topic, id=str(topic_id))


@mcp.tool()
async def list_work_types(project_id: UUID | None = None, task_id: UUID | None = None,
                          include_global: bool = True, all_scopes: bool = False) -> list[dict[str, Any]]:
    """Work types (kinds of work, e.g. Engineering, Design). Same scoping rules as topics."""
    return await call(metadata_api.read_work_types, skip=0, limit=500, project_id=project_id, task_id=task_id,
                      all_scopes=all_scopes, include_global=include_global)


@mcp.tool()
async def create_work_type(work_type: WorkTypeCreate) -> dict[str, Any]:
    """Create a work type: global (administrators) or scoped to a project/task."""
    return await call(metadata_api.create_work_type, work_type_in=work_type)


@mcp.tool()
async def update_work_type(work_type_id: UUID, changes: WorkTypeUpdate) -> dict[str, Any]:
    """Rename / recolour / deactivate a work type."""
    return await call(metadata_api.update_work_type, id=str(work_type_id), work_type_in=changes)


@mcp.tool()
async def delete_work_type(work_type_id: UUID) -> dict[str, Any]:
    """Delete a work type."""
    return await call(metadata_api.delete_work_type, id=str(work_type_id))


# --- templates & SOP workflows -----------------------------------------------------------------------------------


@mcp.tool()
async def list_templates(limit: Limit = 100, offset: Offset = 0) -> list[dict[str, Any]]:
    """Project templates (task tree + taxonomy presets) you can use with `create_project(template_id=...)`."""
    return await call(templates_api.read_templates, skip=offset, limit=limit)


@mcp.tool()
async def get_template(template_id: UUID) -> dict[str, Any]:
    """One template with its `tasks_json` tree."""
    return await call(templates_api.read_template, id=template_id)


@mcp.tool()
async def create_template(template: ProjectTemplateCreate) -> dict[str, Any]:
    """Create a project template. `tasks_json` is a list of {title, description, duration_days, subtasks: [...]}."""
    return await call(templates_api.create_template, obj_in=template)


@mcp.tool()
async def update_template(template_id: UUID, changes: ProjectTemplateUpdate) -> dict[str, Any]:
    """Change a template you own or co-own."""
    return await call(templates_api.update_template, id=template_id, obj_in=changes)


@mcp.tool()
async def delete_template(template_id: UUID) -> dict[str, Any]:
    """Delete a template you own."""
    return await call(templates_api.delete_template, id=template_id)


@mcp.tool()
async def list_workflows(limit: Limit = 100, offset: Offset = 0) -> list[dict[str, Any]]:
    """Standard operating procedures (Markdown + LaTeX documents)."""
    return await call(workflows_api.read_workflows, skip=offset, limit=limit)


@mcp.tool()
async def get_workflow(workflow_id: UUID) -> dict[str, Any]:
    """One SOP with its full content."""
    return await call(workflows_api.read_workflow, id=workflow_id)


@mcp.tool()
async def create_workflow(workflow: WorkflowCreate) -> dict[str, Any]:
    """Write a new SOP (title, description, Markdown `content` with $LaTeX$, is_public, shared_with_ids)."""
    return await call(workflows_api.create_workflow, obj_in=workflow)


@mcp.tool()
async def update_workflow(workflow_id: UUID, changes: WorkflowUpdate) -> dict[str, Any]:
    """Edit an SOP you own or co-own."""
    return await call(workflows_api.update_workflow, id=workflow_id, obj_in=changes)


@mcp.tool()
async def delete_workflow(workflow_id: UUID) -> dict[str, Any]:
    """Delete an SOP you own."""
    return await call(workflows_api.delete_workflow, id=workflow_id)


# --- webhooks ----------------------------------------------------------------------------------------------------


@mcp.tool()
async def list_webhooks(project_id: UUID | None = None, limit: Limit = 100, offset: Offset = 0) -> list[dict[str, Any]]:
    """Your outgoing webhooks (Slack, Discord or generic JSON), optionally for one project."""
    return await call(webhooks_api.read_webhooks, skip=offset, limit=limit, project_id=project_id)


@mcp.tool()
async def create_webhook(webhook: WebhookCreate) -> dict[str, Any]:
    """Add a webhook (name, url, provider: slack|discord|generic, project_id). Private addresses are refused."""
    return await call(webhooks_api.create_webhook, obj_in=webhook)


@mcp.tool()
async def update_webhook(webhook_id: UUID, changes: WebhookUpdate) -> dict[str, Any]:
    """Change or pause (`is_active: false`) a webhook."""
    return await call(webhooks_api.update_webhook, id=webhook_id, obj_in=changes)


@mcp.tool()
async def delete_webhook(webhook_id: UUID) -> dict[str, Any]:
    """Delete a webhook."""
    return await call(webhooks_api.delete_webhook, id=webhook_id)


@mcp.tool()
async def test_webhook(webhook_id: UUID) -> Json:
    """Send a test message through a webhook."""
    return await call(webhooks_api.test_webhook, id=webhook_id)


# --- notifications -----------------------------------------------------------------------------------------------


@mcp.tool()
async def list_notifications(
    unread_only: bool = False, type: str | None = None, limit: Limit = 50, offset: Offset = 0
) -> list[dict[str, Any]]:
    """Your in-app notifications, newest first."""
    return await call(notifications_api.read_notifications, skip=offset, limit=limit,
                      is_read=False if unread_only else None, type=type)


@mcp.tool()
async def mark_notification_read(notification_id: UUID, is_read: bool = True) -> dict[str, Any]:
    """Mark one notification as read (or unread again)."""
    return await call(notifications_api.update_notification, notification_id=notification_id,
                      notification_in=build(NotificationUpdate, {"is_read": is_read}))


@mcp.tool()
async def mark_all_notifications_read() -> Json:
    """Mark all your notifications as read."""
    return await call(notifications_api.mark_all_notifications_as_read)
