"""Personal MCP access tokens: minting, hashing, resolving, and the ASGI gate in front of /mcp.

A token is `mono_mcp_<43 url-safe chars>`; only its SHA-256 is stored. Every MCP request carries the token, and every
tool call resolves it again (see app.mcp.context.acting_user), so revoking a token or deactivating its owner takes
effect on the next call, not the next connection.
"""
import hashlib
import secrets
from contextvars import ContextVar
from datetime import datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mcp_token import McpToken
from app.models.user import User

TOKEN_PREFIX = "mono_mcp_"
_TOUCH_EVERY = timedelta(minutes=1)

# Hash of the token the current MCP request/session authenticated with. Set by McpTokenGate (SSE) or mcp_server.py (stdio).
mcp_token_hash: ContextVar[Optional[str]] = ContextVar("mcp_token_hash", default=None)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def new_token() -> str:
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


async def mint_token(db: AsyncSession, user: User, name: str, expires_in_days: Optional[int] = None) -> Tuple[McpToken, str]:
    """Create a token for `user`; returns the row and the plaintext (shown once, never stored)."""
    raw = new_token()
    row = McpToken(
        user_id=user.id,
        name=name.strip() or "MCP token",
        token_prefix=raw[: len(TOKEN_PREFIX) + 6],
        token_hash=hash_token(raw),
        expires_at=datetime.utcnow() + timedelta(days=expires_in_days) if expires_in_days else None,
    )
    db.add(row)
    await db.flush()
    return row, raw


def token_is_usable(row: McpToken, user: Optional[User], now: Optional[datetime] = None) -> bool:
    now = now or datetime.utcnow()
    if row.revoked_at is not None:
        return False
    if row.expires_at is not None and row.expires_at <= now:
        return False
    return bool(user and user.is_active and user.approval_status == "approved")


async def resolve_token_hash(db: AsyncSession, token_hash: str) -> Optional[User]:
    """The active user a token hash belongs to, or None. Bumps last_used_at at most once a minute."""
    row = (await db.execute(select(McpToken).where(McpToken.token_hash == token_hash))).scalar_one_or_none()
    if row is None:
        return None
    user = await db.get(User, row.user_id)
    now = datetime.utcnow()
    if not token_is_usable(row, user, now):
        return None
    if row.last_used_at is None or now - row.last_used_at > _TOUCH_EVERY:
        row.last_used_at = now
        await db.commit()
    return user


async def resolve_token(db: AsyncSession, raw: str) -> Optional[User]:
    if not raw or not raw.startswith(TOKEN_PREFIX):
        return None
    return await resolve_token_hash(db, hash_token(raw))


def _bearer(scope) -> str:
    headers = dict(scope.get("headers") or [])
    supplied = headers.get(b"authorization", b"").decode("latin-1")
    return supplied[7:].strip() if supplied[:7].lower() == "bearer " else ""


async def _resolve_with_db(raw: str) -> Optional[User]:
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        return await resolve_token(db, raw)


class McpTokenGate:
    """ASGI wrapper for /mcp: requires `Authorization: Bearer <personal MCP token>` on every request.

    The SSE transport runs the MCP session inside the GET /sse request, so the contextvar set here is inherited by
    every tool call of that session. POST /messages requests are checked too, so a revoked token cannot send more.
    """

    def __init__(self, app, resolver=None):
        self.app = app
        self._resolver = resolver or _resolve_with_db

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        raw = _bearer(scope)
        user = await self._resolver(raw) if raw else None
        if user is None:
            if scope["type"] == "http":
                await send({"type": "http.response.start", "status": 401,
                            "headers": [(b"content-type", b"application/json"),
                                        (b"www-authenticate", b"Bearer")]})
                await send({"type": "http.response.body", "body": b'{"detail":"Unauthorized"}'})
            else:
                await send({"type": "websocket.close", "code": 1008})
            return
        reset = mcp_token_hash.set(hash_token(raw))
        try:
            await self.app(scope, receive, send)
        finally:
            mcp_token_hash.reset(reset)
