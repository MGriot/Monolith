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
            
            # Get all tasks to filter by project
            print("--- Listing all tasks ---")
            result = await session.read_resource("tasks://list")
            print(result.contents[0].text)

if __name__ == "__main__":
    asyncio.run(main())
