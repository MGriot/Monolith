import sys
import os
import asyncio
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from datetime import datetime, timedelta

# Setup paths and dummy envs
sys.path.append(os.getcwd())
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

from app.api.api_v1.endpoints.dashboard import get_dashboard_summary
from app.models.user import User
from app.models.project import Project
from app.models.task import Task
from app.core.enums import Status

async def test_dashboard_summary_endpoint():
    print("Testing Dashboard Summary Endpoint Logic...")
    
    # Mocks
    db = AsyncMock()
    user = User(id=uuid4(), email="user@example.com", is_superuser=False)
    
    # Mock Projects Count
    mock_proj_res = MagicMock()
    mock_proj_res.scalar.return_value = 2
    db.execute.return_value = mock_proj_res
    
    # Mock Tasks List
    t1 = Task(id=uuid4(), title="Task 1", status=Status.IN_PROGRESS, project_id=uuid4())
    t2 = Task(id=uuid4(), title="Task 2", status=Status.DONE, project_id=uuid4(), completed_at=datetime.utcnow())
    t3 = Task(id=uuid4(), title="Task 3", status=Status.TODO, project_id=uuid4(), due_date=datetime.utcnow() + timedelta(days=2))
    
    # We need to mock multiple execute calls
    # Call 1: Projects count
    # Call 2: Tasks list
    # Call 3: Upcoming deadlines
    # Call 4: Recent activity
    
    # A better way to mock sequential calls
    db.execute.side_effect = [
        mock_proj_res, # projects count
        AsyncMock(scalars=lambda: MagicMock(all=lambda: [t1, t2, t3])), # all tasks
        AsyncMock(scalars=lambda: MagicMock(all=lambda: [t3])), # upcoming
        AsyncMock(scalars=lambda: MagicMock(all=lambda: [t2]))  # activity
    ]
    
    # Call the endpoint function
    result = await get_dashboard_summary(db=db, current_user=user)
    
    assert result["total_projects"] == 2
    assert result["total_tasks"] == 3
    assert result["tasks_in_progress"] == 1
    assert result["tasks_done"] == 1
    assert len(result["upcoming_deadlines"]) == 1
    assert result["upcoming_deadlines"][0]["title"] == "Task 3"
    assert len(result["recent_activity"]) == 1
    assert result["recent_activity"][0]["title"] == "Task 2"
    
    print("Scenario Passed: Dashboard summary returns correct aggregated data.")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(test_dashboard_summary_endpoint())
