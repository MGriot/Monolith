"""
Tier-0 follow-up regression tests: seeding, sign-up policy, login throttling, SSRF guard,
websocket auth, CORS. Database-free (dependency overrides / scripted fakes).
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
import jwt
from starlette.websockets import WebSocketDisconnect

from app.api import deps
from app.api.api_v1.endpoints import login as login_mod
from app.api.api_v1.endpoints import notifications as notif_mod
from app.api.api_v1.endpoints import users as users_mod
from app.core import netguard, security
from app.core.config import settings
from app.core.ratelimit import FailureLimiter
from app.core.websockets import manager
from app.main import app


def run(coro):
    return asyncio.run(coro)


def make_user(**kw):
    base = dict(
        id=uuid4(), email="me@example.com", is_active=True, is_superuser=False,
        hashed_password=security.get_password_hash("correct-horse"), full_name="Me",
    )
    base.update(kw)
    return SimpleNamespace(**base)


@pytest.fixture
def client():
    async def fake_db():
        yield MagicMock()

    app.dependency_overrides[deps.get_db] = fake_db
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


# --------------------------------------------------------------------------- limiter
class TestFailureLimiter:
    def test_blocks_after_max_failures_and_reports_retry_after(self):
        lim = FailureLimiter(3, 60)
        for _ in range(2):
            lim.record_failure("k")
        assert lim.retry_after("k") == 0
        lim.record_failure("k")
        assert 1 <= lim.retry_after("k") <= 61

    def test_reset_unblocks(self):
        lim = FailureLimiter(1, 60)
        lim.record_failure("k")
        assert lim.retry_after("k") > 0
        lim.reset("k")
        assert lim.retry_after("k") == 0

    def test_window_expires(self, monkeypatch):
        lim = FailureLimiter(1, 10)
        now = [1000.0]
        monkeypatch.setattr("app.core.ratelimit.time.monotonic", lambda: now[0])
        lim.record_failure("k")
        assert lim.retry_after("k") > 0
        now[0] += 11
        assert lim.retry_after("k") == 0

    def test_keys_are_independent_and_memory_is_bounded(self):
        lim = FailureLimiter(1, 60, max_keys=5)
        for i in range(50):
            lim.record_failure(f"k{i}")
        assert len(lim._failures) <= 5
        assert lim.retry_after("never-seen") == 0


# --------------------------------------------------------------------------- login
class TestLogin:
    @pytest.fixture(autouse=True)
    def fresh_limiters(self, monkeypatch):
        monkeypatch.setattr(login_mod, "login_limiter", FailureLimiter(5, 900))
        monkeypatch.setattr(login_mod, "ip_limiter", FailureLimiter(30, 900))

    def _post(self, client, email="a@example.com", password="x"):
        return client.post("/api/v1/login/access-token", data={"username": email, "password": password})

    def test_sixth_failed_attempt_is_throttled(self, client, monkeypatch):
        monkeypatch.setattr(login_mod.crud_user, "authenticate", AsyncMock(return_value=None))
        codes = [self._post(client).status_code for _ in range(5)]
        assert codes == [400] * 5
        r = self._post(client)
        assert r.status_code == 429 and int(r.headers["retry-after"]) > 0

    def test_throttle_is_per_account(self, client, monkeypatch):
        monkeypatch.setattr(login_mod.crud_user, "authenticate", AsyncMock(return_value=None))
        for _ in range(5):
            self._post(client, "victim@example.com")
        assert self._post(client, "victim@example.com").status_code == 429
        assert self._post(client, "someone-else@example.com").status_code == 400

    def test_success_resets_the_counter(self, client, monkeypatch):
        user = make_user()
        auth = AsyncMock(side_effect=[None, None, None, None, user, None, None, None, None, None])
        monkeypatch.setattr(login_mod.crud_user, "authenticate", auth)
        for _ in range(4):
            assert self._post(client).status_code == 400
        ok = self._post(client)
        assert ok.status_code == 200 and ok.json()["token_type"] == "bearer"
        # counter was reset: four more failures still allowed
        assert [self._post(client).status_code for _ in range(4)] == [400] * 4

    def test_blocked_account_does_not_even_check_the_password(self, client, monkeypatch):
        auth = AsyncMock(return_value=None)
        monkeypatch.setattr(login_mod.crud_user, "authenticate", auth)
        for _ in range(5):
            self._post(client)
        auth.reset_mock()
        assert self._post(client).status_code == 429
        auth.assert_not_awaited()

    def test_unknown_email_costs_a_password_hash(self, monkeypatch):
        from app.crud import crud_user

        monkeypatch.setattr(crud_user, "get_by_email", AsyncMock(return_value=None))
        spy = MagicMock(return_value=False)
        monkeypatch.setattr(crud_user, "verify_password", spy)
        assert run(crud_user.authenticate(MagicMock(), "ghost@example.com", "pw")) is None
        spy.assert_called_once()


# --------------------------------------------------------------------------- sign-up & password policy
class TestSignup:
    BODY = {"email": "new@example.com", "password": "long-enough-1", "full_name": "New"}

    @pytest.fixture(autouse=True)
    def stubs(self, monkeypatch):
        monkeypatch.setattr(users_mod.crud_user, "get_by_email", AsyncMock(return_value=None))
        self.created = AsyncMock(side_effect=lambda db, obj_in: SimpleNamespace(
            id=uuid4(), email=obj_in.email, is_active=True, is_superuser=obj_in.is_superuser, full_name=obj_in.full_name
        ))
        monkeypatch.setattr(users_mod.crud_user, "create", self.created)

    def test_anonymous_signup_disabled_by_default(self, client, monkeypatch):
        monkeypatch.setattr(settings, "ALLOW_SIGNUP", False)
        r = client.post("/api/v1/users/", json=self.BODY)
        assert r.status_code == 403
        self.created.assert_not_awaited()

    def test_signup_flag_never_lets_anonymous_create_an_active_account(self, client, monkeypatch):
        # public sign-up goes through /auth/register-request + admin approval, never straight to POST /users/
        monkeypatch.setattr(settings, "ALLOW_SIGNUP", True)
        for body in (self.BODY, {**self.BODY, "is_superuser": True}):
            assert client.post("/api/v1/users/", json=body).status_code == 403
        self.created.assert_not_awaited()

    def test_admin_can_create_even_when_signup_disabled(self, client, monkeypatch):
        monkeypatch.setattr(settings, "ALLOW_SIGNUP", False)
        admin = make_user(is_superuser=True)
        app.dependency_overrides[deps.get_current_user_optional] = lambda: admin
        r = client.post("/api/v1/users/", json={**self.BODY, "is_superuser": True})
        assert r.status_code == 200

    def test_non_admin_user_cannot_create_accounts_when_signup_disabled(self, client, monkeypatch):
        monkeypatch.setattr(settings, "ALLOW_SIGNUP", False)
        app.dependency_overrides[deps.get_current_user_optional] = lambda: make_user()
        assert client.post("/api/v1/users/", json=self.BODY).status_code == 403

    @pytest.mark.parametrize("pw", ["short", "", " padded-password ", "x" * 73])
    def test_weak_passwords_rejected(self, client, monkeypatch, pw):
        app.dependency_overrides[deps.get_current_user_optional] = lambda: make_user(is_superuser=True)
        r = client.post("/api/v1/users/", json={**self.BODY, "password": pw})
        assert r.status_code == 422
        self.created.assert_not_awaited()

    def test_validate_password_strength_accepts_reasonable_password(self):
        security.validate_password_strength("correct-horse-battery")


class TestUpdateMe:
    @pytest.fixture(autouse=True)
    def setup(self, monkeypatch):
        self.user = make_user()
        app.dependency_overrides[deps.get_current_user] = lambda: self.user
        self.update = AsyncMock(return_value=self.user)
        monkeypatch.setattr(users_mod.crud_user, "update", self.update)
        monkeypatch.setattr(users_mod.crud_user, "get_by_email", AsyncMock(return_value=None))

    def test_password_change_needs_current_password(self, client):
        assert client.put("/api/v1/users/me", json={"password": "brand-new-pass"}).status_code == 400
        self.update.assert_not_awaited()

    def test_password_change_rejects_wrong_current_password(self, client):
        r = client.put("/api/v1/users/me", json={"password": "brand-new-pass", "current_password": "nope"})
        assert r.status_code == 400
        self.update.assert_not_awaited()

    def test_password_change_with_correct_current_password(self, client):
        r = client.put("/api/v1/users/me", json={"password": "brand-new-pass", "current_password": "correct-horse"})
        assert r.status_code == 200
        self.update.assert_awaited_once()

    def test_new_password_must_meet_policy(self, client):
        r = client.put("/api/v1/users/me", json={"password": "short", "current_password": "correct-horse"})
        assert r.status_code == 422

    def test_email_change_needs_current_password(self, client):
        assert client.put("/api/v1/users/me", json={"email": "other@example.com"}).status_code == 400

    def test_email_already_taken_is_400_not_500(self, client, monkeypatch):
        monkeypatch.setattr(users_mod.crud_user, "get_by_email", AsyncMock(return_value=make_user()))
        r = client.put("/api/v1/users/me", json={"email": "taken@example.com", "current_password": "correct-horse"})
        assert r.status_code == 400

    def test_name_only_update_needs_no_password(self, client):
        r = client.put("/api/v1/users/me", json={"full_name": "New Name", "email": self.user.email})
        assert r.status_code == 200


# --------------------------------------------------------------------------- seeding
class FakeSeedSession:
    def __init__(self, users_by_email):
        self.users = users_by_email
        self.added = []
        self.committed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, stmt):
        email = stmt.whereclause.right.value  # `User.email == <email>`
        found = self.users.get(email)
        return SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: found))

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.committed = True


class TestSeeding:
    def _seed(self, monkeypatch, session, email="", password=""):
        from app.db import init_db

        monkeypatch.setattr(init_db, "AsyncSessionLocal", lambda: session)
        monkeypatch.setattr(settings, "FIRST_SUPERUSER_EMAIL", email)
        monkeypatch.setattr(settings, "FIRST_SUPERUSER_PASSWORD", password)
        run(init_db.seed_users())

    def test_nothing_is_seeded_without_configuration(self, monkeypatch):
        s = FakeSeedSession({})
        self._seed(monkeypatch, s)
        assert s.added == [] and not s.committed

    def test_configured_superuser_is_created_once(self, monkeypatch):
        s = FakeSeedSession({})
        self._seed(monkeypatch, s, "root@example.com", "a-strong-password")
        assert len(s.added) == 1 and s.committed
        u = s.added[0]
        assert u.email == "root@example.com" and u.is_superuser and u.is_active
        assert u.hashed_password != "a-strong-password"
        assert security.verify_password("a-strong-password", u.hashed_password)

        s2 = FakeSeedSession({"root@example.com": u})
        self._seed(monkeypatch, s2, "root@example.com", "a-strong-password")
        assert s2.added == []

    def test_weak_configured_password_is_refused(self, monkeypatch):
        s = FakeSeedSession({})
        self._seed(monkeypatch, s, "root@example.com", "short")
        assert s.added == []

    def test_no_default_accounts_are_ever_created(self, monkeypatch):
        s = FakeSeedSession({})
        self._seed(monkeypatch, s, "root@example.com", "a-strong-password")
        assert all(u.email not in ("admin@admin.com", "tester@example.com") for u in s.added)

    def test_legacy_default_password_is_flagged(self, monkeypatch, caplog):
        legacy = SimpleNamespace(email="admin@admin.com", hashed_password=security.get_password_hash("admin123"))
        s = FakeSeedSession({"admin@admin.com": legacy})
        with caplog.at_level(logging.CRITICAL):
            self._seed(monkeypatch, s)
        assert any("default password" in r.getMessage() for r in caplog.records)

    def test_changed_admin_password_is_not_flagged(self, monkeypatch, caplog):
        safe = SimpleNamespace(email="admin@admin.com", hashed_password=security.get_password_hash("changed-it-long"))
        s = FakeSeedSession({"admin@admin.com": safe})
        with caplog.at_level(logging.CRITICAL):
            self._seed(monkeypatch, s)
        assert not caplog.records


# --------------------------------------------------------------------------- SSRF
class TestNetGuard:
    @pytest.fixture(autouse=True)
    def strict(self, monkeypatch):
        monkeypatch.setattr(settings, "WEBHOOK_ALLOW_PRIVATE", False)

    @pytest.mark.parametrize("url", [
        "http://127.0.0.1/hook",
        "http://localhost:8000/hook",
        "http://10.0.0.5/hook",
        "http://192.168.1.10/hook",
        "http://172.16.0.1/hook",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/hook",
        "http://[::ffff:10.0.0.1]/hook",
        "http://0.0.0.0/hook",
        "http://db:5432/",
        "file:///etc/passwd",
        "ftp://example.com/x",
        "gopher://example.com/",
        "http://user:pw@93.184.216.34/hook",
        "https:///nohost",
        "",
    ])
    def test_internal_and_odd_urls_are_rejected(self, url):
        with pytest.raises(netguard.UnsafeURLError):
            run(netguard.assert_safe_url(url))

    @pytest.mark.parametrize("url", ["https://93.184.216.34/hook", "http://8.8.8.8:8080/x"])
    def test_public_addresses_are_allowed(self, url):
        run(netguard.assert_safe_url(url))

    def test_hostname_resolving_to_private_ip_is_rejected(self, monkeypatch):
        async def fake_getaddrinfo(host, port, **kw):
            return [(2, 1, 6, "", ("10.1.2.3", port))]

        loop = asyncio.new_event_loop()
        monkeypatch.setattr(loop, "getaddrinfo", fake_getaddrinfo)

        async def go():
            asyncio.get_running_loop().getaddrinfo = fake_getaddrinfo
            await netguard.assert_safe_url("https://innocent.example.com/hook")

        with pytest.raises(netguard.UnsafeURLError):
            loop.run_until_complete(go())
        loop.close()

    def test_one_private_record_among_public_ones_is_enough_to_reject(self, monkeypatch):
        async def fake_getaddrinfo(host, port, **kw):
            return [(2, 1, 6, "", ("93.184.216.34", port)), (2, 1, 6, "", ("192.168.0.9", port))]

        async def go():
            asyncio.get_running_loop().getaddrinfo = fake_getaddrinfo
            await netguard.assert_safe_url("https://mixed.example.com/")

        with pytest.raises(netguard.UnsafeURLError):
            asyncio.new_event_loop().run_until_complete(go())

    def test_opt_in_allows_private_targets(self, monkeypatch):
        monkeypatch.setattr(settings, "WEBHOOK_ALLOW_PRIVATE", True)
        run(netguard.assert_safe_url("http://10.0.0.5/hook"))
        with pytest.raises(netguard.UnsafeURLError):  # scheme rules still apply
            run(netguard.assert_safe_url("file:///etc/passwd"))

    def test_send_is_blocked_before_any_request(self, monkeypatch):
        from app.core import webhooks

        client_cls = MagicMock()
        monkeypatch.setattr(webhooks.httpx, "AsyncClient", client_cls)
        assert run(webhooks.webhook_service.send_generic_notification("http://169.254.169.254/", {})) is False
        client_cls.assert_not_called()

    def test_create_and_update_endpoints_reject_internal_urls(self, client, monkeypatch):
        from app.api.api_v1.endpoints import webhooks as ep

        user = make_user()
        app.dependency_overrides[deps.get_current_user] = lambda: user
        create = AsyncMock()
        monkeypatch.setattr(ep.crud_webhook.webhook, "create_with_owner", create)
        r = client.post("/api/v1/webhooks/", json={"name": "x", "url": "http://127.0.0.1:9000/", "provider": "generic"})
        assert r.status_code == 400
        create.assert_not_awaited()

        hook = SimpleNamespace(id=uuid4(), owner_id=user.id)
        monkeypatch.setattr(ep.crud_webhook.webhook, "get", AsyncMock(return_value=hook))
        upd = AsyncMock()
        monkeypatch.setattr(ep.crud_webhook.webhook, "update", upd)
        r = client.put(f"/api/v1/webhooks/{hook.id}", json={"url": "http://10.0.0.1/x"})
        assert r.status_code == 400
        upd.assert_not_awaited()


# --------------------------------------------------------------------------- websocket
def _token(sub, minutes=30):
    exp = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return jwt.encode({"sub": str(sub), "exp": exp}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


class TestWebSocketAuth:
    URL = "/api/v1/notifications/ws"

    def test_token_in_url_path_is_no_longer_accepted(self, client):
        with pytest.raises(Exception):
            with client.websocket_connect(f"{self.URL}/{_token(uuid4())}") as ws:
                ws.receive_text()

    def test_first_message_must_be_auth(self, client):
        with client.websocket_connect(self.URL) as ws:
            ws.send_text("ping")
            with pytest.raises(WebSocketDisconnect) as e:
                ws.receive_text()
            assert e.value.code == 1008

    def test_bad_token_is_rejected(self, client):
        with client.websocket_connect(self.URL) as ws:
            ws.send_json({"type": "auth", "token": "garbage"})
            with pytest.raises(WebSocketDisconnect) as e:
                ws.receive_text()
            assert e.value.code == 1008

    def test_valid_token_authenticates_and_pings(self, client, monkeypatch):
        uid = uuid4()
        monkeypatch.setattr(notif_mod, "_authenticate_ws_token",
                            AsyncMock(return_value=(uid, (datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp())))
        with client.websocket_connect(self.URL) as ws:
            ws.send_json({"type": "auth", "token": "whatever"})
            assert ws.receive_json() == {"type": "auth_ok"}
            assert uid in manager.active_connections
            ws.send_text("ping")
            assert ws.receive_text() == "pong"
        assert uid not in manager.active_connections

    def test_socket_closes_once_the_token_has_expired(self, client, monkeypatch):
        monkeypatch.setattr(notif_mod, "_authenticate_ws_token",
                            AsyncMock(return_value=(uuid4(), datetime.now(timezone.utc).timestamp() - 1)))
        with client.websocket_connect(self.URL) as ws:
            ws.send_json({"type": "auth", "token": "whatever"})
            assert ws.receive_json() == {"type": "auth_ok"}
            ws.send_text("ping")
            with pytest.raises(WebSocketDisconnect) as e:
                ws.receive_text()
            assert e.value.code == 1008

    def test_token_validation_checks_signature_expiry_and_active_flag(self, monkeypatch):
        user = make_user()

        class Ctx:
            async def __aenter__(self):
                return MagicMock()

            async def __aexit__(self, *a):
                return False

        monkeypatch.setattr(notif_mod, "AsyncSessionLocal", lambda: Ctx())
        monkeypatch.setattr(notif_mod.crud_user, "get", AsyncMock(return_value=user))

        ok = run(notif_mod._authenticate_ws_token(_token(user.id)))
        assert ok is not None and ok[0] == user.id
        assert run(notif_mod._authenticate_ws_token(_token(user.id, minutes=-1))) is None
        assert run(notif_mod._authenticate_ws_token("garbage")) is None
        forged = jwt.encode({"sub": str(user.id)}, "other-key-that-is-not-the-server-secret-xyz", algorithm="HS256")
        assert run(notif_mod._authenticate_ws_token(forged)) is None

        user.is_active = False
        assert run(notif_mod._authenticate_ws_token(_token(user.id))) is None
        monkeypatch.setattr(notif_mod.crud_user, "get", AsyncMock(return_value=None))
        assert run(notif_mod._authenticate_ws_token(_token(uuid4()))) is None


# --------------------------------------------------------------------------- CORS
class TestCors:
    def _preflight(self, client, origin):
        return client.options(
            "/api/health",
            headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
        )

    def test_unknown_origin_gets_no_cors_headers(self, client):
        r = self._preflight(client, "https://evil.example")
        assert "access-control-allow-origin" not in r.headers

    def test_dev_origin_is_allowed_without_credentials(self, client):
        r = self._preflight(client, "http://localhost:5173")
        assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
        assert "access-control-allow-credentials" not in r.headers

    def test_origin_list_parsing(self, monkeypatch):
        monkeypatch.setattr(settings, "CORS_ORIGINS", " https://a.example , ,https://b.example ")
        assert settings.cors_origin_list == ["https://a.example", "https://b.example"]
        monkeypatch.setattr(settings, "CORS_ORIGINS", "")
        assert "http://localhost:5173" in settings.cors_origin_list
