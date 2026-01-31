import sys
import os
import asyncio
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from datetime import datetime

# Setup paths and dummy envs
sys.path.append(os.getcwd())
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

from app.api.api_v1.endpoints.calendar import get_calendar_events
from app.models.user import User
from app.models.project import Project
from app.models.task import Task, Subtask
from app.core.enums import Status

async def test_calendar_events_endpoint():
    print("Testing Calendar Events Endpoint Logic...")
    
    # Mocks
    db = AsyncMock()
    user = User(id=uuid4(), email="user@example.com", is_superuser=True)
    
    # Mock Data
    p_id = uuid4()
    t_id = uuid4()
    mock_subtask = Subtask(id=uuid4(), title="Subtask 1", task_id=t_id, status=Status.TODO, due_date=datetime.utcnow())
    
    # Mock for Projects (Call 1)
    res_proj = MagicMock()
    res_proj.scalars.return_value.all.return_value = []
    
    # Mock for Tasks (Call 2)
    res_task = MagicMock()
    res_task.scalars.return_value.all.return_value = []
    
    # Mock for Subtasks (Call 3)
    res_sub = MagicMock()
    res_sub.all.return_value = [(mock_subtask, p_id)]
    
    db.execute.side_effect = [res_proj, res_task, res_sub]
    
    # Call the endpoint
    result = await get_calendar_events(db=db, current_user=user)
    
    items = result["items"]
    assert len(items) == 1
    assert items[0].item_type == "subtask"
    assert items[0].project_id == p_id
    print("Scenario Passed: Subtask in calendar includes joined project_id.")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(test_calendar_events_endpoint())