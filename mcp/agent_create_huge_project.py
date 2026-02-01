import asyncio
import os
import json
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.session import ClientSession
from datetime import datetime, timedelta

async def create_huge_project():
    server_params = StdioServerParameters(
        command="python",
        args=["main.py"],
        env={**os.environ, "PYTHONPATH": "."}
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # 1. Cleanup: Search and Delete existing Omega project if any
            print("Searching for existing Omega projects...")
            search_res = await session.call_tool("search_projects", {"query": "Monolith Omega"})
            if "ID:" in search_res:
                # Extract IDs and delete (simple parsing)
                for line in search_res.split("\n"):
                    if "ID:" in line:
                        p_id = line.split("ID: ")[1].split(",")[0]
                        print(f"Deleting old project: {p_id}")
                        await session.call_tool("delete_project", {"project_id": p_id})

            # 2. Get Users for assignment context
            users_res = await session.read_resource("users://list")
            users_text = users_res.contents[0].text
            print(f"System Users:\n{users_text}")
            
            # Find Test User ID
            test_user_id = None
            for line in users_text.split("\n"):
                if "tester@example.com" in line:
                    test_user_id = line.split("ID: ")[1].split(",")[0]
                    break
            
            if test_user_id:
                print(f"Targeting Test User (ID: {test_user_id})")

            # 3. Create the Huge Project
            print("\nCreating 🌌 Monolith Omega: The Final Frontier...")
            proj_desc = """# 🌌 Monolith Omega
The ultimate stress-test project for the Monolith ecosystem. 
This project simulates a multi-phase planetary colonization program, requiring:
- Precise timing (Gantt)
- Strict dependency management
- High-volume task tracking
- Multi-disciplinary topic categorization
"""
            create_proj_res = await session.call_tool("create_project", {
                "name": "🌌 Monolith Omega: The Final Frontier",
                "topic": "Interstellar",
                "type": "Strategic",
                "description": proj_desc,
                "start_date": (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d"),
                "due_date": (datetime.now() + timedelta(days=60)).strftime("%Y-%m-%d"),
                "owner_id": test_user_id
            })
            
            project_id = None
            if hasattr(create_proj_res, 'content') and create_proj_res.content:
                text = create_proj_res.content[0].text
                if "ID: " in text:
                    project_id = text.split("ID: ")[1].strip()
            
            # Fallback for structuredContent or other formats
            if not project_id and hasattr(create_proj_res, 'structuredContent'):
                sc = create_proj_res.structuredContent
                if sc and 'result' in sc and "ID: " in sc['result']:
                    project_id = sc['result'].split("ID: ")[1].strip()

            if not project_id:
                print(f"Failed to extract project_id from: {create_proj_res}")
                return
            
            print(f"Project Created: {project_id}")

            # 4. Create Tasks and Subtasks
            def get_id(res):
                if hasattr(res, 'content') and res.content:
                    text = res.content[0].text
                    if "ID: " in text: return text.split("ID: ")[1].strip()
                if hasattr(res, 'structuredContent'):
                    sc = res.structuredContent
                    if sc and 'result' in sc and "ID: " in sc['result']:
                        return sc['result'].split("ID: ")[1].strip()
                if isinstance(res, str) and "ID: " in res:
                    return res.split("ID: ")[1].strip()
                return None

            # --- Task A: Infrastructure (Done) ---
            print("Adding Task: Orbital Infrastructure...")
            t_a = await session.call_tool("create_task", {
                "project_id": project_id,
                "title": "🛰️ Phase 1: Orbital Infrastructure",
                "description": "Establish communication satellites and refueling stations.",
                "status": "Done",
                "start_date": (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d"),
                "due_date": (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
            })
            ta_id = get_id(t_a)
            if ta_id:
                await session.call_tool("create_subtask", {
                    "task_id": ta_id, 
                    "title": "Launch Satellites", 
                    "status": "Done",
                    "start_date": (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d"),
                    "due_date": (datetime.now() - timedelta(days=8)).strftime("%Y-%m-%d")
                })
                await session.call_tool("create_subtask", {
                    "task_id": ta_id, 
                    "title": "Deploy Fuel Pods", 
                    "status": "Done",
                    "start_date": (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d"),
                    "due_date": (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
                })

            # --- Task B: Landing (In Progress) ---
            print("Adding Task: Landing Operations...")
            t_b = await session.call_tool("create_task", {
                "project_id": project_id,
                "title": "🚀 Phase 2: Landing Operations",
                "description": "Descent and base camp establishment.",
                "status": "In Progress",
                "start_date": (datetime.now() - timedelta(days=4)).strftime("%Y-%m-%d"),
                "due_date": (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
            })
            tb_id = get_id(t_b)
            if tb_id:
                await session.call_tool("create_subtask", {
                    "task_id": tb_id, 
                    "title": "Atmospheric Re-entry", 
                    "status": "Done",
                    "start_date": (datetime.now() - timedelta(days=4)).strftime("%Y-%m-%d"),
                    "due_date": (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d")
                })
                await session.call_tool("create_subtask", {
                    "task_id": tb_id, 
                    "title": "HAB Module Assembly", 
                    "status": "In Progress",
                    "start_date": (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d"),
                    "due_date": (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
                })
                await session.call_tool("create_subtask", {
                    "task_id": tb_id, 
                    "title": "Power Grid Sync", 
                    "status": "Todo",
                    "start_date": (datetime.now() + timedelta(days=6)).strftime("%Y-%m-%d"),
                    "due_date": (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
                })

            # --- Task C: Resource Extraction (Todo) ---
            print("Adding Task: Resource Extraction...")
            t_c = await session.call_tool("create_task", {
                "project_id": project_id,
                "title": "⛏️ Phase 3: Resource Extraction",
                "description": "Mining and processing of local materials.",
                "status": "Todo",
                "start_date": (datetime.now() + timedelta(days=15)).strftime("%Y-%m-%d"),
                "due_date": (datetime.now() + timedelta(days=40)).strftime("%Y-%m-%d")
            })
            tc_id = get_id(t_c)
            if tc_id:
                await session.call_tool("create_subtask", {
                    "task_id": tc_id, 
                    "title": "Iron Ore Survey", 
                    "status": "Todo",
                    "start_date": (datetime.now() + timedelta(days=15)).strftime("%Y-%m-%d"),
                    "due_date": (datetime.now() + timedelta(days=20)).strftime("%Y-%m-%d")
                })
                await session.call_tool("create_subtask", {
                    "task_id": tc_id, 
                    "title": "Automated Excavation", 
                    "status": "Todo",
                    "start_date": (datetime.now() + timedelta(days=25)).strftime("%Y-%m-%d"),
                    "due_date": (datetime.now() + timedelta(days=40)).strftime("%Y-%m-%d")
                })

            # --- Task D: Milestone (One day) ---
            print("Adding Milestone...")
            m_date = (datetime.now() + timedelta(days=45)).strftime("%Y-%m-%d")
            await session.call_tool("create_task", {
                "project_id": project_id,
                "title": "🚩 Milestone: Self-Sufficiency",
                "description": "First harvest and oxygen recycling success.",
                "status": "Todo",
                "start_date": m_date,
                "due_date": m_date
            })

            # 5. Summary
            print("\n--- Project Omega Created Successfully ---")
            print(f"Link: http://localhost:8080/projects/{project_id}")

if __name__ == "__main__":
    asyncio.run(create_huge_project())
