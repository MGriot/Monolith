import sys
import os

# Set dummy env vars for config to avoid validation errors
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timedelta

# Add backend to sys.path
sys.path.append(os.getcwd())

from app.api.api_v1.endpoints.mcp import (
    list_projects, create_task, 
    delete_user, update_task, delete_task, 
    assign_task, assign_project_member, create_subtask,
    get_portfolio_health, get_team_workload, delete_project
)
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.core.enums import Status

async def test_mcp_logic():
    print("Testing MCP Logic (Final Integration)...")
    
    # Mock DB Session
    mock_db = AsyncMock()
    
    # Helper to mock AsyncSessionLocal
    def mock_session_ctx():
        mock_session_local = MagicMock()
        mock_session_local.return_value.__aenter__.return_value = mock_db
        return patch('app.api.api_v1.endpoints.mcp.AsyncSessionLocal', mock_session_local)

    # 1. Test list_projects
    project_a = Project(id=uuid4(), name="Project Alpha", progress_percent=10.0, status=Status.TODO)
    with mock_session_ctx():
        with patch('app.crud.crud_project.project.get_multi', new_callable=AsyncMock) as mock_get_multi:
            mock_get_multi.return_value = [project_a]
            res = await list_projects()
            assert "Project Alpha" in res
            print("Passed: list_projects")

    # 2. Test create_task
    with mock_session_ctx():
        with patch('app.crud.crud_task.task.create', new_callable=AsyncMock) as mock_create:
            mock_task = Task(id=uuid4(), title="New Task")
            # Manually add wbs_code for the assertion since it's expected in the output string
            mock_task.wbs_code = "1"
            mock_create.return_value = mock_task
            res = await create_task(project_id=str(uuid4()), title="New Task", description="Desc")
            assert "Successfully created task" in res
            print("Passed: create_task")

    # 3. Test delete_user
    user_obj = User(id=uuid4(), email="delete@me.com")
    with mock_session_ctx():
        with patch('app.crud.crud_user.get', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = user_obj
            with patch('app.crud.crud_user.remove', new_callable=AsyncMock) as mock_remove:
                res = await delete_user(user_id=str(user_obj.id))
                assert "Successfully deleted user" in res
                print("Passed: delete_user")

    # 4. Test update_task
    task_obj = Task(id=uuid4(), title="Original Title", status=Status.TODO)
    with mock_session_ctx():
        with patch('app.crud.crud_task.task.get', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = task_obj
            with patch('app.crud.crud_task.task.update', new_callable=AsyncMock) as mock_update:
                res = await update_task(task_id=str(task_obj.id), title="New Title", status="Done")
                assert "Successfully updated task" in res
                print("Passed: update_task")

    # 5. Test delete_task (generic task removal)
    with mock_session_ctx():
        with patch('app.crud.crud_task.task.get', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = task_obj
            with patch('app.crud.crud_task.task.remove', new_callable=AsyncMock) as mock_remove:
                res = await delete_task(task_id=str(task_obj.id))
                assert "Successfully deleted task" in res
                print("Passed: delete_task")

    # 6. Test assign_task
    with mock_session_ctx():
        with patch('app.crud.crud_task.task.get', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = task_obj
            with patch('app.crud.crud_task.task.update_assignees', new_callable=AsyncMock) as mock_update:
                res = await assign_task(task_id=str(task_obj.id), user_ids=[str(uuid4())])
                assert "Successfully updated assignees" in res
                print("Passed: assign_task")

    # 7. Test get_portfolio_health
    with mock_session_ctx():
        with patch('app.crud.crud_project.project.get_multi', new_callable=AsyncMock) as mock_get_multi:
            mock_get_multi.return_value = [Project(id=uuid4(), name="Test Project", progress_percent=50.0, status="In Progress", is_archived=False)]
            # Mock db.execute for tasks
            mock_res = MagicMock()
            mock_res.scalars.return_value.all.return_value = []
            mock_db.execute.return_value = mock_res
            
            res = await get_portfolio_health()
            assert "PORTFOLIO HEALTH REPORT" in res
            assert "Test Project" in res
            print("Passed: get_portfolio_health")

    # 8. Test get_team_workload
    with mock_session_ctx():
        # Mock Users
        mock_users_res = MagicMock()
        mock_users_res.scalars.return_value.all.return_value = [User(id=uuid4(), full_name="Test User", is_active=True)]
        # Mock Tasks
        mock_tasks_res = MagicMock()
        mock_tasks_res.scalars.return_value.all.return_value = []
        
        mock_db.execute.side_effect = [mock_users_res, mock_tasks_res]
        
        res = await get_team_workload()
        assert "TEAM WORKLOAD REPORT" in res
        assert "Test User" in res
        print("Passed: get_team_workload")

if __name__ == "__main__":
    asyncio.run(test_mcp_logic())
