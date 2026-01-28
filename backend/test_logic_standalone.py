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

from app.core.enums import Status
from app.models.task import Task, Subtask
from app.models.project import Project

# Mock the database dependencies to avoid actual DB connection
# We mock the classes or methods in the imported modules

# Import the objects we want to test
from app.crud.crud_task import subtask as crud_subtask
from app.crud.crud_task import task as crud_task

async def test_subtask_propagation():
    print("Testing Subtask -> Task Propagation...")
    
    db = AsyncMock()
    task_id = uuid4()
    
    # Case 1: All DONE
    s1 = Subtask(id=uuid4(), task_id=task_id, status=Status.DONE)
    s2 = Subtask(id=uuid4(), task_id=task_id, status=Status.DONE)
    
    # Mock internal calls
    # We need to mock the methods on the INSTANCES imported from crud_task
    crud_subtask.get_multi_by_task = AsyncMock(return_value=[s1, s2])
    
    parent_task = Task(id=task_id, status=Status.TODO, project_id=uuid4())
    crud_task.get = AsyncMock(return_value=parent_task)
    crud_task.update = AsyncMock()
    
    await crud_subtask.update_parent_task_status(db, task_id)
    
    crud_task.update.assert_called_once()
    args, kwargs = crud_task.update.call_args
    assert kwargs['obj_in']['status'] == Status.DONE
    print("Case 1 Passed: All DONE -> DONE")

    # Case 2: Mixed
    s2.status = Status.TODO
    crud_subtask.get_multi_by_task.return_value = [s1, s2]
    crud_task.update.reset_mock()
    parent_task.status = Status.DONE
    
    await crud_subtask.update_parent_task_status(db, task_id)
    
    crud_task.update.assert_called_once()
    args, kwargs = crud_task.update.call_args
    assert kwargs['obj_in']['status'] == Status.IN_PROGRESS
    print("Case 2 Passed: Mixed -> IN_PROGRESS")

    # Case 3: Empty (Edge case)
    # If no subtasks, logic might do nothing or specific logic.
    # Assuming it returns if empty.
    crud_subtask.get_multi_by_task.return_value = []
    crud_task.update.reset_mock()
    
    await crud_subtask.update_parent_task_status(db, task_id)
    crud_task.update.assert_not_called()
    print("Case 3 Passed: No Subtasks -> No Change")


async def test_project_propagation():
    print("Testing Task -> Project Propagation...")
    db = AsyncMock()
    project_id = uuid4()
    
    # Case 1: 1 DONE, 1 TODO
    t1 = Task(id=uuid4(), project_id=project_id, status=Status.DONE) # 100
    t2 = Task(id=uuid4(), project_id=project_id, status=Status.TODO) # 0
    
    crud_task.get_multi_by_project = AsyncMock(return_value=[t1, t2])
    
    parent_project = Project(id=project_id, progress_percent=0.0)
    
    # We need to mock app.crud.crud_project.project
    # Since we can't easily mock the import inside the function, we'll patch it where it's used.
    # But it's imported INSIDE the method in my plan.
    # So we need to patch `app.crud.crud_task.project_crud` if I alias it, or `app.crud.crud_project.project`.
    
    # Let's assume the implementation imports: from app.crud.crud_project import project as project_crud
    # Patching sys.modules is one way, or using patch.
    
    with patch('app.crud.crud_project.project') as mock_project_crud:
        mock_project_crud.get = AsyncMock(return_value=parent_project)
        mock_project_crud.update = AsyncMock()
        
        await crud_task.update_project_progress(db, project_id)
        
        mock_project_crud.update.assert_called_once()
        args, kwargs = mock_project_crud.update.call_args
        assert kwargs['obj_in']['progress_percent'] == 50.0
        print("Case 1 Passed: 50% Progress")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(test_subtask_propagation())
    loop.run_until_complete(test_project_propagation())
