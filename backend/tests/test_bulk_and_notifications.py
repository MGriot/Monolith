"""Bulk task actions and the notification-centre endpoints (no database; same style as test_security_tier0.py)."""
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api import access, deps
from app.api.api_v1.endpoints import notifications as notif_ep
from app.api.api_v1.endpoints import tasks as tasks_ep
from app.main import app


class FakeDB:
    def __init__(self):
        self.info = {}
        self.commit, self.rollback, self.flush = AsyncMock(), AsyncMock(), AsyncMock()

    @asynccontextmanager
    async def begin_nested(self):
        yield


@pytest.fixture
def db():
    return FakeDB()


@pytest.fixture
def client(db):
    async def fake_db():
        yield db

    app.dependency_overrides[deps.get_db] = fake_db
    user = SimpleNamespace(id=uuid4(), email="u@example.com", is_active=True, is_superuser=False)
    app.dependency_overrides[deps.get_current_user] = lambda: user
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def grant(monkeypatch, allowed: set):
    """require_task_access: ids in `allowed` pass, every other id is a 403."""

    async def fake_require(db, task_id, user, *, write=False, participate=False):
        assert write is True, "bulk changes must be authorized as WRITE"
        if task_id not in allowed:
            raise HTTPException(status_code=403, detail="Not enough permissions for this task")
        return SimpleNamespace(id=task_id)

    monkeypatch.setattr(tasks_ep, "require_task_access", fake_require)


# --------------------------------------------------------------------------- bulk: validation
class TestBulkValidation:
    def test_requires_login(self):
        app.dependency_overrides.clear()
        r = TestClient(app).post("/api/v1/tasks/bulk", json={"ids": [str(uuid4())], "action": "archive"})
        assert r.status_code == 401

    @pytest.mark.parametrize(
        "body",
        [
            {"ids": [], "action": "archive"},
            {"ids": [str(uuid4())]},                                                   # neither patch nor action
            {"ids": [str(uuid4())], "patch": {}},                                      # empty patch
            {"ids": [str(uuid4())], "patch": {"status": "Done"}, "action": "delete"},  # both
            {"ids": [str(uuid4())], "action": "explode"},
            {"ids": [str(uuid4())], "patch": {"title": "x"}},                          # not bulk-editable
            {"ids": [str(uuid4())], "patch": {"status": "Nope"}},
            {"ids": [str(uuid4()) for _ in range(201)], "action": "archive"},          # cap
        ],
    )
    def test_bad_bodies_are_422(self, client, body):
        assert client.post("/api/v1/tasks/bulk", json=body).status_code == 422

    def test_exactly_200_ids_is_accepted(self, client, monkeypatch):
        grant(monkeypatch, set())
        ids = [str(uuid4()) for _ in range(200)]
        r = client.post("/api/v1/tasks/bulk", json={"ids": ids, "action": "archive"})
        assert r.status_code == 200 and r.json()["failed"] == 200


# --------------------------------------------------------------------------- bulk: authorization matrix
class TestBulkAuthz:
    def test_non_member_gets_403_for_every_id_and_nothing_is_written(self, client, monkeypatch):
        grant(monkeypatch, set())
        write = AsyncMock()
        monkeypatch.setattr(tasks_ep.crud_task.task, "update", write)
        monkeypatch.setattr(tasks_ep.crud_task.task, "remove", write)
        ids = [uuid4() for _ in range(3)]
        r = client.post("/api/v1/tasks/bulk", json={"ids": [str(i) for i in ids], "patch": {"status": "Done"}})
        assert r.status_code == 200
        body = r.json()
        assert body["succeeded"] == 0 and body["failed"] == 3
        assert [x["status_code"] for x in body["results"]] == [403, 403, 403]
        assert [x["id"] for x in body["results"]] == [str(i) for i in ids]
        write.assert_not_awaited()

    def test_mixed_permissions_are_reported_per_id(self, client, monkeypatch):
        mine, theirs = uuid4(), uuid4()
        grant(monkeypatch, {mine})
        monkeypatch.setattr(tasks_ep.crud_task.task, "get", AsyncMock(return_value=SimpleNamespace(id=mine)))
        update = AsyncMock()
        monkeypatch.setattr(tasks_ep.crud_task.task, "update", update)
        r = client.post("/api/v1/tasks/bulk", json={"ids": [str(theirs), str(mine)], "patch": {"priority": "High"}})
        body = r.json()
        assert (body["succeeded"], body["failed"]) == (1, 1)
        assert [(x["ok"], x["status_code"]) for x in body["results"]] == [(False, 403), (True, 200)]
        update.assert_awaited_once()
        assert update.await_args.kwargs["obj_in"] == {"priority": "High"}

    def test_duplicate_ids_are_handled_once(self, client, monkeypatch):
        t = uuid4()
        grant(monkeypatch, {t})
        monkeypatch.setattr(tasks_ep.crud_task.task, "get", AsyncMock(return_value=SimpleNamespace(id=t)))
        update = AsyncMock()
        monkeypatch.setattr(tasks_ep.crud_task.task, "update", update)
        r = client.post("/api/v1/tasks/bulk", json={"ids": [str(t), str(t)], "action": "archive"})
        assert len(r.json()["results"]) == 1 and update.await_count == 1

    def test_one_failing_task_does_not_hide_the_others(self, client, monkeypatch, db):
        a, b = uuid4(), uuid4()
        grant(monkeypatch, {a, b})

        async def fake_get(db, *, id):
            return SimpleNamespace(id=id)

        monkeypatch.setattr(tasks_ep.crud_task.task, "get", fake_get)

        async def flaky(db, *, db_obj, obj_in):
            if db_obj.id == a:
                raise ValueError("blocked by an unfinished predecessor")

        monkeypatch.setattr(tasks_ep.crud_task.task, "update", flaky)
        body = client.post("/api/v1/tasks/bulk", json={"ids": [str(a), str(b)], "patch": {"status": "Done"}}).json()
        assert [(x["ok"], x["status_code"]) for x in body["results"]] == [(False, 400), (True, 200)]
        assert "predecessor" in body["results"][0]["detail"]
        db.commit.assert_awaited_once()  # one transaction for the whole request

    def test_delete_action_removes_through_the_crud(self, client, monkeypatch):
        t = uuid4()
        grant(monkeypatch, {t})
        monkeypatch.setattr(tasks_ep.crud_task.task, "get", AsyncMock(return_value=SimpleNamespace(id=t)))
        remove = AsyncMock()
        monkeypatch.setattr(tasks_ep.crud_task.task, "remove", remove)
        assert client.post("/api/v1/tasks/bulk", json={"ids": [str(t)], "action": "delete"}).json()["succeeded"] == 1
        remove.assert_awaited_once()

    def test_uses_the_central_access_helper(self):
        assert tasks_ep.require_task_access is access.require_task_access


# --------------------------------------------------------------------------- notifications
class TestNotificationEndpoints:
    def test_list_passes_filters_and_caps_limit(self, client, monkeypatch):
        get_multi = AsyncMock(return_value=[])
        monkeypatch.setattr(notif_ep.crud_notification, "get_multi_by_user", get_multi)
        assert client.get("/api/v1/notifications/?is_read=false&type=assignment&skip=5&limit=20").status_code == 200
        kw = get_multi.await_args.kwargs
        assert (kw["is_read"], kw["type"], kw["skip"], kw["limit"]) == (False, "assignment", 5, 20)
        assert client.get("/api/v1/notifications/?limit=501").status_code == 422

    def test_unfiltered_list_has_no_filter(self, client, monkeypatch):
        get_multi = AsyncMock(return_value=[])
        monkeypatch.setattr(notif_ep.crud_notification, "get_multi_by_user", get_multi)
        client.get("/api/v1/notifications/")
        assert get_multi.await_args.kwargs["is_read"] is None and get_multi.await_args.kwargs["type"] is None

    def test_unread_count(self, client, monkeypatch):
        monkeypatch.setattr(notif_ep.crud_notification, "count_unread", AsyncMock(return_value=7))
        r = client.get("/api/v1/notifications/unread-count")
        assert r.status_code == 200 and r.json() == {"count": 7}

    def test_put_can_mark_unread_and_only_touches_is_read(self, client, monkeypatch):
        me = app.dependency_overrides[deps.get_current_user]()
        n = SimpleNamespace(id=uuid4(), user_id=me.id)
        monkeypatch.setattr(notif_ep.crud_notification, "get", AsyncMock(return_value=n))
        upd = AsyncMock(
            return_value=SimpleNamespace(
                id=n.id, user_id=n.user_id, title="t", message="m", type=None, link=None, is_read=False,
                created_at="2026-01-01T00:00:00",
            )
        )
        monkeypatch.setattr(notif_ep.crud_notification, "update", upd)
        r = client.put(f"/api/v1/notifications/{n.id}", json={"is_read": False, "title": "hijack"})
        assert r.status_code == 200
        assert upd.await_args.kwargs["obj_in"] == {"is_read": False}

    def test_put_on_someone_elses_notification_is_refused(self, client, monkeypatch):
        n = SimpleNamespace(id=uuid4(), user_id=uuid4())
        monkeypatch.setattr(notif_ep.crud_notification, "get", AsyncMock(return_value=n))
        assert client.put(f"/api/v1/notifications/{n.id}", json={"is_read": True}).status_code in (400, 403)
