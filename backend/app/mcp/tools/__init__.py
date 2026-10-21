"""MCP tool modules, one per domain. Importing this package registers everything on `app.mcp.server.mcp`."""
from . import (  # noqa: F401
    users,
    projects,
    tasks,
    time,
    project_settings,
    collaboration,
    files,
    organization,
    insights,
    resources,
)
