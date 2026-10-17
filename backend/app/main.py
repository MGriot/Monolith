from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import hmac
import logging
import os
from app.api.api_v1.api import api_router
from app.api.api_v1.endpoints.mcp import mcp
from app.core.config import settings
from app.core.uploads import SafeStaticFiles

logger = logging.getLogger(__name__)


class BearerKeyASGI:
    """ASGI wrapper that requires `Authorization: Bearer <MCP_API_KEY>` (constant-time compare)."""

    def __init__(self, app, key: str):
        self.app = app
        self.key = key.encode()

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            headers = dict(scope.get("headers") or [])
            supplied = headers.get(b"authorization", b"")
            token = supplied[7:] if supplied[:7].lower() == b"bearer " else b""
            if not hmac.compare_digest(token, self.key):
                if scope["type"] == "http":
                    await send({"type": "http.response.start", "status": 401,
                                "headers": [(b"content-type", b"application/json"),
                                            (b"www-authenticate", b"Bearer")]})
                    await send({"type": "http.response.body", "body": b'{"detail":"Unauthorized"}'})
                else:
                    await send({"type": "websocket.close", "code": 1008})
                return
        await self.app(scope, receive, send)

# Docs live under /api so the edge proxy (which only forwards /api, /uploads and /mcp to the backend) serves them.
app = FastAPI(
    title="Monolith Project Planner API",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # auth is a bearer header, never cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
if settings.MCP_API_KEY:
    # `sse_app` is a factory method; the old code mounted the bound method itself.
    app.mount("/mcp", BearerKeyASGI(mcp.sse_app(), settings.MCP_API_KEY))
else:
    logger.warning("MCP_API_KEY is not set: /mcp is disabled.")
app.mount("/uploads", SafeStaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

@app.on_event("startup")
async def on_startup():
    # NOTE: never `import app.models` here: it would bind the local name `app` and shadow the FastAPI instance.
    from app import models  # noqa: F401  (ensure all models are loaded)
    from app.db.init_db import seed_users

    if settings.AUTO_MIGRATE:
        from app.db.migrate import upgrade_database
        await upgrade_database()
    else:
        logger.warning("AUTO_MIGRATE=false: schema is NOT managed at start-up (run `alembic upgrade head`).")

    await seed_users()

    # Background workers: e-mail outbox delivery and scheduled jobs (digest, deadline reminders).
    # Both are safe with several processes: the outbox uses SKIP LOCKED, the scheduler claims slots atomically.
    app.state.background_tasks = []
    if settings.EMAIL_ENABLED:
        from app.core.mailer import run_outbox_worker
        app.state.background_tasks.append(asyncio.create_task(run_outbox_worker(), name="email-outbox"))
        if settings.SCHEDULER_ENABLED:
            from app.core.scheduler import run_scheduler
            app.state.background_tasks.append(asyncio.create_task(run_scheduler(), name="scheduler"))


@app.on_event("shutdown")
async def on_shutdown():
    tasks = getattr(app.state, "background_tasks", [])
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": "0.1.0"}

@app.get("/")
async def root():
    return {"message": "Welcome to the Monolith Project Planner API"}
