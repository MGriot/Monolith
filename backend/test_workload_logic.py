import sys
import os
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timedelta

# Setup path and dummy env
sys.path.append(os.getcwd())
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

from app.api.api_v1.endpoints.dashboard import get_team_workload
from app.models.user import User
from app.models.task import Task
from app.core.enums import Status

async def test_workload_logic():
    print("Testing Resource Workload Leveling Logic...")
    
    db = AsyncMock()
    user_id = uuid4()
    current_user = User(id=user_id, is_superuser=True)
    
    # 1. Mock Users
    mock_users_res = MagicMock()
    mock_users_res.scalars.return_value.all.return_value = [
        User(id=user_id, full_name="Test User", is_active=True)
    ]
    
    # 2. Mock Tasks
    now = datetime.utcnow()
    task = Task(
        id=uuid4(),
        title="Test Task",
        start_date=now,
        due_date=now + timedelta(days=1), # 2 days duration
        status=Status.TODO,
        is_archived=False
    )
    task.assignees = [User(id=user_id)]
    
    mock_tasks_res = MagicMock()
    mock_tasks_res.scalars.return_value.all.return_value = [task]
    
    # Configure db.execute to return different results based on the query
    # This is simplified: first call users, second call tasks
    db.execute.side_effect = [mock_users_res, mock_tasks_res]
    
    response = await get_team_workload(db=db, current_user=current_user, days=7)
    
    assert len(response.users) == 1
    user_data = response.users[0]
    assert user_data.user_id == str(user_id)
    
    # Task is 2 days, 8h total -> 4h per day
    # Day 0 should have 4h
    assert user_data.workload[0].hours == 4.0
    assert user_data.workload[0].task_count == 1
    print("PASS: Workload calculation correct (4h/day for 2 days)")

if __name__ == "__main__":
    asyncio.run(test_workload_logic())
