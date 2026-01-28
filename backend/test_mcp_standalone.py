import sys
import os

# Set dummy env vars for config to avoid validation errors
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

# Add backend to sys.path
sys.path.append(os.getcwd())

from app.api.api_v1.endpoints.mcp import list_projects, create_task, update_task_status
from app.models.project import Project
from app.models.task import Task
from app.core.enums import Status

async def test_mcp_logic():
    print("Testing MCP Logic...")
    
    # Mock DB Session
    mock_db = AsyncMock()
    
    # 1. Test list_projects
    project_a = Project(id=uuid4(), name="Project Alpha", progress_percent=10.0, status=Status.TODO)
    
    with patch('app.api.api_v1.endpoints.mcp.AsyncSessionLocal') as mock_session_local:
        mock_session_local.return_value.__aenter__.return_value = mock_db
        
        with patch('app.crud.crud_project.project.get_multi', new_callable=AsyncMock) as mock_get_multi:
            mock_get_multi.return_value = [project_a]
            
            res = await list_projects()
            assert "Project Alpha" in res
            assert "10.0%" in res
            print("Passed: list_projects")

    # 2. Test create_task
    with patch('app.api.api_v1.endpoints.mcp.AsyncSessionLocal') as mock_session_local:
        mock_session_local.return_value.__aenter__.return_value = mock_db
        
        with patch('app.crud.crud_task.task.create', new_callable=AsyncMock) as mock_create:
            mock_create.return_value = Task(id=uuid4(), title="New Task")
            
            res = await create_task(project_id=str(uuid4()), title="New Task", description="Desc")
            assert "Successfully created task" in res
            print("Passed: create_task")

    # 3. Test update_task_status
    with patch('app.api.api_v1.endpoints.mcp.AsyncSessionLocal') as mock_session_local:
        mock_session_local.return_value.__aenter__.return_value = mock_db
        
        task_obj = Task(id=uuid4(), title="Test Task", status=Status.TODO)
        with patch('app.crud.crud_task.task.get', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = task_obj
            with patch('app.crud.crud_task.task.update', new_callable=AsyncMock) as mock_update:
                res = await update_task_status(task_id=str(task_obj.id), status="Done")
                assert "status updated to Done" in res
                print("Passed: update_task_status")

if __name__ == "__main__":
    asyncio.run(test_mcp_logic())
