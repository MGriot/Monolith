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
from app.models.user import User
from app.crud.crud_task import task as crud_task

async def test_notification_triggers():
    print("Testing Notification Triggers...")
    db = AsyncMock()
    user_id = uuid4()
    user = User(id=user_id, email="test@example.com")
    
    # 1. Test Assignment Notification
    task_id = uuid4()
    task_obj = Task(id=task_id, title="Test Task", assignees=[])
    
    with patch('app.crud.crud_notification.notification.create', new_callable=AsyncMock) as mock_notify_create:
        # Mock user fetch
        res_mock = MagicMock()
        db.execute.return_value = res_mock
        res_mock.scalars.return_value.all.return_value = [user]
        
        # Mock super().update
        with patch('app.crud.base.CRUDBase.update', new_callable=AsyncMock) as mock_super_update:
            crud_task.update_project_progress = AsyncMock()
            
            from app.schemas.task import TaskUpdate
            update_in = TaskUpdate(assignee_ids=[user_id])
            
            await crud_task.update(db, db_obj=task_obj, obj_in=update_in)
            
            # Verify notification was created
            mock_notify_create.assert_called_once()
            args, kwargs = mock_notify_create.call_args
            assert kwargs['obj_in'].user_id == user_id
            assert "assigned" in kwargs['obj_in'].message
            print("Passed: Assignment Trigger")

    # 2. Test Unblocked Notification
    blocked_task = Task(id=uuid4(), title="Blocked Task", assignees=[user])
    task_obj.blocked_tasks = [blocked_task]
    task_obj.status = Status.TODO
    
    with patch('app.crud.crud_notification.notification.create', new_callable=AsyncMock) as mock_notify_create:
        # Mock check_for_active_blockers to return empty (unblocked)
        crud_task.check_for_active_blockers = AsyncMock(return_value=[])
        
        # Mock refreshes and assignee loads
        res_mock = MagicMock()
        db.execute.return_value = res_mock
        res_mock.scalars.return_value.first.return_value = task_obj # task_refreshed
        
        # Second execute for bt_with_assignees
        res_mock.scalars.return_value.first.side_effect = [task_obj, blocked_task]
        
        with patch('app.crud.base.CRUDBase.update', new_callable=AsyncMock) as mock_super_update:
            update_in = TaskUpdate(status=Status.DONE)
            
            task_obj.status = Status.TODO
            
            async def mock_update_side_effect(db, db_obj, obj_in):
                db_obj.status = Status.DONE
                return db_obj
            
            mock_super_update.side_effect = mock_update_side_effect
            
            await crud_task.update(db, db_obj=task_obj, obj_in=update_in)
            
            # Verify notification was created for user
            mock_notify_create.assert_called_once()
            args, kwargs = mock_notify_create.call_args
            assert kwargs['obj_in'].user_id == user_id
            assert "unblocked" in kwargs['obj_in'].message
            print("Passed: Unblocked Trigger")

if __name__ == "__main__":
    asyncio.run(test_notification_triggers())
