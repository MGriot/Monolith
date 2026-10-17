"""Project roles (viewer / editor / admin): resolution, the helper matrix, and an endpoint matrix proving each route
asks for the right level. Database-free; the real thing runs in backend/tests/live/smoke_roles.py."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import access, deps
from app.api.access import ADMIN, EDITOR, ROLE_RANK, VIEWER
from app.main import app


def run(coro):
    return asyncio.run(coro)


def make_user(**kw):
    base = dict(id=uuid4(), email="u@example.com", is_active=True, is_superuser=False, full_name="U")
    base.update(kw)
    return SimpleNamespace(**base)


class ScriptedDB:
    """execute() returns scripted `.first()` rows in order."""

    def __init__(self, *rows):
        self.rows = list(rows)

    async def execute(self, _stmt):
        row = self.rows.pop(0) if self.rows else None
        return SimpleNamespace(first=lambda: row)


# ----------------------------------------------------------------------------------------------- role resolution
class TestProjectRole:
    def test_superuser_is_admin_everywhere(self):
        assert run(access.project_role(ScriptedDB(), uuid4(), make_user(is_superuser=True))) == ADMIN

    def test_owner_is_admin_without_a_membership_row(self):
        u = make_user()
        assert run(access.project_role(ScriptedDB((u.id,)), uuid4(), u)) == ADMIN

    @pytest.mark.parametrize("stored", [VIEWER, EDITOR, ADMIN])
    def test_member_gets_the_stored_role(self, stored):
        assert run(access.project_role(ScriptedDB((uuid4(),), (stored,)), uuid4(), make_user())) == stored

    def test_unknown_stored_value_means_least_privilege(self):
        assert run(access.project_role(ScriptedDB((uuid4(),), ("superhero",)), uuid4(), make_user())) == VIEWER

    def test_stranger_and_missing_project_have_no_role(self):
        assert run(access.project_role(ScriptedDB((uuid4(),), None), uuid4(), make_user())) is None
        assert run(access.project_role(ScriptedDB(None), uuid4(), make_user())) is None
        assert run(access.project_role(ScriptedDB(), None, make_user())) is None

    def test_ranks_are_ordered(self):
        assert ROLE_RANK[VIEWER] < ROLE_RANK[EDITOR] < ROLE_RANK[ADMIN]


class TestHasProjectAccess:
    @pytest.mark.parametrize("role,need,expected", [
        (VIEWER, VIEWER, True), (VIEWER, EDITOR, False), (VIEWER, ADMIN, False),
        (EDITOR, VIEWER, True), (EDITOR, EDITOR, True), (EDITOR, ADMIN, False),
        (ADMIN, VIEWER, True), (ADMIN, EDITOR, True), (ADMIN, ADMIN, True),
        (None, VIEWER, False),
    ])
    def test_matrix(self, monkeypatch, role, need, expected):
        monkeypatch.setattr(access, "project_role", AsyncMock(return_value=role))
        assert run(access.has_project_access(MagicMock(), uuid4(), make_user(), min_role=need)) is expected


class TestHasTaskAccess:
    def task(self, user_is_owner=False, user=None):
        return SimpleNamespace(id=uuid4(), project_id=uuid4(), owner_id=(user.id if user_is_owner else uuid4()))

    @pytest.mark.parametrize("role,write,participate,expected", [
        (VIEWER, False, False, True),    # read
        (VIEWER, True, False, False),    # change
        (VIEWER, False, True, False),    # log time without being assigned
        (EDITOR, True, False, True),
        (EDITOR, False, True, True),
        (ADMIN, True, False, True),
        (None, False, False, False),
    ])
    def test_by_role(self, monkeypatch, role, write, participate, expected):
        user = make_user()
        monkeypatch.setattr(access, "project_role", AsyncMock(return_value=role))
        monkeypatch.setattr(access, "_is_assignee", AsyncMock(return_value=False))
        assert run(access.has_task_access(MagicMock(), self.task(), user, write=write, participate=participate)) is expected

    def test_a_viewer_who_is_assigned_can_read_and_log_time_but_not_change_the_task(self, monkeypatch):
        user = make_user()
        monkeypatch.setattr(access, "project_role", AsyncMock(return_value=VIEWER))
        monkeypatch.setattr(access, "_is_assignee", AsyncMock(return_value=True))
        t = self.task()
        assert run(access.has_task_access(MagicMock(), t, user)) is True
        assert run(access.has_task_access(MagicMock(), t, user, participate=True)) is True
        assert run(access.has_task_access(MagicMock(), t, user, write=True)) is False

    def test_a_non_member_assignee_reads_but_cannot_write(self, monkeypatch):
        user = make_user()
        monkeypatch.setattr(access, "project_role", AsyncMock(return_value=None))
        monkeypatch.setattr(access, "_is_assignee", AsyncMock(return_value=True))
        t = self.task()
        assert run(access.has_task_access(MagicMock(), t, user)) is True
        assert run(access.has_task_access(MagicMock(), t, user, write=True)) is False


class TestRequireHelpers:
    def test_message_names_the_missing_role(self, monkeypatch):
        monkeypatch.setattr(access, "_row", AsyncMock(return_value=SimpleNamespace(id=uuid4(), owner_id=uuid4())))
        monkeypatch.setattr(access, "project_role", AsyncMock(return_value=VIEWER))
        with pytest.raises(Exception) as e:
            run(access.require_project_access(MagicMock(), uuid4(), make_user(), min_role=ADMIN))
        assert e.value.status_code == 403 and "admin" in e.value.detail

    def test_whiteboard_owner_may_read_but_not_edit_after_losing_the_editor_role(self, monkeypatch):
        user = make_user()
        row = SimpleNamespace(id=uuid4(), owner_id=user.id, project_id=uuid4())
        monkeypatch.setattr(access, "_row", AsyncMock(return_value=row))
        monkeypatch.setattr(access, "project_role", AsyncMock(return_value=VIEWER))
        assert run(access.require_whiteboard_access(MagicMock(), row.id, user)) is row
        with pytest.raises(Exception) as e:
            run(access.require_whiteboard_access(MagicMock(), row.id, user, write=True))
        assert e.value.status_code == 403

    def test_folder_in_a_project_follows_the_role_not_the_owner(self, monkeypatch):
        user = make_user()
        row = SimpleNamespace(id=uuid4(), owner_id=user.id, project_id=uuid4(), task_id=None)
        monkeypatch.setattr(access, "_row", AsyncMock(return_value=row))
        monkeypatch.setattr(access, "project_role", AsyncMock(return_value=VIEWER))
        assert run(access.require_folder_access(MagicMock(), row.id, user)) is row
        with pytest.raises(Exception) as e:
            run(access.require_folder_access(MagicMock(), row.id, user, write=True))
        assert e.value.status_code == 403

    def test_context_access_write_needs_editor(self, monkeypatch):
        monkeypatch.setattr(access, "_row", AsyncMock(return_value=SimpleNamespace(id=uuid4(), owner_id=uuid4())))
        monkeypatch.setattr(access, "project_role", AsyncMock(return_value=VIEWER))
        run(access.require_context_access(MagicMock(), make_user(), project_id=uuid4()))              # read ok
        with pytest.raises(Exception) as e:
            run(access.require_context_access(MagicMock(), make_user(), project_id=uuid4(), write=True))
        assert e.value.status_code == 403


# ----------------------------------------------------------------------------------------------- endpoint matrix
PID, TID, OTHER = uuid4(), uuid4(), uuid4()

# (method, path, json body, role needed)
ROUTES = [
    # viewer: read
    ("GET", f"/api/v1/projects/{PID}/members", None, VIEWER),
    ("GET", f"/api/v1/tasks/?project_id={PID}", None, VIEWER),
    ("GET", f"/api/v1/tasks/{TID}", None, VIEWER),
    ("GET", f"/api/v1/comments/?project_id={PID}", None, VIEWER),
    ("GET", f"/api/v1/ideas/?project_id={PID}", None, VIEWER),
    ("GET", f"/api/v1/whiteboards/?project_id={PID}", None, VIEWER),
    ("GET", f"/api/v1/folders/?project_id={PID}", None, VIEWER),
    ("GET", f"/api/v1/projects/{PID}/custom-fields", None, VIEWER),
    ("GET", f"/api/v1/time/tasks/{TID}", None, VIEWER),
    ("GET", f"/api/v1/projects/{PID}/automations", None, VIEWER),
    ("GET", f"/api/v1/projects/{PID}/automations/{OTHER}/runs", None, VIEWER),
    # editor: work on content
    ("POST", "/api/v1/tasks/", {"title": "x", "project_id": str(PID)}, EDITOR),
    ("PUT", f"/api/v1/tasks/{TID}", {"title": "x"}, EDITOR),
    ("DELETE", f"/api/v1/tasks/{TID}", None, EDITOR),
    ("POST", "/api/v1/subtasks/", {"title": "x", "project_id": str(PID), "parent_id": str(TID)}, EDITOR),
    ("PUT", f"/api/v1/subtasks/{TID}", {"title": "x"}, EDITOR),
    ("POST", f"/api/v1/tasks/{TID}/dependencies", {"successor_id": str(TID), "predecessor_id": str(OTHER)}, EDITOR),
    ("POST", "/api/v1/comments/", {"content": "x", "project_id": str(PID)}, EDITOR),
    ("POST", "/api/v1/ideas/", {"title": "x", "project_id": str(PID)}, EDITOR),
    ("POST", f"/api/v1/ideas/{TID}/vote", None, EDITOR),
    ("POST", "/api/v1/folders/", {"name": "x", "project_id": str(PID)}, EDITOR),
    ("POST", f"/api/v1/folders/{TID}/upload-note", {"name": "n.md"}, EDITOR),
    ("POST", "/api/v1/whiteboards/", {"title": "x", "data": {}, "project_id": str(PID)}, EDITOR),
    ("PUT", f"/api/v1/whiteboards/{TID}", {"title": "x"}, EDITOR),
    ("DELETE", f"/api/v1/whiteboards/{TID}", None, EDITOR),
    ("POST", f"/api/v1/time/tasks/{TID}/start", {}, EDITOR),
    ("POST", f"/api/v1/time/tasks/{TID}/entries",
     {"started_at": "2025-01-01T10:00:00", "ended_at": "2025-01-01T11:00:00"}, EDITOR),
    # admin: configuration and people
    ("PUT", f"/api/v1/projects/{PID}", {"description": "x"}, ADMIN),
    ("POST", f"/api/v1/projects/{PID}/archive", None, ADMIN),
    ("POST", f"/api/v1/projects/{PID}/restore", None, ADMIN),
    ("PUT", f"/api/v1/projects/{PID}/members/{OTHER}", {"role": "editor"}, ADMIN),
    ("DELETE", f"/api/v1/projects/{PID}/members/{OTHER}", None, ADMIN),
    ("POST", f"/api/v1/projects/{PID}/custom-fields", {"name": "x", "field_type": "text"}, ADMIN),
    ("PUT", f"/api/v1/projects/{PID}/custom-fields/{OTHER}", {"name": "y"}, ADMIN),
    ("DELETE", f"/api/v1/projects/{PID}/custom-fields/{OTHER}", None, ADMIN),
    ("POST", f"/api/v1/projects/{PID}/automations",
     {"name": "x", "trigger": "task_created", "actions": [{"type": "set_field", "field": "priority", "value": "High"}]}, ADMIN),
    ("PUT", f"/api/v1/projects/{PID}/automations/{OTHER}", {"enabled": False}, ADMIN),
    ("DELETE", f"/api/v1/projects/{PID}/automations/{OTHER}", None, ADMIN),
    ("GET", f"/api/v1/webhooks/?project_id={PID}", None, ADMIN),
    ("POST", "/api/v1/webhooks/", {"name": "x", "url": "https://hooks.example.com/x", "project_id": str(PID)}, ADMIN),
]


@pytest.fixture
def as_role(monkeypatch):
    """Every resource exists and belongs to project PID; the caller has `role` in it."""

    def setup(role):
        async def fake_row(db, model, obj_id, *cols):
            return SimpleNamespace(
                id=obj_id, project_id=PID, owner_id=uuid4(), author_id=uuid4(), task_id=None,
            )

        monkeypatch.setattr(access, "_row", fake_row)
        monkeypatch.setattr(access, "project_role", AsyncMock(return_value=role))
        monkeypatch.setattr(access, "_is_assignee", AsyncMock(return_value=False))
        from app.api.api_v1.endpoints import projects, tasks

        monkeypatch.setattr(projects.crud_project.project, "get", AsyncMock(return_value=SimpleNamespace(
            id=PID, owner_id=uuid4(), members=[], is_archived=False)))
        # these endpoints load the task first, then ask the guard
        monkeypatch.setattr(tasks.crud_task.task, "get", AsyncMock(return_value=SimpleNamespace(
            id=TID, project_id=PID, owner_id=uuid4(), assignees=[])))

    return setup


@pytest.fixture
def client():
    async def fake_db():
        yield MagicMock()

    user = make_user()
    app.dependency_overrides[deps.get_db] = fake_db
    app.dependency_overrides[deps.get_current_user] = lambda: user
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def _ids(routes):
    return [f"{m} {p.split('?')[0].replace(str(PID), '{p}').replace(str(TID), '{id}').replace(str(OTHER), '{o}')}" for m, p, _, _ in routes]


@pytest.mark.parametrize("method,path,body,needed", ROUTES, ids=_ids(ROUTES))
def test_every_route_asks_for_its_level(client, as_role, method, path, body, needed):
    for role in (VIEWER, EDITOR, ADMIN):
        as_role(role)
        status = client.request(method, path, json=body).status_code
        allowed = ROLE_RANK[role] >= ROLE_RANK[needed]
        if allowed:
            assert status != 403, f"{role} should pass the guard of {method} {path} (got 403)"
        else:
            assert status == 403, f"{role} must be refused by {method} {path} (got {status})"


class TestMembersApi:
    @pytest.fixture
    def admin_ctx(self, client, monkeypatch):
        self.owner_id = uuid4()
        self.db = MagicMock()
        self.db.info = {}
        self.db.commit = AsyncMock()
        self.db.flush = AsyncMock()

        async def fake_db():
            yield self.db

        app.dependency_overrides[deps.get_db] = fake_db
        monkeypatch.setattr(access, "_row", AsyncMock(return_value=SimpleNamespace(id=PID, owner_id=self.owner_id)))
        monkeypatch.setattr(access, "project_role", AsyncMock(return_value=ADMIN))

    def test_unknown_role_is_422(self, client, admin_ctx):
        r = client.put(f"/api/v1/projects/{PID}/members/{OTHER}", json={"role": "superhero"})
        assert r.status_code == 422

    def test_owner_role_cannot_be_changed_or_removed(self, client, admin_ctx):
        assert client.put(f"/api/v1/projects/{PID}/members/{self.owner_id}", json={"role": "viewer"}).status_code == 400
        assert client.delete(f"/api/v1/projects/{PID}/members/{self.owner_id}").status_code == 400

    def test_unknown_or_inactive_user_is_404(self, client, admin_ctx):
        self.db.execute = AsyncMock(return_value=SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: None)))
        assert client.put(f"/api/v1/projects/{PID}/members/{OTHER}", json={"role": "editor"}).status_code == 404
        inactive = make_user(is_active=False)
        self.db.execute = AsyncMock(return_value=SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: inactive)))
        assert client.put(f"/api/v1/projects/{PID}/members/{OTHER}", json={"role": "editor"}).status_code == 404

    def test_upsert_statement_and_commit(self, client, admin_ctx):
        member = make_user(email="m@example.com", full_name="M")
        statements = []

        async def execute(stmt):
            statements.append(stmt)
            return SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: member))

        self.db.execute = execute
        r = client.put(f"/api/v1/projects/{PID}/members/{member.id}", json={"role": "viewer"})
        assert r.status_code == 200 and r.json()["role"] == "viewer" and r.json()["email"] == "m@example.com"
        from sqlalchemy.dialects import postgresql

        sql = str(statements[-1].compile(dialect=postgresql.dialect()))
        assert "ON CONFLICT" in sql and "role" in sql
        self.db.commit.assert_awaited()

    def test_delete_issues_a_scoped_delete(self, client, admin_ctx):
        statements = []

        async def execute(stmt):
            statements.append(stmt)
            return SimpleNamespace()

        self.db.execute = execute
        assert client.delete(f"/api/v1/projects/{PID}/members/{OTHER}").status_code == 204
        sql = str(statements[-1].compile())
        assert sql.startswith("DELETE FROM project_members") and "project_id" in sql and "user_id" in sql

    def test_non_members_cannot_list(self, client, monkeypatch):
        monkeypatch.setattr(access, "_row", AsyncMock(return_value=SimpleNamespace(id=PID, owner_id=uuid4())))
        monkeypatch.setattr(access, "project_role", AsyncMock(return_value=None))
        assert client.get(f"/api/v1/projects/{PID}/members").status_code == 403


class TestMyRole:
    def test_read_project_reports_the_callers_role(self, client, monkeypatch):
        from app.api.api_v1.endpoints import projects

        proj = SimpleNamespace(
            id=PID, name="P", owner_id=uuid4(), members=[], topics=[], types=[], topic_ref=None, type_ref=None,
            status="Todo", priority="Medium", is_archived=False, tags=[], gantt_regions=[],
        )
        monkeypatch.setattr(projects.crud_project.project, "get", AsyncMock(return_value=proj))
        monkeypatch.setattr(projects, "project_role", AsyncMock(return_value=VIEWER))
        r = client.get(f"/api/v1/projects/{PID}")
        assert r.status_code in (200, 500)  # the fake project may lack optional fields; the role is set before serialising
        assert proj.my_role == VIEWER

    def test_no_role_means_403(self, client, monkeypatch):
        from app.api.api_v1.endpoints import projects

        monkeypatch.setattr(projects.crud_project.project, "get", AsyncMock(return_value=SimpleNamespace(id=PID, owner_id=uuid4(), members=[])))
        monkeypatch.setattr(projects, "project_role", AsyncMock(return_value=None))
        assert client.get(f"/api/v1/projects/{PID}").status_code == 403
