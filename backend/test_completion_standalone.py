import sys
import os
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime

# Set dummy env vars
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

# Add backend to sys.path
sys.path.append(os.getcwd())

from app.core.enums import Status
from app.models.task import Task
from app.models.project import Project
from app.models.user import User
from app.schemas.task import TaskUpdate
from app.api.api_v1.endpoints.tasks import update_task

async def test_completion_logic():
    print("Testing Task Completion Logic...")
    
    # Mocks
    db = AsyncMock()
    user_id = uuid4()
    project_id = uuid4()
    task_id = uuid4()
    
    current_user = User(id=user_id, is_superuser=False)
    project = Project(id=project_id, owner_id=user_id, members=[])
    
    # Mock CRUD
    with patch("app.api.api_v1.endpoints.tasks.crud_task") as mock_crud_task, \
         patch("app.api.api_v1.endpoints.tasks.crud_project") as mock_crud_project:
        
        # Setup common returns
        mock_crud_project.project.get = AsyncMock(return_value=project)
        
        # Case 1: Status -> DONE (Auto-set completed_at)
        print("\nCase 1: Status -> DONE (Auto-set)")
        task_obj = Task(id=task_id, project_id=project_id, status=Status.TODO, completed_at=None)
        mock_crud_task.task.get = AsyncMock(return_value=task_obj)
        mock_crud_task.task.update = AsyncMock(return_value=task_obj) # return value doesn't matter much for logic check
        
        task_in = TaskUpdate(status=Status.DONE)
        
        await update_task(
            db=db,
            task_id=task_id,
            task_in=task_in,
            current_user=current_user
        )
        
        # Check if task_in.completed_at was set
        assert task_in.completed_at is not None
        assert isinstance(task_in.completed_at, datetime)
        print("PASS: completed_at was set")

        # Case 2: Status -> TODO (Clear completed_at)
        print("\nCase 2: Status -> TODO (Clear)")
        task_obj_done = Task(id=task_id, project_id=project_id, status=Status.DONE, completed_at=datetime.utcnow())
        mock_crud_task.task.get = AsyncMock(return_value=task_obj_done)
        
        task_in_todo = TaskUpdate(status=Status.TODO)
        
        await update_task(
            db=db,
            task_id=task_id,
            task_in=task_in_todo,
            current_user=current_user
        )
        
        assert task_in_todo.completed_at is None
        # We need to ensure it was explicitly set to None in the object, not just missing
        # In the logic we did `task_in.completed_at = None`
        assert "completed_at" in task_in_todo.model_fields_set
        print("PASS: completed_at was cleared")

        # Case 3: Status -> DONE with explicit date (Respect explicit)
        print("\nCase 3: Status -> DONE with Explicit Date")
        task_obj = Task(id=task_id, project_id=project_id, status=Status.TODO, completed_at=None)
        mock_crud_task.task.get = AsyncMock(return_value=task_obj)
        
        explicit_date = datetime(2025, 1, 1)
        task_in_explicit = TaskUpdate(status=Status.DONE, completed_at=explicit_date)
        
        await update_task(
            db=db,
            task_id=task_id,
            task_in=task_in_explicit,
            current_user=current_user
        )
        
        assert task_in_explicit.completed_at == explicit_date
        print("PASS: explicit completed_at was respected")
        
if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(test_completion_logic())
