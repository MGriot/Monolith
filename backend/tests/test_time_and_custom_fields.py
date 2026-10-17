"""Time tracking and custom fields: pure logic plus the authorization matrix (no database).

Run:  pytest backend/tests/test_time_and_custom_fields.py
The SQL side (timer uniqueness, timesheet aggregation, JSONB cleanup) is covered by tests/live/smoke_time_fields.py.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import access, deps
from app.api.api_v1.endpoints import time_entries
from app.core.custom_fields import normalize_options, user_ids_in, validate_custom_values
from app.core.time_tracking import entry_seconds, estimate_hours, estimate_vs_actual
from app.main import app
from app.models.task import Task
from app.schemas.time_entry import TimeEntryCreate

ID = uuid4()
T0 = datetime(2026, 1, 1, 9, 0, 0)


def fdef(field_type, name="F", options=None):
    return SimpleNamespace(id=uuid4(), name=name, field_type=field_type, options=options or [])


# --------------------------------------------------------------------------- custom field validation
class TestCustomFieldValidation:
    def test_valid_values_of_every_type(self):
        text, num, sel, dt, usr = fdef("text"), fdef("number"), fdef("select", options=["a", "b"]), fdef("date"), fdef("user")
        uid = str(uuid4())
        out = validate_custom_values(
            [text, num, sel, dt, usr],
            {str(text.id): "hi", str(num.id): 2.5, str(sel.id): "b", str(dt.id): "2026-03-04", str(usr.id): uid},
        )
        assert out == {str(text.id): "hi", str(num.id): 2.5, str(sel.id): "b", str(dt.id): "2026-03-04", str(usr.id): uid}
        assert user_ids_in([usr, text], out) == {__import__("uuid").UUID(uid)}

    @pytest.mark.parametrize(
        "field,value",
        [
            (fdef("text"), 5),
            (fdef("text"), "x" * 5001),
            (fdef("number"), "5"),
            (fdef("number"), True),
            (fdef("number"), float("nan")),
            (fdef("select", options=["a"]), "z"),
            (fdef("select", options=["a"]), 1),
            (fdef("date"), "03/04/2026"),
            (fdef("date"), 20260304),
            (fdef("user"), "not-a-uuid"),
            (fdef("user"), 7),
        ],
    )
    def test_invalid_values_are_rejected(self, field, value):
        with pytest.raises(ValueError):
            validate_custom_values([field], {str(field.id): value})

    def test_unknown_key_is_rejected(self):
        with pytest.raises(ValueError, match="Unknown custom field"):
            validate_custom_values([fdef("text")], {str(uuid4()): "x"})

    def test_values_outside_a_project_are_rejected(self):
        with pytest.raises(ValueError):
            validate_custom_values([], {str(uuid4()): "x"})
        assert validate_custom_values([], {}) == {}

    def test_null_clears_a_value(self):
        f = fdef("text")
        assert validate_custom_values([f], {str(f.id): None}) == {}

    def test_non_object_is_rejected(self):
        with pytest.raises(ValueError):
            validate_custom_values([], ["x"])

    def test_date_with_time_is_normalised(self):
        f = fdef("date")
        out = validate_custom_values([f], {str(f.id): "2026-03-04T10:00:00Z"})
        assert out[str(f.id)].startswith("2026-03-04T10:00:00")

    def test_options_are_trimmed_and_deduplicated(self):
        assert normalize_options("select", [" a ", "b", "a", ""]) == ["a", "b"]
        assert normalize_options("text", ["ignored"]) == []
        with pytest.raises(ValueError):
            normalize_options("select", ["  "])


# --------------------------------------------------------------------------- time maths
class TestTimeMaths:
    def test_finished_and_running_entries(self):
        assert entry_seconds(T0, T0 + timedelta(hours=1, seconds=5)) == 3605
        assert entry_seconds(T0, None, now=T0 + timedelta(minutes=2)) == 120
        assert entry_seconds(T0, T0 - timedelta(hours=1)) == 0  # never negative

    def test_estimate_uses_pert_then_planned_duration(self):
        task = Task(optimistic_days=1, normal_days=2, pessimistic_days=9)  # (1 + 8 + 9) / 6 = 3.0 days
        assert estimate_hours(task.expected_duration_days, 5) == 24.0
        assert estimate_hours(0.0, 5) == 40.0
        assert estimate_hours(0.0, None) == 0.0

    def test_estimate_vs_actual(self):
        r = estimate_vs_actual(8.0, 3600 * 10)
        assert r == {"estimate_hours": 8.0, "actual_hours": 10.0, "variance_hours": 2.0, "percent_of_estimate": 125.0}
        assert estimate_vs_actual(0.0, 3600)["percent_of_estimate"] is None

    def test_manual_entry_must_be_ordered(self):
        with pytest.raises(ValueError):
            TimeEntryCreate(started_at=T0, ended_at=T0 - timedelta(minutes=1))


# --------------------------------------------------------------------------- authorization (non-members get 403)
@pytest.fixture
def client():
    async def fake_db():
        yield MagicMock()

    app.dependency_overrides[deps.get_db] = fake_db
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def as_user(client):
    user = SimpleNamespace(id=uuid4(), email="u@example.com", is_active=True, is_superuser=False)
    app.dependency_overrides[deps.get_current_user] = lambda: user
    return user


@pytest.fixture
def deny_everything(monkeypatch):
    """Every resource exists but the caller has no access to any project/task."""

    async def fake_row(db, model, obj_id, *cols):
        return SimpleNamespace(id=obj_id, project_id=uuid4(), owner_id=uuid4(), author_id=uuid4(), task_id=None)

    async def no(*a, **k):
        return False

    monkeypatch.setattr(access, "_row", fake_row)
    monkeypatch.setattr(access, "has_project_access", no)
    monkeypatch.setattr(access, "has_task_access", no)


ENTRY = {"started_at": "2026-01-01T09:00:00", "ended_at": "2026-01-01T10:00:00"}

MATRIX = [
    ("GET", f"/api/v1/time/tasks/{ID}", None),
    ("POST", f"/api/v1/time/tasks/{ID}/start", {}),
    ("POST", f"/api/v1/time/tasks/{ID}/entries", ENTRY),
    ("GET", f"/api/v1/time/timesheet?project_id={ID}", None),
    ("GET", f"/api/v1/projects/{ID}/custom-fields", None),
    ("POST", f"/api/v1/projects/{ID}/custom-fields", {"name": "X", "field_type": "text"}),
    ("PUT", f"/api/v1/projects/{ID}/custom-fields/{ID}", {"name": "Y"}),
    ("DELETE", f"/api/v1/projects/{ID}/custom-fields/{ID}", None),
]


@pytest.mark.parametrize("method,path,body", MATRIX, ids=[f"{m} {p.split('?')[0].replace(str(ID), '{id}')}" for m, p, _ in MATRIX])
def test_non_member_is_forbidden(client, as_user, deny_everything, method, path, body):
    r = client.request(method, path, json=body)
    assert r.status_code == 403, f"{method} {path} -> {r.status_code} {r.text[:200]}"


def test_endpoints_require_login(client):
    for method, path, body in MATRIX + [("GET", "/api/v1/time/running", None), ("POST", "/api/v1/time/stop", None)]:
        assert client.request(method, path, json=body).status_code == 401, (method, path)


def test_cannot_change_someone_elses_entry(client, as_user, monkeypatch):
    other = SimpleNamespace(id=ID, user_id=uuid4(), task_id=uuid4(), started_at=T0, ended_at=T0, note=None, user=None)
    monkeypatch.setattr(time_entries, "_get_entry", AsyncMock(return_value=other))
    assert client.put(f"/api/v1/time/entries/{ID}", json={"note": "x"}).status_code == 403
    assert client.delete(f"/api/v1/time/entries/{ID}").status_code == 403


def test_timesheet_of_another_user_is_forbidden_without_project(client, as_user):
    assert client.get(f"/api/v1/time/timesheet?user_id={uuid4()}").status_code == 403


def test_second_timer_conflicts(client, as_user, monkeypatch):
    async def allow(*a, **k):
        return SimpleNamespace(id=ID)

    monkeypatch.setattr(time_entries, "require_task_access", allow)
    monkeypatch.setattr(time_entries, "_running_entry", AsyncMock(return_value=SimpleNamespace(id=uuid4())))
    r = client.post(f"/api/v1/time/tasks/{ID}/start", json={})
    assert r.status_code == 409
    assert "running timer" in r.json()["detail"]
