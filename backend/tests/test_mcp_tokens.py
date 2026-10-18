"""Personal MCP tokens: minting, validity rules, resolution and the REST endpoints (no database).

Run:  pytest backend/tests/test_mcp_tokens.py
"""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api import deps
from app.core import mcp_tokens
from app.core.mcp_tokens import TOKEN_PREFIX, hash_token, mint_token, new_token, resolve_token, token_is_usable
from app.main import app


def run(coro):
    return asyncio.run(coro)


def user(**kw):
    return SimpleNamespace(**{"id": uuid4(), "is_active": True, "approval_status": "approved", **kw})


def row(**kw):
    return SimpleNamespace(**{"revoked_at": None, "expires_at": None, "last_used_at": None, "user_id": uuid4(), **kw})


class TestTokens:
    def test_format_and_hash(self):
        raw = new_token()
        assert raw.startswith(TOKEN_PREFIX) and len(raw) > len(TOKEN_PREFIX) + 40
        assert hash_token(raw) == hash_token(raw) and hash_token(raw) != hash_token(new_token())
        assert raw not in hash_token(raw)

    def test_usable_rules(self):
        now = datetime(2026, 10, 18)
        assert token_is_usable(row(), user(), now)
        assert not token_is_usable(row(revoked_at=now), user(), now)
        assert not token_is_usable(row(expires_at=now - timedelta(seconds=1)), user(), now)
        assert token_is_usable(row(expires_at=now + timedelta(days=1)), user(), now)
        assert not token_is_usable(row(), user(is_active=False), now)
        assert not token_is_usable(row(), user(approval_status="pending"), now)
        assert not token_is_usable(row(), None, now)

    def test_mint_stores_only_the_hash(self):
        db = MagicMock()
        db.flush = AsyncMock()
        owner = user()
        token_row, raw = run(mint_token(db, owner, "  Laptop  ", expires_in_days=30))
        assert token_row.token_hash == hash_token(raw)
        assert token_row.name == "Laptop" and token_row.user_id == owner.id
        assert raw.startswith(token_row.token_prefix) and len(token_row.token_prefix) < len(raw)
        assert token_row.expires_at > datetime.utcnow() + timedelta(days=29)
        assert raw not in vars(token_row).values()

    def test_resolve_ignores_foreign_strings_without_a_query(self):
        db = MagicMock()
        db.execute = AsyncMock()
        assert run(resolve_token(db, "eyJhbGciOi.jwt.token")) is None
        assert run(resolve_token(db, "")) is None
        db.execute.assert_not_awaited()

    def test_resolve_updates_last_used(self):
        owner = user()
        token = row(user_id=owner.id)
        result = MagicMock()
        result.scalar_one_or_none.return_value = token
        db = MagicMock()
        db.execute = AsyncMock(return_value=result)
        db.get = AsyncMock(return_value=owner)
        db.commit = AsyncMock()
        assert run(resolve_token(db, new_token())) is owner
        assert token.last_used_at is not None
        db.commit.assert_awaited_once()


class TestEndpoints:
    def setup_method(self):
        self.me = user(is_superuser=False, email="me@example.com", full_name="Me")
        self.db = MagicMock()
        self.db.commit = AsyncMock()
        app.dependency_overrides[deps.get_current_user] = lambda: self.me
        app.dependency_overrides[deps.get_db] = lambda: self.db
        self.client = TestClient(app)

    def teardown_method(self):
        app.dependency_overrides.clear()

    def test_create_returns_the_secret_once(self, monkeypatch):
        created = SimpleNamespace(id=uuid4(), name="CLI", token_prefix="mono_mcp_abcdef",
                                  created_at=datetime.utcnow(), last_used_at=None, expires_at=None, revoked_at=None)
        mint = AsyncMock(return_value=(created, "mono_mcp_abcdef-secret"))
        monkeypatch.setattr(mcp_tokens, "mint_token", mint)
        r = self.client.post("/api/v1/users/me/mcp-tokens", json={"name": "CLI", "expires_in_days": 90})
        assert r.status_code == 201
        assert r.json()["token"] == "mono_mcp_abcdef-secret"
        assert mint.await_args.args[1] is self.me and mint.await_args.args[3] == 90

    def test_create_validates_expiry(self):
        assert self.client.post("/api/v1/users/me/mcp-tokens", json={"name": "x", "expires_in_days": 0}).status_code == 422

    def test_cannot_revoke_someone_elses_token(self):
        self.db.get = AsyncMock(return_value=row(user_id=uuid4()))
        assert self.client.delete(f"/api/v1/users/me/mcp-tokens/{uuid4()}").status_code == 404

    def test_revoke_own_token(self):
        token = row(user_id=self.me.id)
        self.db.get = AsyncMock(return_value=token)
        assert self.client.delete(f"/api/v1/users/me/mcp-tokens/{uuid4()}").status_code == 204
        assert token.revoked_at is not None
