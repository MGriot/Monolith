from typing import Annotated, Any
from uuid import UUID

from pydantic import Field

from app.api.api_v1.endpoints import users as users_api
from app.mcp.context import build, call
from app.mcp.server import mcp
from app.schemas.user import UserCreate


@mcp.tool()
async def whoami() -> dict[str, Any]:
    """The account this MCP token acts as (id, e-mail, name, administrator flag, e-mail preferences)."""
    return await call(users_api.read_user_me)


@mcp.tool()
async def list_users(
    limit: Annotated[int, Field(ge=1, le=500, description="Page size")] = 100,
    offset: Annotated[int, Field(ge=0)] = 0,
) -> list[dict[str, Any]]:
    """Active team members you can add to projects or assign to tasks (id, e-mail, full name)."""
    return await call(users_api.read_users, skip=offset, limit=limit)


@mcp.tool()
async def create_user(
    email: Annotated[str, Field(description="Login e-mail")],
    password: Annotated[str, Field(description="Initial password; must pass the server's strength rules")],
    full_name: str | None = None,
    is_superuser: bool = False,
) -> dict[str, Any]:
    """Administrators only: create an account directly (no approval step). Prefer inviting real people."""
    user_in = build(UserCreate, {"email": email, "password": password, "full_name": full_name, "is_superuser": is_superuser})
    return await call(users_api.create_user, user_in=user_in)


@mcp.tool()
async def list_pending_users() -> list[dict[str, Any]]:
    """Administrators only: self-registration requests waiting for approval."""
    return await call(users_api.read_pending_users)


@mcp.tool()
async def approve_user(user_id: UUID) -> dict[str, Any]:
    """Administrators only: approve a pending sign-up (the person gets an e-mail to set a password)."""
    return await call(users_api.approve_user, user_id=user_id)


@mcp.tool()
async def reject_user(user_id: UUID) -> dict[str, Any]:
    """Administrators only: delete a pending sign-up request."""
    return await call(users_api.reject_user, user_id=user_id)
