"""Run MCP tools as the token's owner, through the same handlers as the REST API.

`call(endpoint, **kwargs)` invokes a FastAPI path function directly: the database session and the acting user are
injected where the handler declares `Depends(get_db)` / `Depends(get_current_user)`, `Query(...)` defaults are
resolved, and the result is serialized with the route's `response_model`. Permission checks, validation and side
effects (status propagation, automations, notifications, webhooks) are therefore exactly the REST ones.
"""
import inspect
from functools import lru_cache
from typing import Any, Callable, Dict, Optional, Union

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.params import Depends as DependsParam, Param, Body as BodyParam
from fastapi.routing import APIRoute
from mcp.server.fastmcp.exceptions import ToolError
from pydantic import TypeAdapter, ValidationError

from app.api import deps
from app.core.mcp_tokens import mcp_token_hash, resolve_token_hash
from app.db.session import AsyncSessionLocal
from app.models.user import User


# Return type for tools over handlers without a response model: FastMCP wraps it as structured {"result": ...},
# so clients always get one JSON value (a bare `Any` list would arrive as one text block per item).
Json = Union[Dict[str, Any], list, None]


def _walk(router):
    for r in router.routes:
        if isinstance(r, APIRoute):
            yield r
        elif hasattr(r, "original_router"):  # newer FastAPI keeps included routers lazily
            yield from _walk(r.original_router)


@lru_cache(maxsize=1)
def routes_by_endpoint() -> Dict[Callable, APIRoute]:
    from app.api.api_v1.api import api_router

    return {r.endpoint: r for r in _walk(api_router)}


async def acting_user(db) -> User:
    """The user behind the current MCP token, re-checked on every call (revocation is immediate)."""
    token_hash = mcp_token_hash.get()
    if not token_hash:
        raise ToolError("Not authenticated: connect with a personal MCP token (Settings > MCP access).")
    user = await resolve_token_hash(db, token_hash)
    if user is None:
        raise ToolError("MCP token is invalid, expired or revoked, or its account is disabled.")
    return user


_LABELS = {400: "Invalid request", 403: "Permission denied", 404: "Not found", 409: "Conflict", 422: "Invalid input"}


def describe_http_error(exc: HTTPException) -> str:
    detail = exc.detail if isinstance(exc.detail, str) else jsonable_encoder(exc.detail)
    return f"{_LABELS.get(exc.status_code, 'HTTP ' + str(exc.status_code))}: {detail}"


def serialize(value: Any, response_model: Any = None) -> Any:
    if response_model is not None and response_model is not Any:
        try:
            adapter = TypeAdapter(response_model)
            return adapter.dump_python(adapter.validate_python(value, from_attributes=True), mode="json")
        except ValidationError:
            pass
    return jsonable_encoder(value)


def _inject(endpoint: Callable, db, user: User, kwargs: Dict[str, Any]) -> Dict[str, Any]:
    args: Dict[str, Any] = {}
    for name, param in inspect.signature(endpoint).parameters.items():
        if name in kwargs:
            args[name] = kwargs[name]
            continue
        default = param.default
        if isinstance(default, DependsParam):
            dep = default.dependency
            if dep is deps.get_db:
                args[name] = db
            elif dep in (deps.get_current_user, deps.get_current_user_optional):
                args[name] = user
            elif dep is deps.get_current_admin:
                if not user.is_superuser:
                    raise ToolError("Permission denied: administrators only.")
                args[name] = user
            else:  # guarded by tests/test_mcp_registry.py
                raise ToolError(f"Unsupported dependency {dep!r} in {endpoint.__name__}")
        elif isinstance(default, (Param, BodyParam)):
            if default.default is ... or default.default is inspect.Parameter.empty:
                raise ToolError(f"Missing required argument '{name}'")
            args[name] = default.default
        elif default is inspect.Parameter.empty:
            raise ToolError(f"Missing required argument '{name}'")
        else:
            args[name] = default
    return args


async def call(endpoint: Callable, **kwargs: Any) -> Any:
    """Invoke a REST handler as the acting user and return its JSON-ready response."""
    route = routes_by_endpoint().get(endpoint)
    async with AsyncSessionLocal() as db:
        user = await acting_user(db)
        args = _inject(endpoint, db, user, kwargs)
        try:
            result = endpoint(**args)
            if inspect.isawaitable(result):
                result = await result
            data = serialize(result, route.response_model if route else None)
            await db.commit()
        except HTTPException as exc:
            await db.rollback()
            raise ToolError(describe_http_error(exc)) from None
        except ValueError as exc:  # schema validators / domain checks that surface as ValueError
            await db.rollback()
            raise ToolError(f"Invalid input: {exc}") from None
        return data if data is not None else {"ok": True}


async def with_user(fn: Callable) -> Any:
    """Run `await fn(db, user)` for the few tools that have no REST twin."""
    async with AsyncSessionLocal() as db:
        user = await acting_user(db)
        try:
            result = await fn(db, user)
            await db.commit()
            return result
        except HTTPException as exc:
            await db.rollback()
            raise ToolError(describe_http_error(exc)) from None


def build(schema, data: Optional[dict]):
    """Build a request schema from tool input, turning validation errors into a readable tool error."""
    try:
        return schema(**(data or {}))
    except ValidationError as exc:
        problems = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
        raise ToolError(f"Invalid input: {problems}") from None


def fields(**values: Any) -> dict:
    """Keyword arguments that were actually given (None means 'leave unchanged')."""
    return {k: v for k, v in values.items() if v is not None}
