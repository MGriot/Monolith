from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import Field

from app.api.api_v1.endpoints import tasks as tasks_api
from app.core.enums import DependencyType
from app.mcp.context import build, call
from app.mcp.server import mcp
from app.schemas.task import BulkTaskRequest, DependencyCreate, TaskCreate, TaskUpdate


def _flatten(tasks: list[dict]) -> list[dict]:
    out = []
    for t in tasks:
        out.append(t)
        out.extend(_flatten(t.get("subtasks") or []))
    return out


def _wbs_key(task: dict):
    """Sort key for WBS codes ("2.10" after "2.9"); tasks without a code come first."""
    code = task.get("wbs_code") or ""
    return tuple((0, int(p), "") if p.isdigit() else (1, 0, p) for p in code.split(".") if p)


@mcp.tool()
async def list_tasks(
    project_id: UUID,
    parent_id: Annotated[UUID | None, Field(description="Only the children of this task")] = None,
    include_archived: bool = False,
    flat: Annotated[bool, Field(description="Return a flat list (with parent_id) instead of a nested tree")] = False,
    limit: Annotated[int, Field(ge=1, le=500)] = 200,
    offset: Annotated[int, Field(ge=0)] = 0,
) -> list[dict[str, Any]]:
    """A project's tasks as a tree with WBS codes, assignees, dependencies and critical-path data."""
    tree = await call(tasks_api.read_tasks, project_id=project_id, parent_id=parent_id,
                      include_archived=include_archived, skip=offset, limit=limit)
    if not flat:
        return tree
    rows = _flatten(tree)
    for row in rows:
        row["subtasks"] = [s["id"] for s in row.get("subtasks") or []]
    return rows


@mcp.tool()
async def get_task(task_id: UUID) -> dict[str, Any]:
    """One task with every field, its subtasks, assignees and dependencies."""
    return await call(tasks_api.read_task, task_id=task_id)


@mcp.tool()
async def create_task(task: TaskCreate) -> dict[str, Any]:
    """Create a task (editor role). Set `project_id`, and `parent_id` to nest it under another task of that project.

    All fields are accepted: title, description, status, priority, is_milestone, start_date, due_date, deadline_at,
    optimistic_days / normal_days / pessimistic_days (PERT) or duration_days, budget, real_cost, risk_probability /
    risk_impact (1-5), tags, checklist ([{"text": "...", "is_done": false}]), custom_values ({field_id: value}),
    recurrence_rule (e.g. "FREQ=WEEKLY;BYDAY=MO"), assignee_ids, topic_ids, type_ids, color, and `subtasks`
    (nested quick-create).
    """
    return await call(tasks_api.create_task, task_in=task)


@mcp.tool()
async def update_task(task_id: UUID, changes: TaskUpdate) -> dict[str, Any]:
    """Change a task (editor role); only the keys you send are touched. Dates recalculate from duration and back."""
    return await call(tasks_api.update_task, task_id=task_id, task_in=changes)


@mcp.tool()
async def update_task_status(
    task_id: UUID,
    status: Literal["Backlog", "Todo", "In Progress", "On hold", "Review", "Done"],
) -> dict[str, Any]:
    """Shortcut to move a task to another status (parents and the project progress update automatically)."""
    return await call(tasks_api.update_task, task_id=task_id, task_in=build(TaskUpdate, {"status": status}))


@mcp.tool()
async def bulk_update_tasks(request: BulkTaskRequest) -> dict[str, Any]:
    """Apply one change to many tasks: either `patch` (status, priority, assignees) or `action` (archive/restore/delete)."""
    return await call(tasks_api.bulk_update_tasks, body=request)


@mcp.tool()
async def archive_task(task_id: UUID) -> dict[str, Any]:
    """Archive a task and its subtasks."""
    return await call(tasks_api.archive_task, task_id=task_id)


@mcp.tool()
async def restore_task(task_id: UUID) -> dict[str, Any]:
    """Restore an archived task."""
    return await call(tasks_api.restore_task, task_id=task_id)


@mcp.tool()
async def delete_task(task_id: UUID) -> dict[str, Any]:
    """Permanently delete a task and its subtasks. Prefer `archive_task`."""
    return await call(tasks_api.delete_task, task_id=task_id)


@mcp.tool()
async def list_archived_tasks(
    limit: Annotated[int, Field(ge=1, le=500)] = 100, offset: Annotated[int, Field(ge=0)] = 0
) -> list[dict[str, Any]]:
    """Archived tasks across the projects you can see."""
    return await call(tasks_api.read_archived_tasks, skip=offset, limit=limit)


@mcp.tool()
async def list_my_tasks(
    limit: Annotated[int, Field(ge=1, le=500)] = 100, offset: Annotated[int, Field(ge=0)] = 0
) -> list[dict[str, Any]]:
    """Tasks assigned to you, across projects."""
    return await call(tasks_api.read_assigned_tasks, skip=offset, limit=limit)


@mcp.tool()
async def add_dependency(
    successor_id: Annotated[UUID, Field(description="The task that waits")],
    predecessor_id: Annotated[UUID, Field(description="The task it waits for")],
    type: Annotated[DependencyType, Field(description="FS finish-to-start (default), SS, FF or SF")] = DependencyType.FS,
    lag_days: Annotated[int, Field(ge=-365, le=365, description="Delay (or lead, if negative) in days")] = 0,
) -> dict[str, Any]:
    """Link two tasks of the same project. Cycles are rejected; the critical path is recalculated."""
    dep = build(DependencyCreate, {"successor_id": successor_id, "predecessor_id": predecessor_id,
                                   "type": type, "lag_days": lag_days})
    return await call(tasks_api.create_task_dependency, task_id=successor_id, dependency_in=dep)


@mcp.tool()
async def remove_dependency(successor_id: UUID, predecessor_id: UUID) -> list[dict[str, Any]]:
    """Remove the link between two tasks; returns the successor's remaining predecessors."""
    return await call(tasks_api.delete_task_dependency, task_id=successor_id, predecessor_id=predecessor_id)


@mcp.tool()
async def get_critical_path(project_id: UUID) -> dict[str, Any]:
    """The project's critical path (CPM over PERT durations, dependencies and deadlines), in WBS order.

    Returns the critical tasks and, for every scheduled task, its slack in days.
    """
    rows = _flatten(await call(tasks_api.read_tasks, project_id=project_id, parent_id=None,
                               include_archived=False, skip=0, limit=500))
    critical = sorted((t for t in rows if t.get("is_critical")), key=_wbs_key)
    slack = sorted(
        ({"id": t["id"], "wbs_code": t.get("wbs_code"), "title": t["title"], "slack_days": t["slack_days"]}
         for t in rows if t.get("slack_days") is not None),
        key=_wbs_key,
    )
    return {
        "critical_tasks": [
            {"id": t["id"], "wbs_code": t.get("wbs_code"), "title": t["title"], "start_date": t.get("start_date"),
             "due_date": t.get("due_date"), "deadline_at": t.get("deadline_at"), "status": t.get("status")}
            for t in critical
        ],
        "slack": slack,
    }
