from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
    from app.db.session import engine, Base
    import app.models  # Ensure all models are loaded
    from app.db.init_db import seed_users
    from app.core.scheduler import start_scheduler

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    await seed_users()
    # Scheduler disabled as email service was removed
    # from app.core.scheduler import start_scheduler
    # start_scheduler()

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": "0.1.0"}

@app.get("/")
async def root():
    return {"message": "Welcome to the Monolith Project Planner API"}
