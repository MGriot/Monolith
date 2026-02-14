import asyncio
import os
import re
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.session import ClientSession

async def reset_system():
    # Use localhost for local database access
    db_url = "postgresql+asyncpg://monolith_user:monolith_password@localhost:5432/monolith_db"
    # Backend folder must be in PYTHONPATH
    backend_path = os.path.join(os.getcwd(), "backend")
    env = {**os.environ, "PYTHONPATH": f".;{backend_path}", "DATABASE_URL": db_url}
    
    server_params = StdioServerParameters(
        command="python",
        args=["mcp/main.py"],
        env=env
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # 1. Delete Projects
            print("Fetching projects...")
            projects_res = await session.read_resource("projects://list")
            projects_text = projects_res.contents[0].text
            # - Project Name (ID: uuid, ...)
            project_ids = re.findall(r"ID: ([a-f0-9\-]+)", projects_text)
            
            print(f"Found {len(project_ids)} projects to delete.")
            for pid in project_ids:
                print(f"Deleting project {pid}...")
                try:
                    res = await session.call_tool("delete_project", {"project_id": pid})
                    # Tools return structured data in newer MCP, but we handle string here if possible
                    print(f"Result: {res}")
                except Exception as e:
                    print(f"Error deleting project {pid}: {e}")

            # 2. Delete Users
            print("\nFetching users...")
            users_res = await session.read_resource("users://list")
            users_text = users_res.contents[0].text
            # - email (ID: uuid, ...)
            user_ids = re.findall(r"ID: ([a-f0-9\-]+)", users_text)
            
            print(f"Found {len(user_ids)} users.")
            for uid in user_ids:
                print(f"Deleting user {uid}...")
                try:
                    res = await session.call_tool("delete_user", {"user_id": uid})
                    print(f"Result: {res}")
                except Exception as e:
                    print(f"Error deleting user {uid}: {e}")

            # 3. Recreate Admin and Tester
            print("\nRecreating default users...")
            try:
                admin_res = await session.call_tool("create_user", {
                    "email": "admin@admin.com",
                    "password": "admin123",
                    "full_name": "System Admin",
                    "is_superuser": True
                })
                print(f"Admin: {admin_res}")
            except Exception as e:
                print(f"Error creating admin: {e}")
            
            try:
                tester_res = await session.call_tool("create_user", {
                    "email": "tester@example.com",
                    "password": "tester123",
                    "full_name": "QA Tester",
                    "is_superuser": False
                })
                print(f"Tester: {tester_res}")
            except Exception as e:
                print(f"Error creating tester: {e}")

if __name__ == "__main__":
    asyncio.run(reset_system())
