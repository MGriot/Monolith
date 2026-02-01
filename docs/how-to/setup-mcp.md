# How to: Connect an AI Agent via MCP

Monolith provides a standalone **Model Context Protocol (MCP)** server that allows AI agents to interact directly with your project data.

## Connection Methods

### 1. Stdio (Local/Docker)
If you are using an agent that supports Stdio (like Claude Desktop), add the following to your configuration:

```json
{
  "mcpServers": {
    "monolith": {
      "command": "docker",
      "args": ["exec", "-i", "monolith_mcp", "python", "main.py"],
      "env": {
        "PYTHONPATH": "/app"
      }
    }
  }
}
```

### 2. SSE (Web/Network)
The MCP server is also available via Server-Sent Events (SSE) at:
`http://localhost:8080/mcp/sse`

## Example Operations
Once connected, you can ask your agent:
- "Create a new project for a software release with 5 tasks."
- "Show me all projects that are currently behind schedule."
- "Mark the subtask 'Write tests' as Done in the 'Monolith' task."

## Troubleshooting
- **Connection Refused:** Ensure the `monolith_mcp` container is running (`docker ps`).
- **Path Errors:** The agent needs to execute within the context of the `/app` directory inside the container.
