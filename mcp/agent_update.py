import asyncio
import os
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.session import ClientSession

async def main():
    server_params = StdioServerParameters(
        command="python",
        args=["main.py"],
        env={**os.environ, "PYTHONPATH": "."}
    )
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # Update the project to ensure all fields are valid
            print("--- Updating project ---")
            result = await session.call_tool("update_project", {
                "project_id": "e48ae3e6-f773-4e4e-83b4-145c5062630c",
                "name": "🚀 Monolith Alpha: Core System",
                "topic": "Core System",
                "type": "Alpha",
                "status": "Todo",
                "start_date": "2026-01-26",
                "due_date": "2026-03-02"
            })
            print(result.content[0].text)

if __name__ == "__main__":
    asyncio.run(main())
