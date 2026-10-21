"""MCP server: tool registry, schemas, and the REST bridge (no database).

Run:  pytest backend/tests/test_mcp_registry.py
"""
import asyncio
import inspect
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.params import Depends as DependsParam
from mcp.server.fastmcp.exceptions import ToolError

from app.api import deps
from app.core import mcp_tokens
from app.mcp import context
from app.mcp.server import mcp
from app.schemas.task import TaskUpdate


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(scope="module")
def tools():
    return {t.name: t for t in run(mcp.list_tools())}


EXPECTED = {
    # identity & people
    "whoami", "list_users", "create_user", "list_pending_users", "approve_user", "reject_user",
    # projects & members
    "list_projects", "get_project", "create_project", "update_project", "archive_project", "restore_project",
    "delete_project", "get_project_statistics", "export_project_json", "list_project_members",
    "set_project_member_role", "remove_project_member", "get_portfolio_health", "get_project_activity",
    # tasks
    "list_tasks", "get_task", "create_task", "update_task", "update_task_status", "bulk_update_tasks",
    "archive_task", "restore_task", "delete_task", "list_archived_tasks", "list_my_tasks",
    "add_dependency", "remove_dependency", "get_critical_path", "get_task_activity",
    # time, fields, automations
    "start_timer", "stop_timer", "get_running_timer", "log_time", "update_time_entry", "delete_time_entry",
    "get_task_time", "get_timesheet", "list_custom_fields", "create_custom_field", "update_custom_field",
    "delete_custom_field", "list_automations", "create_automation", "update_automation", "delete_automation",
    "list_automation_runs",
    # collaboration
    "list_comments", "add_comment", "edit_comment", "delete_comment", "list_ideas", "propose_idea", "update_idea",
    "vote_idea", "promote_idea_to_task", "promote_idea_to_project", "delete_idea", "list_whiteboards",
    "get_whiteboard", "create_whiteboard", "update_whiteboard", "delete_whiteboard",
    # files
    "list_folders", "create_folder", "rename_or_move_folder", "delete_folder", "create_note", "update_file",
    "delete_file",
    # organisation
    "list_teams", "get_team_activity", "create_team", "update_team", "delete_team", "list_topics", "create_topic",
    "update_topic", "delete_topic", "list_work_types", "create_work_type", "update_work_type", "delete_work_type",
    "list_templates", "get_template", "create_template", "update_template", "delete_template", "list_workflows",
    "get_workflow", "create_workflow", "update_workflow", "delete_workflow", "list_webhooks", "create_webhook",
    "update_webhook", "delete_webhook", "test_webhook", "list_notifications", "mark_notification_read",
    "mark_all_notifications_read",
    # insights
    "get_dashboard_summary", "get_activity_recap", "get_team_workload", "get_risk_matrix", "get_calendar", "search",
}


class TestRegistry:
    def test_every_expected_tool_is_registered(self, tools):
        assert EXPECTED <= set(tools), sorted(EXPECTED - set(tools))

    def test_every_tool_has_a_description_and_an_object_schema(self, tools):
        for name, tool in tools.items():
            assert tool.description and tool.description.strip(), name
            assert tool.inputSchema.get("type") == "object", name

    def test_every_tool_returns_structured_json(self, tools):
        # without an output schema a list result reaches the client as one text block per item
        for name, tool in tools.items():
            assert tool.outputSchema, name

    def test_no_untyped_catch_all_parameters(self, tools):
        # the old update_task(**kwargs) turned into one required string named "kwargs" and silently did nothing
        for name, tool in tools.items():
            assert "kwargs" not in tool.inputSchema.get("properties", {}), name

    def test_status_is_an_enum(self, tools):
        status = tools["update_task_status"].inputSchema["properties"]["status"]
        assert set(status["enum"]) == {"Backlog", "Todo", "In Progress", "On hold", "Review", "Done"}

    def test_create_project_exposes_every_metadata_field(self, tools):
        schema = tools["create_project"].inputSchema
        project = schema["$defs"]["ProjectCreate"]["properties"]
        for field in ("name", "description", "start_date", "due_date", "deadline_at", "budget", "real_cost",
                      "risk_probability", "risk_impact", "status", "priority", "tags", "member_ids", "topic_ids"):
            assert field in project, field

    def test_resources_and_prompts(self):
        uris = {str(r.uri) for r in run(mcp.list_resources())}
        assert {"monolith://me", "monolith://projects"} <= uris
        assert {p.name for p in run(mcp.list_prompts())} == {"plan_project", "weekly_status_report"}

    def test_bridged_handlers_only_use_injectable_dependencies(self):
        allowed = {deps.get_db, deps.get_current_user, deps.get_current_user_optional, deps.get_current_admin}
        for endpoint in context.routes_by_endpoint():
            if endpoint.__module__.rsplit(".", 1)[-1] in ("login", "auth"):
                continue  # sign-in flows are deliberately not exposed over MCP
            for p in inspect.signature(endpoint).parameters.values():
                if isinstance(p.default, DependsParam):
                    assert p.default.dependency in allowed, (endpoint.__name__, p.default.dependency)


class FakeSession:
    def __init__(self):
        self.commit = AsyncMock()
        self.rollback = AsyncMock()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


@pytest.fixture
def bridge(monkeypatch):
    session = FakeSession()
    user = SimpleNamespace(id=uuid4(), is_superuser=False, is_active=True)
    monkeypatch.setattr(context, "AsyncSessionLocal", lambda: session)
    monkeypatch.setattr(context, "resolve_token_hash", AsyncMock(return_value=user))
    token = mcp_tokens.mcp_token_hash.set("hash")
    yield SimpleNamespace(session=session, user=user)
    mcp_tokens.mcp_token_hash.reset(token)


class TestBridge:
    def test_injects_session_and_user_and_commits(self, bridge):
        seen = {}

        async def endpoint(project_id, db=DependsParam(deps.get_db), current_user=DependsParam(deps.get_current_user)):
            seen.update(project_id=project_id, db=db, user=current_user)
            return {"ok": 1}

        assert run(context.call(endpoint, project_id="p")) == {"ok": 1}
        assert seen == {"project_id": "p", "db": bridge.session, "user": bridge.user}
        bridge.session.commit.assert_awaited_once()

    def test_http_errors_become_tool_errors_and_roll_back(self, bridge):
        async def endpoint(db=DependsParam(deps.get_db)):
            raise HTTPException(status_code=403, detail="Not enough permissions")

        with pytest.raises(ToolError, match="Permission denied: Not enough permissions"):
            run(context.call(endpoint))
        bridge.session.rollback.assert_awaited_once()

    def test_admin_only_handlers_refuse_regular_users(self, bridge):
        async def endpoint(current_user=DependsParam(deps.get_current_admin)):
            return {}

        with pytest.raises(ToolError, match="administrators only"):
            run(context.call(endpoint))

    def test_query_defaults_are_resolved(self, bridge):
        from fastapi import Query

        async def endpoint(limit: int = Query(25, ge=1), db=DependsParam(deps.get_db)):
            return {"limit": limit}

        assert run(context.call(endpoint)) == {"limit": 25}

    def test_without_a_token_nothing_runs(self, monkeypatch):
        monkeypatch.setattr(context, "AsyncSessionLocal", lambda: FakeSession())
        with pytest.raises(ToolError, match="Not authenticated"):
            run(context.call(AsyncMock()))

    def test_revoked_token_is_refused_on_the_next_call(self, bridge, monkeypatch):
        monkeypatch.setattr(context, "resolve_token_hash", AsyncMock(return_value=None))
        with pytest.raises(ToolError, match="revoked"):
            run(context.call(AsyncMock()))

    def test_build_reports_validation_errors(self):
        from app.schemas.project import ProjectCreate

        with pytest.raises(ToolError, match="name"):
            context.build(ProjectCreate, {"description": "no name"})


class TestTools:
    def test_update_task_status_sends_only_the_status(self, monkeypatch):
        from app.mcp.tools import tasks

        captured = {}

        async def fake_call(endpoint, **kwargs):
            captured.update(kwargs)
            return {"id": "t"}

        monkeypatch.setattr(tasks, "call", fake_call)
        tid = uuid4()
        run(mcp.call_tool("update_task_status", {"task_id": str(tid), "status": "Review"}))
        assert captured["task_id"] == tid
        assert isinstance(captured["task_in"], TaskUpdate)
        assert captured["task_in"].model_dump(exclude_unset=True) == {"status": "Review"}

    def test_update_task_passes_partial_changes(self, monkeypatch):
        from app.mcp.tools import tasks

        captured = {}

        async def fake_call(endpoint, **kwargs):
            captured.update(kwargs)
            return {}

        monkeypatch.setattr(tasks, "call", fake_call)
        run(mcp.call_tool("update_task", {"task_id": str(uuid4()), "changes": {"budget": 1200, "is_milestone": True}}))
        assert captured["task_in"].model_dump(exclude_unset=True) == {"budget": 1200.0, "is_milestone": True}

    def test_critical_path_is_in_wbs_order_even_without_codes(self, monkeypatch):
        from app.mcp.tools import tasks

        tree = [
            {"id": "a", "title": "A", "wbs_code": "2", "is_critical": True, "slack_days": 0, "subtasks": [
                {"id": "a1", "title": "A1", "wbs_code": "2.10", "is_critical": True, "slack_days": 0, "subtasks": []},
                {"id": "a2", "title": "A2", "wbs_code": "2.9", "is_critical": True, "slack_days": 0, "subtasks": []},
            ]},
            {"id": "b", "title": "B", "wbs_code": None, "is_critical": True, "slack_days": None, "subtasks": []},
            {"id": "c", "title": "C", "wbs_code": "1", "is_critical": False, "slack_days": 4, "subtasks": []},
        ]
        monkeypatch.setattr(tasks, "call", AsyncMock(return_value=tree))
        out = run(tasks.get_critical_path(uuid4()))
        assert [t["id"] for t in out["critical_tasks"]] == ["b", "a", "a2", "a1"]
        assert [s["id"] for s in out["slack"]] == ["c", "a", "a2", "a1"]

    def test_comments_need_exactly_one_target(self):
        from app.mcp.tools import collaboration

        with pytest.raises(ToolError):
            run(collaboration.add_comment(content="hi", project_id=uuid4(), task_id=uuid4()))
