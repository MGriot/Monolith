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

from app.api.api_v1.endpoints.mcp import (
    list_projects, create_task, update_task_status, 
    delete_user, update_task, delete_task, 
    assign_task, assign_project_member, create_subtask
)
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.core.enums import Status

async def test_mcp_logic():
    print("Testing MCP Logic (Enhanced)...")
    
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
            assert "10.00%" in res
            print("Passed: list_projects")

    # 2. Test create_task
    with mock_session_ctx():
        with patch('app.crud.crud_task.task.create', new_callable=AsyncMock) as mock_create:
            mock_create.return_value = Task(id=uuid4(), title="New Task")
            res = await create_task(project_id=str(uuid4()), title="New Task", description="Desc")
            assert "Successfully created task" in res
            print("Passed: create_task")

    # 3. Test delete_user
    user_obj = User(id=uuid4(), email="delete@me.com")
    with mock_session_ctx():
        with patch('app.crud.crud_user.get', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = user_obj
            res = await delete_user(user_id=str(user_obj.id))
            assert "Successfully deleted user" in res
            mock_db.delete.assert_called_once()
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

    # 5. Test delete_task
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
            with patch('app.crud.crud_task.task.update', new_callable=AsyncMock) as mock_update:
                res = await assign_task(task_id=str(task_obj.id), user_ids=[str(uuid4())])
                assert "Successfully updated assignees" in res
                print("Passed: assign_task")

    # 7. Test assign_project_member
    proj_obj = Project(id=uuid4(), name="Project X")
    with mock_session_ctx():
        with patch('app.crud.crud_project.project.get', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = proj_obj
            with patch('app.crud.crud_project.project.update', new_callable=AsyncMock) as mock_update:
                res = await assign_project_member(project_id=str(proj_obj.id), user_ids=[str(uuid4())])
                assert "Successfully updated members" in res
                print("Passed: assign_project_member")

    # 8. Test create_subtask (Fix check)
    with mock_session_ctx():
        with patch('app.crud.crud_task.task.get', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = Task(id=uuid4(), project_id=uuid4())
            with patch('app.crud.crud_task.task.create', new_callable=AsyncMock) as mock_create:
                mock_create.return_value = Task(id=uuid4(), title="Subtask")
                res = await create_subtask(task_id=str(uuid4()), title="Subtask")
                assert "Successfully created subtask" in res
                print("Passed: create_subtask (fixed)")

if __name__ == "__main__":
    asyncio.run(test_mcp_logic())
