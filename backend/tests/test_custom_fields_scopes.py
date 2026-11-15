"""Custom fields on projects, global definitions and the number / currency / checkbox / url types (no database).

Run:  pytest backend/tests/test_custom_fields_scopes.py
The SQL side (partial unique indexes, value cleanup across tables) is in tests/test_db_integration.py.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.api.api_v1.endpoints import custom_fields as fields_api
from app.api.api_v1.endpoints import projects as projects_api
from app.core import activity
from app.core.custom_fields import (
    export_columns,
    export_label,
    normalize_number_settings,
    validate_custom_values,
)
from app.main import app

ID = uuid4()


def fdef(field_type, name="F", options=None, **kw):
    base = dict(unit=None, currency=None, min_value=None, max_value=None, decimals=None)
    base.update(kw)
    return SimpleNamespace(id=uuid4(), name=name, field_type=field_type, options=options or [], **base)


def one(field, value):
    return validate_custom_values([field], {str(field.id): value})[str(field.id)]


# --------------------------------------------------------------------------- new value types
class TestNewTypes:
    def test_checkbox(self):
        f = fdef("checkbox")
        assert one(f, True) is True and one(f, False) is False
        for bad in (1, 0, "true"):
            with pytest.raises(ValueError):
                one(f, bad)

    @pytest.mark.parametrize("value", ["https://example.com/x?y=1", "http://intranet.local", "  https://a.b  "])
    def test_url_accepts_http_links(self, value):
        assert one(fdef("url"), value) == value.strip()

    @pytest.mark.parametrize("value", ["example.com", "ftp://x.y", "javascript:alert(1)", "https://", 5,
                                       "https://x.y/" + "a" * 2048])
    def test_url_rejects_other_things(self, value):
        with pytest.raises(ValueError):
            one(fdef("url"), value)

    def test_currency_is_a_number(self):
        f = fdef("currency", currency="EUR")
        assert one(f, 1234.5) == 1234.5
        with pytest.raises(ValueError):
            one(f, "1234")


class TestNumberLimits:
    def test_min_and_max(self):
        f = fdef("number", min_value=0, max_value=10)
        assert one(f, 0) == 0 and one(f, 10) == 10
        with pytest.raises(ValueError, match="at least 0"):
            one(f, -1)
        with pytest.raises(ValueError, match="at most 10"):
            one(f, 10.5)

    def test_decimals_round(self):
        assert one(fdef("currency", decimals=2), 12.346) == 12.35
        assert one(fdef("number", decimals=0), 7.6) == 8
        assert isinstance(one(fdef("number", decimals=0), 7.6), int)

    def test_rounding_happens_before_the_limit_check(self):
        assert one(fdef("number", decimals=0, max_value=10), 10.4) == 10


class TestNumberSettings:
    def test_unit_on_number(self):
        s = normalize_number_settings("number", unit=" h ", min_value=0, decimals=1)
        assert (s.unit, s.min_value, s.decimals) == ("h", 0, 1)

    def test_currency_code_is_upper_cased(self):
        assert normalize_number_settings("currency", currency="eur").currency == "EUR"

    def test_blank_strings_are_none(self):
        s = normalize_number_settings("number", unit="  ")
        assert s.unit is None

    @pytest.mark.parametrize(
        "field_type,kw",
        [
            ("text", {"unit": "h"}),
            ("select", {"min_value": 1}),
            ("checkbox", {"decimals": 0}),
            ("currency", {"unit": "h"}),
            ("number", {"currency": "EUR"}),
            ("currency", {"currency": "EURO"}),
            ("currency", {"currency": "12A"}),
            ("number", {"min_value": 5, "max_value": 1}),
            ("number", {"decimals": 7}),
            ("number", {"min_value": float("inf")}),
            ("number", {"unit": "x" * 33}),
        ],
    )
    def test_invalid_combinations(self, field_type, kw):
        with pytest.raises(ValueError):
            normalize_number_settings(field_type, **kw)


class TestExport:
    def test_labels(self):
        assert export_label(fdef("number", name="Effort", unit="h")) == "Effort (h)"
        assert export_label(fdef("currency", name="Budget"), "EUR") == "Budget (EUR)"
        assert export_label(fdef("currency", name="Budget", currency="USD"), "EUR") == "Budget (USD)"
        assert export_label(fdef("text", name="Notes")) == "Notes"

    def test_columns_line_up_and_checkboxes_read_yes_no(self):
        a, b, c = fdef("checkbox", name="Signed"), fdef("text", name="Notes"), fdef("checkbox", name="Paid")
        out = export_columns([a, b, c], {str(a.id): True, str(c.id): False})
        assert out == {"Signed": "Yes", "Notes": "", "Paid": "No"}


def test_activity_counts_changed_custom_fields():
    k1, k2 = str(uuid4()), str(uuid4())
    lines = activity.describe({"custom_values": [{k1: 1}, {k1: 2, k2: "x"}]})
    assert lines[0][1] == "updated 2 custom fields"
    lines = activity.describe({"custom_values": [{}, {k1: 1}]})
    assert lines[0][1] == "updated 1 custom field"


# --------------------------------------------------------------------------- HTTP: global routes, project values
@pytest.fixture
def client():
    async def fake_db():
        yield MagicMock()

    app.dependency_overrides[deps.get_db] = fake_db
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def _user(superuser=False):
    return SimpleNamespace(id=uuid4(), email="u@example.com", is_active=True, is_superuser=superuser)


GLOBAL_WRITES = [
    ("POST", "/api/v1/custom-fields", {"name": "Budget", "field_type": "currency"}),
    ("PUT", f"/api/v1/custom-fields/{ID}", {"name": "Y"}),
    ("DELETE", f"/api/v1/custom-fields/{ID}", None),
]


@pytest.mark.parametrize("method,path,body", GLOBAL_WRITES, ids=[m for m, _, _ in GLOBAL_WRITES])
def test_global_writes_need_a_superuser(client, method, path, body):
    assert client.request(method, path, json=body).status_code == 401
    app.dependency_overrides[deps.get_current_user] = lambda: _user()
    assert client.request(method, path, json=body).status_code == 403


def test_any_user_can_list_global_fields(client, monkeypatch):
    app.dependency_overrides[deps.get_current_user] = lambda: _user()
    f = SimpleNamespace(**vars(fdef("currency", name="Budget", currency="EUR")), project_id=None, scope="global",
                        applies_to="project", position=0)
    monkeypatch.setattr(fields_api.crud_custom_field, "list_global_defs", AsyncMock(return_value=[f]))
    r = client.get("/api/v1/custom-fields?applies_to=project")
    assert r.status_code == 200
    assert r.json()[0]["scope"] == "global" and r.json()[0]["currency"] == "EUR"


def test_superuser_create_rejects_bad_settings(client, monkeypatch):
    app.dependency_overrides[deps.get_current_user] = lambda: _user(superuser=True)
    monkeypatch.setattr(fields_api.crud_custom_field, "name_taken", AsyncMock(return_value=False))
    r = client.post("/api/v1/custom-fields", json={"name": "Effort", "field_type": "text", "unit": "h"})
    assert r.status_code == 400


def test_duplicate_global_name_conflicts(client, monkeypatch):
    app.dependency_overrides[deps.get_current_user] = lambda: _user(superuser=True)
    monkeypatch.setattr(fields_api.crud_custom_field, "name_taken", AsyncMock(return_value=True))
    r = client.post("/api/v1/custom-fields", json={"name": "Budget", "field_type": "currency"})
    assert r.status_code == 409


def test_project_update_validates_custom_values(client, monkeypatch):
    app.dependency_overrides[deps.get_current_user] = lambda: _user()
    monkeypatch.setattr(projects_api.crud_project.project, "get", AsyncMock(return_value=SimpleNamespace(id=ID)))
    monkeypatch.setattr(projects_api, "require_project_access", AsyncMock())
    budget = fdef("currency", name="Budget", min_value=0)
    monkeypatch.setattr(projects_api.crud_custom_field, "list_defs", AsyncMock(return_value=[budget]))
    r = client.put(f"/api/v1/projects/{ID}", json={"custom_values": {str(budget.id): -5}})
    assert r.status_code == 400 and "at least 0" in r.json()["detail"]
    r = client.put(f"/api/v1/projects/{ID}", json={"custom_values": {str(uuid4()): 1}})
    assert r.status_code == 400 and "Unknown custom field" in r.json()["detail"]
