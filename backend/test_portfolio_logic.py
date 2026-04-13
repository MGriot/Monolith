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

from app.api.api_v1.endpoints.projects import get_portfolio_health
from app.models.user import User
from app.models.project import Project
from app.models.task import Task
from app.core.enums import Status

async def test_portfolio_logic():
    print("Testing Portfolio Health Logic...")
    
    db = AsyncMock()
    user_id = uuid4()
    current_user = User(id=user_id, is_superuser=True)
    
    # 1. Mock Projects
    project = Project(
        id=uuid4(),
        name="Healthy Project",
        status="In Progress",
        progress_percent=50.0,
        is_archived=False,
        owner_id=user_id
    )
    
    # Mock crud_project.project.get_multi
    with patch('app.crud.crud_project.project.get_multi', new_callable=AsyncMock) as mock_get_multi:
        mock_get_multi.return_value = [project]
        
        # 2. Mock Tasks (no overdue)
        mock_tasks_res = MagicMock()
        mock_tasks_res.scalars.return_value.all.return_value = []
        db.execute.return_value = mock_tasks_res
        
        response = await get_portfolio_health(db=db, current_user=current_user)
        
        assert response.total_active == 1
        assert response.projects[0].health_score == 100.0
        assert response.projects[0].risk_level == "Low"
        print("PASS: Portfolio health aggregation correct")

if __name__ == "__main__":
    asyncio.run(test_portfolio_logic())
