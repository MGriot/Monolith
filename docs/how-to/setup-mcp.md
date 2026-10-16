# How to: Connect an AI Agent via MCP

Monolith provides a standalone **Model Context Protocol (MCP)** server that allows AI agents to interact directly with your project data.

## Connection Methods

### 1. Stdio (local container)
For agents that speak stdio (like Claude Desktop), run the server inside the backend container:

```json
{
  "mcpServers": {
    "monolith": {
      "command": "podman",
      "args": ["exec", "-i", "monolith_backend", "python", "mcp_server.py"]
    }
  }
}
```
(`docker` works the same way. The container name is `monolith_backend`; there is no separate `monolith_mcp` container any more.)

### 2. SSE (Web/Network)
Set `MCP_API_KEY` in `.env` (e.g. `openssl rand -hex 32`) and restart. The endpoint is then available at
`http://localhost:8080/mcp/sse` and requires the header `Authorization: Bearer <MCP_API_KEY>`. Without the key the endpoint is not mounted at all.
If you reach it through another host name, add it to `MCP_ALLOWED_HOSTS`.

## Example Operations
Once connected, you can ask your agent:
- "Create a new project for a software release with 5 tasks."
- "Show me all projects that are currently behind schedule."
- "Mark the subtask 'Write tests' as Done in the 'Monolith' task."

## Troubleshooting
- **Connection Refused / 404:** Ensure `monolith_backend` is running (`podman ps`) and that `MCP_API_KEY` is set.
- **401:** Missing or wrong Bearer key.
- **421 Misdirected Request:** The `Host` header is not allowed; add it to `MCP_ALLOWED_HOSTS`.
- **Path Errors:** The agent needs to execute within the context of the `/app` directory inside the container.
