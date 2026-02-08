import sys
import os
import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

# Setup path and dummy env
sys.path.append(os.getcwd())
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

from app.core.enums import Status
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate
from app.crud.crud_task import task as crud_task

async def test_task_completion_logic():
    print("Testing Task Completion Logic...")
    
    db = AsyncMock()
    
    # Mock specific return values for queries
    execute_result = MagicMock()
    execute_result.scalar.return_value = 0 # for sort_index
    execute_result.scalars.return_value.all.return_value = [] # for assignees
    execute_result.scalars.return_value.first.return_value = None # for blocked_by
    db.execute.return_value = execute_result
    
    # Mock helpers
    crud_task.check_for_active_blockers = AsyncMock(return_value=[])
    crud_task.is_blocked_by_recursive = AsyncMock(return_value=False)
    crud_task.sync_project_from_tasks = AsyncMock()
    crud_task.notify_assignees = AsyncMock()
    crud_task.update_parent_status_recursive = AsyncMock()

    # Shared storage for current task being tested
    current_task = None

    # Mock db.add (sync method in SQLAlchemy AsyncSession)
    db.add = MagicMock()
    def mock_add(obj):
        nonlocal current_task
        current_task = obj
    db.add.side_effect = mock_add
    
    # Mock crud_task.get to return current_task
    async def mock_get(db, id):
        nonlocal current_task
        # If we have a current_task, return it, assuming ID matches or we only care about 1 object
        if current_task:
            return current_task
        return None
    crud_task.get = AsyncMock(side_effect=mock_get)

    # 1. Test Create with Status=DONE
    print("\n[1] Testing Create with DONE status...")
    project_id = uuid4()
    
    create_in = TaskCreate(
        title="Completed Task",
        project_id=project_id,
        status=Status.DONE
    )
    
    try:
        created_task = await crud_task.create(db, obj_in=create_in)
        # Check if completed_at was set
        if created_task.status == Status.DONE and created_task.completed_at is not None:
            print(f"PASS: Create with DONE sets completed_at: {created_task.completed_at}")
        else:
            print(f"FAIL: Create with DONE did NOT set completed_at. Got: {created_task.completed_at}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ERROR in Create: {e}")

    # 2. Test Update TODO -> DONE
    print("\n[2] Testing Update TODO -> DONE...")
    task_id = uuid4()
    current_task = Task(
        id=task_id, 
        title="Task 1", 
        project_id=project_id,
        status=Status.TODO,
        completed_at=None,
        blocked_by_ids=[]
    )
    # Ensure relationships are initialized as empty lists/None to avoid attribute errors
    current_task.assignees = []
    current_task.topics = []
    current_task.types = []
    current_task.parent_id = None
    
    update_in = TaskUpdate(status=Status.DONE)
    
    # Mock CRUDBase.update to apply changes
    with patch('app.crud.base.CRUDBase.update', new_callable=AsyncMock) as mock_super_update:
        async def side_effect_update(db, db_obj, obj_in):
            # Simulate DB update by applying obj_in to db_obj
            data = obj_in if isinstance(obj_in, dict) else obj_in.dict(exclude_unset=True)
            for k, v in data.items():
                if hasattr(db_obj, k):
                    setattr(db_obj, k, v)
            return db_obj
        mock_super_update.side_effect = side_effect_update
        
        try:
            updated_task = await crud_task.update(db, db_obj=current_task, obj_in=update_in)
            
            if updated_task.status == Status.DONE and updated_task.completed_at is not None:
                 print(f"PASS: Update TODO -> DONE sets completed_at: {updated_task.completed_at}")
            else:
                 print(f"FAIL: Update TODO -> DONE did NOT set completed_at. Got: {updated_task.completed_at}")
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"ERROR in Update 1: {e}")

    # 3. Test Update DONE -> TODO
    print("\n[3] Testing Update DONE -> TODO...")
    current_task = Task(
        id=task_id, 
        title="Task 1", 
        project_id=project_id,
        status=Status.DONE,
        completed_at=datetime.utcnow(),
        blocked_by_ids=[]
    )
    current_task.assignees = []
    current_task.topics = []
    current_task.types = []
    current_task.parent_id = None
    
    update_in_todo = TaskUpdate(status=Status.TODO)
    
    with patch('app.crud.base.CRUDBase.update', new_callable=AsyncMock) as mock_super_update:
        mock_super_update.side_effect = side_effect_update
        
        try:
            updated_task_todo = await crud_task.update(db, db_obj=current_task, obj_in=update_in_todo)
            
            if updated_task_todo.status == Status.TODO and updated_task_todo.completed_at is None:
                 print("PASS: Update DONE -> TODO clears completed_at")
            else:
                 print(f"FAIL: Update DONE -> TODO did NOT clear completed_at. Got: {updated_task_todo.completed_at}")
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"ERROR in Update 2: {e}")

    # 4. Test Manual Override
    print("\n[4] Testing Manual completed_at override...")
    manual_date = datetime(2025, 12, 25)
    update_in_manual = TaskUpdate(status=Status.DONE, completed_at=manual_date)
    
    with patch('app.crud.base.CRUDBase.update', new_callable=AsyncMock) as mock_super_update:
        mock_super_update.side_effect = side_effect_update
        
        try:
            updated_task_manual = await crud_task.update(db, db_obj=current_task, obj_in=update_in_manual)
            
            if updated_task_manual.completed_at == manual_date:
                 print(f"PASS: Manual override respected: {updated_task_manual.completed_at}")
            else:
                 print(f"FAIL: Manual override NOT respected. Got: {updated_task_manual.completed_at}")
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"ERROR in Update 4: {e}")

if __name__ == "__main__":
    asyncio.run(test_task_completion_logic())
