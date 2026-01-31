# Monolith MCP (Model Context Protocol) Guide

This project includes a built-in MCP server that allows AI agents (like Claude Desktop or Gemini) to interact with your project data safely.

## Architecture
The MCP server is **embedded** within the Backend service. It shares the same database context and business logic as the FastAPI application.

## Connection Methods

### 1. SSE (Server-Sent Events) - Recommended for Web Clients
The MCP server is mounted directly into the FastAPI app.
- **Endpoint:** `http://localhost:8080/mcp/sse`
- **Transport:** SSE

To use this in an MCP-capable client, point it to the URL above.

### 2. Stdio - Recommended for Local AI Agents
You can run the MCP server over stdio using `docker exec`. This is useful for tools like Claude Desktop.

**Command:**
```bash
docker exec -i monolith_backend python mcp_server.py
```

#### Example Configuration (Claude Desktop)
Add this to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "monolith": {
      "command": "docker",
      "args": ["exec", "-i", "monolith_backend", "python", "mcp_server.py"]
    }
  }
}
```

## Available Resources
- `projects://list`: Returns a list of all projects with their IDs and progress.
- `tasks://list`: Returns a list of all tasks across all projects.

## Available Tools
- `create_task(project_id, title, description)`: Create a new task.
- `update_task_status(task_id, status)`: Update a task status (Backlog, Todo, In Progress, Review, Done).
- `search_projects(query)`: Search for projects by name.
- `create_user(email, password, full_name, is_superuser)`: Create a new user.

## Implementation Details
The server is built using `FastMCP`.
- **Location:** `backend/app/api/api_v1/endpoints/mcp.py`
- **Entrypoint:** `backend/mcp_server.py`
