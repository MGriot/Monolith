from app.core.mcp import mcp
from fastapi import APIRouter

router = APIRouter()

# The MCP server logic is moved to app.core.mcp
# This endpoint remains for potential future HTTP/SSE exposure of MCP tools
