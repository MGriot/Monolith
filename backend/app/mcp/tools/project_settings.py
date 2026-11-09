"""Per-project configuration: custom fields and automation rules."""
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import Field

from app.api.api_v1.endpoints import automations as automations_api
from app.api.api_v1.endpoints import custom_fields as fields_api
from app.mcp.context import call
from app.mcp.server import mcp
from app.schemas.automation import AutomationRuleCreate, AutomationRuleUpdate
from app.schemas.custom_field import CustomFieldDefCreate, CustomFieldDefUpdate


FIELD_HELP = """
field_type: text, number, currency, select (give `options`), date, user, checkbox or url.
applies_to: "task" (values on tasks, the default) or "project" (values on the project itself).
number takes an optional free-text `unit` ("h", "kg", "%"); currency an optional ISO `currency` ("EUR", empty =
the instance currency). Both take `min_value`, `max_value` and `decimals` (0-6).
Values go in `custom_values` ({field_id: value}) on the task or project: number/currency a number, checkbox
true/false, url an http(s) link, date "YYYY-MM-DD", user a user id, select one of the options; null clears.
"""


@mcp.tool()
async def list_custom_fields(project_id: UUID, applies_to: Literal["project", "task"] | None = None) -> list[dict[str, Any]]:
    """Every custom field a project sees: global ones (scope "global") first, then its own. Values live in
    `custom_values` on tasks (applies_to "task") or on the project (applies_to "project"), keyed by field id."""
    return await call(fields_api.list_custom_fields, project_id=project_id, applies_to=applies_to)


@mcp.tool(description="Add a custom field to one project (admin role)." + FIELD_HELP)
async def create_custom_field(project_id: UUID, field: CustomFieldDefCreate) -> dict[str, Any]:
    return await call(fields_api.create_custom_field, project_id=project_id, body=field)


@mcp.tool()
async def update_custom_field(project_id: UUID, field_id: UUID, changes: CustomFieldDefUpdate) -> dict[str, Any]:
    """Rename a project's custom field, change its options, unit, currency, limits, decimals or position (admin role).
    The type and applies_to are fixed. Values outside new options or limits are cleared."""
    return await call(fields_api.update_custom_field, project_id=project_id, field_id=field_id, body=changes)


@mcp.tool()
async def delete_custom_field(project_id: UUID, field_id: UUID) -> dict[str, Any]:
    """Delete a project's custom field and its stored values (admin role)."""
    return await call(fields_api.delete_custom_field, project_id=project_id, field_id=field_id)


@mcp.tool()
async def list_global_custom_fields(applies_to: Literal["project", "task"] | None = None) -> list[dict[str, Any]]:
    """Global custom fields, which every project gets."""
    return await call(fields_api.list_global_custom_fields, applies_to=applies_to)


@mcp.tool(description="Add a global custom field that every project gets (superuser only)." + FIELD_HELP)
async def create_global_custom_field(field: CustomFieldDefCreate) -> dict[str, Any]:
    return await call(fields_api.create_global_custom_field, body=field)


@mcp.tool()
async def update_global_custom_field(field_id: UUID, changes: CustomFieldDefUpdate) -> dict[str, Any]:
    """Change a global custom field (superuser only); same rules as `update_custom_field`."""
    return await call(fields_api.update_global_custom_field, field_id=field_id, body=changes)


@mcp.tool()
async def delete_global_custom_field(field_id: UUID) -> dict[str, Any]:
    """Delete a global custom field and its values on every project or task (superuser only)."""
    return await call(fields_api.delete_global_custom_field, field_id=field_id)


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
