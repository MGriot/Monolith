"""Sign-up needs an administrator's approval; approval e-mails a temporary password."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.api.api_v1.endpoints import auth as auth_mod
from app.api.api_v1.endpoints import users as users_mod
from app.core import security
from app.core.config import settings
from app.main import app


def make_user(**kw):
    base = dict(
        id=uuid4(), email="p@example.com", full_name="Pat", is_active=False, is_superuser=False,
        approval_status="pending", must_change_password=False, hashed_password="x",
    )
    base.update(kw)
    return SimpleNamespace(**base)


@pytest.fixture
def client():
    async def fake_db():
        db = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        db.delete = AsyncMock()
        yield db

    app.dependency_overrides[deps.get_db] = fake_db
    auth_mod.register_ip_limiter.reset("testclient")
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


class TestRegisterRequest:
    BODY = {"email": "New@Example.com", "full_name": "New Person"}

    def test_disabled_when_signup_flag_is_off(self, client, monkeypatch):
        monkeypatch.setattr(settings, "ALLOW_SIGNUP", False)
        assert client.post("/api/v1/auth/register-request", json=self.BODY).status_code == 403

    def test_creates_pending_inactive_request_without_a_password_field(self, client, monkeypatch):
        monkeypatch.setattr(settings, "ALLOW_SIGNUP", True)
        monkeypatch.setattr(auth_mod.crud_user, "get_by_email", AsyncMock(return_value=None))
        create = AsyncMock()
        monkeypatch.setattr(auth_mod.crud_user, "create_pending", create)
        r = client.post("/api/v1/auth/register-request", json=self.BODY)
        assert r.status_code == 200
        create.assert_awaited_once()
        assert create.await_args.kwargs["email"] == "new@example.com"

    def test_same_answer_for_known_address_and_nothing_created(self, client, monkeypatch):
        monkeypatch.setattr(settings, "ALLOW_SIGNUP", True)
        monkeypatch.setattr(auth_mod.crud_user, "get_by_email", AsyncMock(return_value=make_user()))
        create = AsyncMock()
        monkeypatch.setattr(auth_mod.crud_user, "create_pending", create)
        r = client.post("/api/v1/auth/register-request", json=self.BODY)
        assert r.status_code == 200 and r.json() == auth_mod.GENERIC_REGISTER_REPLY
        create.assert_not_awaited()

    def test_throttled_per_client(self, client, monkeypatch):
        monkeypatch.setattr(settings, "ALLOW_SIGNUP", True)
        monkeypatch.setattr(auth_mod.crud_user, "get_by_email", AsyncMock(return_value=make_user()))
        codes = [client.post("/api/v1/auth/register-request", json=self.BODY).status_code for _ in range(6)]
        assert codes[:5] == [200] * 5 and codes[5] == 429


class TestApproval:
    @pytest.fixture(autouse=True)
    def setup(self, monkeypatch):
        self.pending = make_user()
        monkeypatch.setattr(users_mod.crud_user, "get", AsyncMock(return_value=self.pending))
        self.enqueue = AsyncMock()
        monkeypatch.setattr(users_mod, "enqueue_email", self.enqueue)
        monkeypatch.setattr(settings, "EMAIL_ENABLED", True)

    def as_admin(self):
        app.dependency_overrides[deps.get_current_admin] = lambda: make_user(is_superuser=True, is_active=True, approval_status="approved")

    def test_endpoints_require_admin(self, client):
        uid = self.pending.id
        assert client.get("/api/v1/users/pending").status_code in (401, 403)
        assert client.post(f"/api/v1/users/{uid}/approve").status_code in (401, 403)
        assert client.post(f"/api/v1/users/{uid}/reject").status_code in (401, 403)

    def test_approve_activates_sets_temp_password_and_mails_it(self, client):
        self.as_admin()
        r = client.post(f"/api/v1/users/{self.pending.id}/approve")
        assert r.status_code == 200
        assert self.pending.is_active and self.pending.approval_status == "approved" and self.pending.must_change_password
        temp = self.enqueue.await_args.kwargs["temp_password"]
        assert self.enqueue.await_args.kwargs["to"] == "p@example.com"
        security.validate_password_strength(temp)
        assert security.verify_password(temp, self.pending.hashed_password)

    def test_approve_refused_when_mail_is_disabled(self, client, monkeypatch):
        self.as_admin()
        monkeypatch.setattr(settings, "EMAIL_ENABLED", False)
        assert client.post(f"/api/v1/users/{self.pending.id}/approve").status_code == 409
        assert not self.pending.is_active

    def test_cannot_approve_an_already_approved_user(self, client):
        self.as_admin()
        self.pending.approval_status = "approved"
        assert client.post(f"/api/v1/users/{self.pending.id}/approve").status_code == 404

    def test_reject_deletes_the_request(self, client):
        self.as_admin()
        assert client.post(f"/api/v1/users/{self.pending.id}/reject").status_code == 204
