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
from app.models.task import Task
from app.crud.crud_task import task as crud_task

async def test_cycle_detection():
    print("Testing Cycle Detection...")
    db = AsyncMock()
    
    # Task A
    task_a = Task(id=uuid4(), title="Task A", status=Status.TODO)
    # Task B
    task_b = Task(id=uuid4(), title="Task B", status=Status.TODO)
    
    # Mock is_blocked_by_recursive
    # Case 1: A blocks B. No cycle.
    # To check if A blocks B is okay, we check if A is blocked by B.
    # We'll mock the db.execute for is_blocked_by_recursive
    
    # Success Case: A -> B
    with patch.object(crud_task, 'is_blocked_by_recursive', return_value=False) as mock_recursive:
        # Mock get and super().update
        crud_task.get = AsyncMock(return_value=task_b)
        with patch('app.crud.base.CRUDBase.update', new_callable=AsyncMock) as mock_super_update:
            # Mock the select for blockers
            result_mock = MagicMock()
            db.execute.return_value = result_mock
            result_mock.scalars.return_value.all.return_value = [task_a]
            
            # We need to mock update_project_progress too
            crud_task.update_project_progress = AsyncMock()
            
            from app.schemas.task import TaskUpdate
            update_in = TaskUpdate(blocked_by_ids=[task_a.id])
            
            await crud_task.update(db, db_obj=task_b, obj_in=update_in)
            
            mock_recursive.assert_called_once_with(db, task_a.id, task_b.id, set())
            print("Case 1 Passed: Direct Dependency A -> B (No Cycle)")

    # Failure Case: B -> A, then try A -> B (Cycle)
    with patch.object(crud_task, 'is_blocked_by_recursive', return_value=True) as mock_recursive:
        update_in = TaskUpdate(blocked_by_ids=[task_a.id])
        try:
            await crud_task.update(db, db_obj=task_b, obj_in=update_in)
            print("Case 2 FAILED: Cycle not detected")
        except ValueError as e:
            print(f"Case 2 Passed: Cycle detected: {e}")

async def test_finish_to_start():
    print("Testing Finish-to-Start Logic...")
    db = AsyncMock()
    
    # Blocker Task (TODO)
    blocker = Task(id=uuid4(), title="Blocker", status=Status.TODO)
    # Blocked Task
    blocked = Task(id=uuid4(), title="Blocked", status=Status.TODO)
    blocked.blocking_tasks = [blocker]
    
    # Mock check_for_active_blockers
    crud_task.check_for_active_blockers = AsyncMock(return_value=["Blocker"])
    
    from app.schemas.task import TaskUpdate
    update_in = TaskUpdate(status=Status.DONE)
    
    try:
        await crud_task.update(db, db_obj=blocked, obj_in=update_in)
        print("FAILED: Allowed completing blocked task")
    except ValueError as e:
        print(f"Passed: Blocked completion prevented: {e}")
        
    # Now set blocker to DONE
    crud_task.check_for_active_blockers.return_value = []
    with patch('app.crud.base.CRUDBase.update', new_callable=AsyncMock) as mock_super_update:
        await crud_task.update(db, db_obj=blocked, obj_in=update_in)
        print("Passed: Allowed completing unblocked task")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(test_cycle_detection())
    loop.run_until_complete(test_finish_to_start())
