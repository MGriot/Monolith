from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
import os
from app.api.api_v1.api import api_router
from app.mcp.server import mcp
from app.core.mcp_tokens import McpTokenGate
from app.core.config import settings
from app.core.uploads import SafeStaticFiles

logger = logging.getLogger(__name__)


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
if settings.MCP_ENABLED:
    # Every request needs a personal MCP token (Settings -> MCP access); tools act as that token's owner.
    app.mount("/mcp", McpTokenGate(mcp.sse_app()))
else:
    logger.warning("MCP_ENABLED=false: /mcp is disabled.")
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
    from app.core.webhooks import run_webhook_worker
    app.state.background_tasks.append(asyncio.create_task(run_webhook_worker(), name="webhook-outbox"))
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
