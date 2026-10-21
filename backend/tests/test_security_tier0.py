"""
Tier-0 security regression tests.

These run without a database: the HTTP layer is exercised through FastAPI's TestClient
with dependency overrides, and the access helpers are driven with scripted fake sessions.
Run:  pytest backend/tests/test_security_tier0.py
"""
import asyncio
import io
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.testclient import TestClient
import jwt

from app.api import access, deps
from app.core import uploads
from app.core.config import settings
from app.core.utils import make_naive
from app.main import app
from app.core.mcp_tokens import McpTokenGate, mcp_token_hash, hash_token, token_is_usable


# --------------------------------------------------------------------------- helpers
def run(coro):
    return asyncio.run(coro)


def make_user(**kw):
    base = dict(id=uuid4(), email="u@example.com", is_active=True, is_superuser=False)
    base.update(kw)
    return SimpleNamespace(**base)


class ScriptedDB:
    """Fake AsyncSession whose execute() returns scripted `.first()` rows in order."""

    def __init__(self, *rows):
        self.rows = list(rows)

    async def execute(self, _stmt):
        row = self.rows.pop(0) if self.rows else None
        return SimpleNamespace(first=lambda: row)


def token_for(sub, *, minutes=30):
    exp = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return jwt.encode({"sub": str(sub), "exp": exp}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@pytest.fixture
def client():
    async def fake_db():
        yield MagicMock()

    app.dependency_overrides[deps.get_db] = fake_db
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def as_user(client):
    user = make_user()
    app.dependency_overrides[deps.get_current_user] = lambda: user
    return user


@pytest.fixture
def deny_everything(monkeypatch):
    """Every resource exists but the caller has no access to any project/task."""

    async def fake_row(db, model, obj_id, *cols):
        return SimpleNamespace(
            id=obj_id, project_id=uuid4(), owner_id=uuid4(), author_id=uuid4(), task_id=None
        )

    async def no(*a, **k):
        return False

    monkeypatch.setattr(access, "_row", fake_row)
    monkeypatch.setattr(access, "has_project_access", no)
    monkeypatch.setattr(access, "has_task_access", no)


# --------------------------------------------------------------------------- authentication
class TestAuthentication:
    def test_missing_token_is_401(self, client):
        assert client.get("/api/v1/tasks/").status_code == 401

    def test_garbage_token_is_401_not_403(self, client):
        r = client.get("/api/v1/users/me", headers={"Authorization": "Bearer nope"})
        assert r.status_code == 401
        assert r.headers["www-authenticate"] == "Bearer"

    def test_expired_token_is_401(self, client):
        r = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token_for(uuid4(), minutes=-5)}"})
        assert r.status_code == 401

    def test_token_signed_with_other_key_is_401(self, client):
        bad = jwt.encode({"sub": str(uuid4())}, "some-other-key-that-is-not-the-server-secret", algorithm="HS256")
        assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {bad}"}).status_code == 401

    def test_unknown_user_is_401(self, client, monkeypatch):
        monkeypatch.setattr(deps.crud_user, "get", AsyncMock(return_value=None))
        r = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token_for(uuid4())}"})
        assert r.status_code == 401

    def test_deactivated_user_with_valid_token_is_rejected(self, client, monkeypatch):
        inactive = make_user(is_active=False)
        monkeypatch.setattr(deps.crud_user, "get", AsyncMock(return_value=inactive))
        r = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token_for(inactive.id)}"})
        assert r.status_code == 401

    def test_active_user_is_accepted(self, monkeypatch):
        user = make_user()
        monkeypatch.setattr(deps.crud_user, "get", AsyncMock(return_value=user))
        got = run(deps.get_current_user(db=MagicMock(), token=token_for(user.id)))
        assert got is user

    def test_optional_user_ignores_inactive(self, monkeypatch):
        inactive = make_user(is_active=False)
        monkeypatch.setattr(deps.crud_user, "get", AsyncMock(return_value=inactive))
        assert run(deps.get_current_user_optional(db=MagicMock(), token=token_for(inactive.id))) is None

    def test_admin_dependency_is_403(self):
        with pytest.raises(HTTPException) as e:
            run(deps.get_current_admin(current_user=make_user()))
        assert e.value.status_code == 403

    def test_metadata_lists_require_login(self, client):
        assert client.get("/api/v1/metadata/topics").status_code == 401
        assert client.get("/api/v1/metadata/work-types").status_code == 401

    def test_metadata_all_scopes_is_admin_only(self, client, as_user):
        assert client.get("/api/v1/metadata/topics?all_scopes=true").status_code == 403
        assert client.get("/api/v1/metadata/work-types?all_scopes=true").status_code == 403


# --------------------------------------------------------------------------- access helpers
class TestAccessHelpers:
    def test_superuser_always_has_project_access(self):
        assert run(access.has_project_access(ScriptedDB(), uuid4(), make_user(is_superuser=True)))

    def test_missing_project_means_no_access(self):
        assert not run(access.has_project_access(ScriptedDB(None), uuid4(), make_user()))

    def test_project_owner_has_access(self):
        user = make_user()
        db = ScriptedDB((user.id,))
        assert run(access.has_project_access(db, uuid4(), user))

    def test_project_member_has_access(self):
        user = make_user()
        db = ScriptedDB((uuid4(),), ("editor",))  # owner is someone else, membership row exists (role)
        assert run(access.has_project_access(db, uuid4(), user))

    def test_stranger_has_no_project_access(self):
        db = ScriptedDB((uuid4(),), None)
        assert not run(access.has_project_access(db, uuid4(), make_user()))

    def test_independent_task_owner_and_stranger(self):
        user = make_user()
        mine = SimpleNamespace(id=uuid4(), project_id=None, owner_id=user.id)
        theirs = SimpleNamespace(id=uuid4(), project_id=None, owner_id=uuid4())
        assert run(access.has_task_access(ScriptedDB(), mine, user, write=True))
        assert not run(access.has_task_access(ScriptedDB(None), theirs, user))

    def test_independent_task_assignee_can_access(self):
        user = make_user()
        task = SimpleNamespace(id=uuid4(), project_id=None, owner_id=uuid4())
        assert run(access.has_task_access(ScriptedDB((user.id,)), task, user, write=True))

    def test_assignee_outside_project_reads_but_cannot_write(self):
        user = make_user()
        task = SimpleNamespace(id=uuid4(), project_id=uuid4(), owner_id=uuid4())
        # project check: owner is someone else, not a member; then assignee row exists
        read_db = ScriptedDB((uuid4(),), None, (user.id,))
        assert run(access.has_task_access(read_db, task, user, write=False))
        write_db = ScriptedDB((uuid4(),), None, (user.id,))
        assert not run(access.has_task_access(write_db, task, user, write=True))

    def test_require_task_access_404_vs_403(self, monkeypatch):
        user = make_user()
        monkeypatch.setattr(access, "_row", AsyncMock(return_value=None))
        with pytest.raises(HTTPException) as e:
            run(access.require_task_access(MagicMock(), uuid4(), user))
        assert e.value.status_code == 404

        row = SimpleNamespace(id=uuid4(), project_id=None, owner_id=uuid4())
        monkeypatch.setattr(access, "_row", AsyncMock(return_value=row))
        monkeypatch.setattr(access, "has_task_access", AsyncMock(return_value=False))
        with pytest.raises(HTTPException) as e:
            run(access.require_task_access(MagicMock(), uuid4(), user))
        assert e.value.status_code == 403

    def test_folder_owner_is_allowed_without_project(self, monkeypatch):
        user = make_user()
        row = SimpleNamespace(id=uuid4(), owner_id=user.id, project_id=None, task_id=None)
        monkeypatch.setattr(access, "_row", AsyncMock(return_value=row))
        assert run(access.require_folder_access(MagicMock(), row.id, user)) is row

    def test_whiteboard_owner_allowed_even_if_project_access_lost(self, monkeypatch):
        user = make_user()
        row = SimpleNamespace(id=uuid4(), owner_id=user.id, project_id=uuid4())
        monkeypatch.setattr(access, "_row", AsyncMock(return_value=row))
        monkeypatch.setattr(access, "has_project_access", AsyncMock(return_value=False))
        assert run(access.require_whiteboard_access(MagicMock(), row.id, user)) is row


# --------------------------------------------------------------------------- authz matrix (IDOR)
ID = uuid4()
OTHER = uuid4()
MATRIX = [
    # subtasks (previously: no checks at all)
    ("GET", f"/api/v1/subtasks/?task_id={ID}", None),
    ("POST", "/api/v1/subtasks/", {"title": "x", "project_id": str(OTHER), "parent_id": str(ID)}),
    ("GET", f"/api/v1/subtasks/{ID}", None),
    ("PUT", f"/api/v1/subtasks/{ID}", {"title": "x"}),
    ("DELETE", f"/api/v1/subtasks/{ID}", None),
    # tasks: dependencies and subtask creation
    ("POST", f"/api/v1/tasks/{ID}/dependencies", {"successor_id": str(ID), "predecessor_id": str(OTHER)}),
    ("DELETE", f"/api/v1/tasks/{ID}/dependencies/{OTHER}", None),
    ("POST", "/api/v1/tasks/", {"title": "x", "project_id": str(OTHER)}),
    # whiteboards
    ("GET", f"/api/v1/whiteboards/?project_id={ID}", None),
    ("GET", f"/api/v1/whiteboards/?task_id={ID}", None),
    ("POST", "/api/v1/whiteboards/", {"title": "x", "data": {}, "project_id": str(ID)}),
    ("GET", f"/api/v1/whiteboards/{ID}", None),
    ("PUT", f"/api/v1/whiteboards/{ID}", {"title": "x"}),
    ("DELETE", f"/api/v1/whiteboards/{ID}", None),
    # comments
    ("GET", f"/api/v1/comments/?project_id={ID}", None),
    ("GET", f"/api/v1/comments/?task_id={ID}", None),
    ("GET", f"/api/v1/comments/?idea_id={ID}", None),
    ("POST", "/api/v1/comments/", {"content": "x", "project_id": str(ID)}),
    ("GET", f"/api/v1/comments/available-images?project_id={ID}", None),
    # ideas
    ("GET", f"/api/v1/ideas/?project_id={ID}", None),
    ("POST", f"/api/v1/ideas/{ID}/vote", None),
    ("POST", f"/api/v1/ideas/{ID}/downvote", None),
    ("POST", "/api/v1/ideas/", {"title": "x", "project_id": str(ID)}),
    # folders
    ("GET", f"/api/v1/folders/?project_id={ID}", None),
    ("POST", "/api/v1/folders/", {"name": "x", "project_id": str(ID)}),
    ("POST", f"/api/v1/folders/{ID}/upload-note", {"name": "n.md"}),
]


@pytest.mark.parametrize("method,path,body", MATRIX, ids=[f"{m} {p.split('?')[0].replace(str(ID), '{id}')}" for m, p, _ in MATRIX])
def test_non_member_is_forbidden(client, as_user, deny_everything, method, path, body):
    r = client.request(method, path, json=body)
    assert r.status_code == 403, f"{method} {path} -> {r.status_code} {r.text[:200]}"


def test_folder_upload_checks_access_before_touching_the_file(client, as_user, deny_everything):
    r = client.post(f"/api/v1/folders/{ID}/upload", files={"file": ("a.txt", b"hello")})
    assert r.status_code == 403


def test_webhook_test_requires_ownership(client, as_user, monkeypatch):
    from app.api.api_v1.endpoints import webhooks

    hook = SimpleNamespace(id=ID, owner_id=uuid4(), provider="generic", url="http://x", name="n", project_id=None)
    monkeypatch.setattr(webhooks.crud_webhook.webhook, "get", AsyncMock(return_value=hook))
    sent = AsyncMock(return_value=True)
    monkeypatch.setattr(webhooks.webhook_service, "send_generic_notification", sent)
    assert client.post(f"/api/v1/webhooks/{ID}/test").status_code == 403
    sent.assert_not_awaited()


def test_comment_reply_must_stay_in_same_thread(client, as_user, monkeypatch):
    from app.api.api_v1.endpoints import comments

    async def allow(*a, **k):
        return None

    monkeypatch.setattr(comments, "require_context_access", allow)
    parent = SimpleNamespace(project_id=uuid4(), task_id=None, idea_id=None)
    monkeypatch.setattr(comments.crud_comment, "get", AsyncMock(return_value=parent))
    r = client.post(
        "/api/v1/comments/",
        json={"content": "x", "project_id": str(uuid4()), "parent_id": str(uuid4())},
    )
    assert r.status_code == 400


def test_author_cannot_self_approve_idea(client, as_user, monkeypatch):
    from app.api.api_v1.endpoints import ideas

    idea = SimpleNamespace(id=ID, project_id=uuid4(), author_id=as_user.id)
    project = SimpleNamespace(owner_id=uuid4())
    monkeypatch.setattr(ideas.crud_idea, "get", AsyncMock(return_value=idea))
    monkeypatch.setattr(ideas.crud.project, "get", AsyncMock(return_value=project))
    update = AsyncMock()
    monkeypatch.setattr(ideas.crud_idea, "update", update)
    # an editor (the author) but not a project admin
    monkeypatch.setattr(ideas, "has_project_access", AsyncMock(side_effect=lambda db, pid, user, min_role="viewer": min_role != "admin"))
    r = client.put(f"/api/v1/ideas/{ID}", json={"status": "Approved"})
    assert r.status_code == 403
    update.assert_not_awaited()


# --------------------------------------------------------------------------- /mcp lock
class TestMcpTokenGate:
    GOOD = "mono_mcp_good-token"

    @classmethod
    def _client(cls, seen=None):
        async def inner(scope, receive, send):
            if seen is not None:
                seen.append(mcp_token_hash.get())
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok"})

        async def resolver(raw):
            return object() if raw == cls.GOOD else None

        wrapper = FastAPI()
        wrapper.mount("/mcp", McpTokenGate(inner, resolver=resolver))
        return TestClient(wrapper)

    def test_rejects_without_token(self):
        r = self._client().get("/mcp/")
        assert r.status_code == 401 and r.headers["www-authenticate"] == "Bearer"

    def test_rejects_unknown_token(self):
        assert self._client().get("/mcp/", headers={"Authorization": "Bearer mono_mcp_nope"}).status_code == 401

    def test_rejects_wrong_scheme(self):
        assert self._client().get("/mcp/", headers={"Authorization": f"Basic {self.GOOD}"}).status_code == 401

    def test_accepts_valid_token_and_exposes_its_hash(self):
        seen = []
        r = self._client(seen).get("/mcp/", headers={"Authorization": f"Bearer {self.GOOD}"})
        assert r.status_code == 200 and r.text == "ok"
        assert seen == [hash_token(self.GOOD)]
        assert mcp_token_hash.get() is None  # reset after the request

    def test_mounted_by_default(self):
        paths = [getattr(r, "path", "") for r in app.routes]
        assert ("/mcp" in paths) == settings.MCP_ENABLED


# --------------------------------------------------------------------------- uploads
class TestUploads:
    @pytest.fixture(autouse=True)
    def upload_dir(self, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
        return tmp_path

    @staticmethod
    def _file(name, data=b"abc"):
        return UploadFile(file=io.BytesIO(data), filename=name)

    @pytest.mark.parametrize("name", ["x.html", "x.HTM", "x.js", "x.xml", "x.php", "x.exe", "evil.svgz"])
    def test_active_content_extensions_are_rejected(self, name, upload_dir):
        with pytest.raises(HTTPException) as e:
            run(uploads.save_upload(self._file(name)))
        assert e.value.status_code == 400
        assert list(upload_dir.iterdir()) == []

    def test_weird_extension_chars_are_rejected(self):
        with pytest.raises(HTTPException):
            run(uploads.save_upload(self._file("a.p\x00ng")))

    def test_missing_filename_is_handled(self, upload_dir):
        stored, ext, size = run(uploads.save_upload(UploadFile(file=io.BytesIO(b"abc"), filename=None)))
        assert ext == "" and size == 3 and (upload_dir / stored).exists()

    def test_stored_name_is_random_and_keeps_safe_extension(self, upload_dir):
        stored, ext, size = run(uploads.save_upload(self._file("../../etc/passwd.PNG", b"12345")))
        assert ext == ".png" and stored.endswith(".png") and "/" not in stored and ".." not in stored
        assert (upload_dir / stored).read_bytes() == b"12345" and size == 5

    def test_oversize_upload_is_rejected_and_cleaned_up(self, upload_dir, monkeypatch):
        monkeypatch.setattr(settings, "MAX_UPLOAD_MB", 1)
        big = b"0" * (1024 * 1024 + 1)
        with pytest.raises(HTTPException) as e:
            run(uploads.save_upload(self._file("big.bin", big)))
        assert e.value.status_code == 413
        assert list(upload_dir.iterdir()) == []

    def test_static_files_get_nosniff_and_svg_is_download_only(self, upload_dir):
        (upload_dir / "a.png").write_bytes(b"png")
        (upload_dir / "b.svg").write_text("<svg onload='alert(1)'/>")
        sub = FastAPI()
        sub.mount("/uploads", uploads.SafeStaticFiles(directory=str(upload_dir)))
        c = TestClient(sub)

        png = c.get("/uploads/a.png")
        assert png.headers["x-content-type-options"] == "nosniff"
        assert "content-disposition" not in png.headers

        svg = c.get("/uploads/b.svg")
        assert svg.headers["x-content-type-options"] == "nosniff"
        assert svg.headers["content-disposition"] == "attachment"
        assert "sandbox" in svg.headers["content-security-policy"]


# --------------------------------------------------------------------------- 500 bugs
class TestKnownCrashes:
    def test_make_naive_converts_to_utc_instead_of_dropping_offset(self):
        aware = datetime(2025, 1, 1, 12, 0, tzinfo=timezone(timedelta(hours=2)))
        assert make_naive(aware) == datetime(2025, 1, 1, 10, 0)
        assert make_naive(datetime(2025, 1, 1, 12, 0)) == datetime(2025, 1, 1, 12, 0)
        assert make_naive(None) is None

    def test_reports_module_imports_selectinload(self):
        from app.core import reports

        assert hasattr(reports, "selectinload")

    def test_base_update_skips_readonly_properties_and_null_for_not_null(self):
        from sqlalchemy import Column, Integer, String
        from sqlalchemy.orm import declarative_base

        from app.crud.base import CRUDBase

        Base = declarative_base()

        class Thing(Base):
            __tablename__ = "thing"
            id = Column(Integer, primary_key=True)
            title = Column(String, nullable=False)
            note = Column(String, nullable=True)

            @property
            def computed(self):
                return 42

        db = MagicMock()
        db.info = {}
        db.commit, db.refresh, db.flush, db.rollback = AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
        obj = Thing(id=1, title="keep", note="old")
        out = run(CRUDBase(Thing).update(db, db_obj=obj, obj_in={"title": None, "computed": 5, "note": None}))
        assert out.title == "keep"      # NOT NULL column ignores explicit null (was a 500 at commit)
        assert out.note is None         # nullable column can be cleared
        assert out.computed == 42       # read-only property untouched (was AttributeError)

    @pytest.mark.parametrize("payload", [{"due_date": None}, {"start_date": None}, {"duration_days": None}])
    def test_task_update_survives_explicit_null_dates(self, monkeypatch, payload):
        from app.crud import crud_task
        from app.models.task import Task

        t = crud_task.task
        monkeypatch.setattr(t, "sync_project_from_tasks", AsyncMock())
        monkeypatch.setattr(t, "update_parent_status_recursive", AsyncMock())
        monkeypatch.setattr(t, "shift_successors_recursive", AsyncMock(), raising=False)
        monkeypatch.setattr(t, "get", AsyncMock(return_value="reloaded"))

        db = MagicMock()
        db.info = {}
        db.commit, db.refresh, db.flush, db.rollback = AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
        obj = Task(
            id=uuid4(), title="t", project_id=None, parent_id=None,
            start_date=datetime(2025, 1, 1), due_date=datetime(2025, 1, 3), duration_days=3,
        )
        assert run(t.update(db, db_obj=obj, obj_in=dict(payload))) == "reloaded"
        key, = payload
        assert getattr(obj, key) is None

    def test_task_update_still_derives_due_date_from_duration(self, monkeypatch):
        from app.crud import crud_task
        from app.models.task import Task

        t = crud_task.task
        for name in ("sync_project_from_tasks", "update_parent_status_recursive", "shift_successors_recursive"):
            monkeypatch.setattr(t, name, AsyncMock(), raising=False)
        monkeypatch.setattr(t, "get", AsyncMock(return_value="ok"))
        db = MagicMock()
        db.info = {}
        db.commit, db.refresh, db.flush, db.rollback = AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
        obj = Task(id=uuid4(), title="t", project_id=None, parent_id=None,
                   start_date=datetime(2025, 1, 1), due_date=datetime(2025, 1, 1), duration_days=1)
        run(t.update(db, db_obj=obj, obj_in={"duration_days": 5}))
        assert obj.due_date == datetime(2025, 1, 5)
