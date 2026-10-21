"""MCP over stdio, for clients that spawn a process instead of using /mcp/sse:

    podman exec -i -e MONOLITH_MCP_TOKEN=mono_mcp_... monolith_backend python mcp_server.py

The token is a personal one from Settings > MCP access; every tool acts as its owner.
"""
import asyncio
import os
import sys

from app import models  # noqa: F401  (register every mapper before the first query)
from app.core.mcp_tokens import hash_token, mcp_token_hash, resolve_token
from app.db.session import AsyncSessionLocal, engine
from app.mcp.server import mcp


async def _check(raw: str) -> bool:
    try:
        async with AsyncSessionLocal() as db:
            return await resolve_token(db, raw) is not None
    finally:
        await engine.dispose()  # the stdio server runs in a new event loop; drop connections bound to this one


if __name__ == "__main__":
    raw = os.environ.get("MONOLITH_MCP_TOKEN", "").strip()
    if not raw or not asyncio.run(_check(raw)):
        print("MONOLITH_MCP_TOKEN is missing, invalid, expired or revoked (Settings > MCP access).", file=sys.stderr)
        sys.exit(1)
    mcp_token_hash.set(hash_token(raw))  # inherited by the server's event loop; re-checked on every tool call
    mcp.run()
