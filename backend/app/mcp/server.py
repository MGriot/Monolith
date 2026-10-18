from urllib.parse import urlsplit

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from app.core.config import settings


def _mcp_transport_security() -> TransportSecuritySettings:
    """DNS-rebinding protection stays on; the allowed Host values come from config.

    The default (host of APP_BASE_URL + loopback) is what the bundled proxy forwards. Add more with
    MCP_ALLOWED_HOSTS="mcp.example.com,10.0.0.5" (a trailing :* port wildcard is added automatically).
    """
    hosts = {"localhost", "127.0.0.1"}
    base_host = urlsplit(settings.APP_BASE_URL).hostname
    if base_host:
        hosts.add(base_host)
    hosts.update(h.strip() for h in settings.MCP_ALLOWED_HOSTS.split(",") if h.strip())
    allowed_hosts = sorted(hosts | {f"{h}:*" for h in hosts})
    origins = [f"http://{h}" for h in allowed_hosts] + [f"https://{h}" for h in allowed_hosts]
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True, allowed_hosts=allowed_hosts, allowed_origins=origins
    )


INSTRUCTIONS = """Monolith is a project planner: projects contain a tree of tasks (any depth) with dates, PERT estimates,
dependencies, budget/cost, risk, checklists, custom fields, time tracking, comments, ideas, sketches and files.
Every call acts as the owner of your MCP token and respects their project roles (viewer < editor < admin).
Start with `whoami`, then `list_projects` / `get_project`. Dates are ISO 8601 (YYYY-MM-DD or full timestamps).
Statuses: Backlog, Todo, In Progress, On hold, Review, Done. Priorities: Low, Medium, High, Critical."""

mcp = FastMCP(
    "Monolith Planner",
    instructions=INSTRUCTIONS,
    transport_security=_mcp_transport_security(),
)

# Register tools, resources and prompts (each module decorates functions on `mcp`).
from app.mcp import tools  # noqa: E402,F401
