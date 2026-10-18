"""Per-project configuration: custom fields and automation rules."""
from typing import Annotated, Any
from uuid import UUID

from pydantic import Field

from app.api.api_v1.endpoints import automations as automations_api
from app.api.api_v1.endpoints import custom_fields as fields_api
from app.mcp.context import call
from app.mcp.server import mcp
from app.schemas.automation import AutomationRuleCreate, AutomationRuleUpdate
from app.schemas.custom_field import CustomFieldDefCreate, CustomFieldDefUpdate


@mcp.tool()
async def list_custom_fields(project_id: UUID) -> list[dict[str, Any]]:
    """A project's custom fields. Task values live in `custom_values`, keyed by field id."""
    return await call(fields_api.list_custom_fields, project_id=project_id)


@mcp.tool()
async def create_custom_field(project_id: UUID, field: CustomFieldDefCreate) -> dict[str, Any]:
    """Add a custom field (admin role). field_type: text, number, select (give `options`), date or user."""
    return await call(fields_api.create_custom_field, project_id=project_id, body=field)


@mcp.tool()
async def update_custom_field(project_id: UUID, field_id: UUID, changes: CustomFieldDefUpdate) -> dict[str, Any]:
    """Rename a custom field, change its select options or its position (admin role)."""
    return await call(fields_api.update_custom_field, project_id=project_id, field_id=field_id, body=changes)


@mcp.tool()
async def delete_custom_field(project_id: UUID, field_id: UUID) -> dict[str, Any]:
    """Delete a custom field and its values on every task (admin role)."""
    return await call(fields_api.delete_custom_field, project_id=project_id, field_id=field_id)


AUTOMATION_HELP = """
Triggers: task_created, status_changed, assigned, due_soon (48 h), task_completed.
Conditions: [{"field": status|old_status|priority|assignee|title|tags|is_milestone|due_date,
              "op": eq|neq|in|not_in|contains|is_set|is_empty, "value": ...}]
Actions: {"type": "set_field", "field": status|priority|assignee, "value": ...},
         {"type": "assign_user", "user_id": ...},
         {"type": "notify", "to": assignees|owner|user, "message": "... {task_title} {status} {priority} {project}"},
         {"type": "call_webhook", "webhook_id": ...}
"""


@mcp.tool(description="List a project's automation rules." + AUTOMATION_HELP)
async def list_automations(project_id: UUID) -> list[dict[str, Any]]:
    return await call(automations_api.list_rules, project_id=project_id)


@mcp.tool(description="Create an automation rule (admin role)." + AUTOMATION_HELP)
async def create_automation(project_id: UUID, rule: AutomationRuleCreate) -> dict[str, Any]:
    return await call(automations_api.create_rule, project_id=project_id, body=rule)


@mcp.tool(description="Change an automation rule (admin role); only the keys you send are touched." + AUTOMATION_HELP)
async def update_automation(project_id: UUID, rule_id: UUID, changes: AutomationRuleUpdate) -> dict[str, Any]:
    return await call(automations_api.update_rule, project_id=project_id, rule_id=rule_id, body=changes)


@mcp.tool()
async def delete_automation(project_id: UUID, rule_id: UUID) -> dict[str, Any]:
    """Delete an automation rule (admin role)."""
    return await call(automations_api.delete_rule, project_id=project_id, rule_id=rule_id)


@mcp.tool()
async def list_automation_runs(
    project_id: UUID, rule_id: UUID, limit: Annotated[int, Field(ge=1, le=200)] = 50
) -> list[dict[str, Any]]:
    """Recent executions of a rule (status and message), newest first."""
    return await call(automations_api.list_rule_runs, project_id=project_id, rule_id=rule_id, limit=limit)
