import sys
import os
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

# Setup paths and dummy envs
sys.path.append(os.getcwd())
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

from app.crud import crud_task
from app.models.task import Task
from app.schemas.task import TaskCreate, SubtaskShortCreate
from app.core.enums import Status

async def test_nested_subtask_creation():
    print("Testing Nested Subtask Creation Logic...")
    
    # Mocks
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    
    project_id = uuid4()
    task_in = TaskCreate(
        title="Parent Task with Subtasks",
        project_id=project_id,
        subtasks=[
            SubtaskShortCreate(title="Subtask A"),
            SubtaskShortCreate(title="Subtask B")
        ]
    )
    
    mock_task_id = uuid4()

    with patch('app.crud.crud_task.subtask') as mock_subtask_crud:
        mock_subtask_crud.create = AsyncMock()
        
        # Patch the model property of the task crud instance
        with patch.object(crud_task.task, 'model') as mock_model:
            mock_task_instance = MagicMock()
            mock_task_instance.id = mock_task_id
            mock_task_instance.title = task_in.title
            mock_task_instance.project_id = project_id
            mock_model.return_value = mock_task_instance
            
            # Mock update_project_progress
            crud_task.task.update_project_progress = AsyncMock()
            
            # Execute
            result = await crud_task.task.create(db, obj_in=task_in)
            
            # Verifications
            assert result.id == mock_task_id
            assert mock_subtask_crud.create.call_count == 2
            
            # Check calls to subtask creation
            args1, kwargs1 = mock_subtask_crud.create.call_args_list[0]
            assert kwargs1['obj_in'].title == "Subtask A"
            assert kwargs1['obj_in'].task_id == mock_task_id
            
            print("Scenario Passed: Parent task and 2 nested subtasks created.")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(test_nested_subtask_creation())
