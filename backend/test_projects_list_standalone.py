import sys
import os
import asyncio
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

# Setup paths and dummy envs
sys.path.append(os.getcwd())
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

from app.api.api_v1.endpoints.projects import read_projects
from app.models.user import User
from app.models.project import Project as ProjectModel
from app.crud import crud_project

async def test_projects_list_endpoint_logic():
    print("Testing Projects List Endpoint Logic...")
    
    # Mocks
    db = AsyncMock()
    
    # User 1: Superuser
    superuser = User(id=uuid4(), email="admin@example.com", is_superuser=True)
    
    # User 2: Normal User
    normal_user = User(id=uuid4(), email="user@example.com", is_superuser=False)
    
    # Mock Data
    p1 = ProjectModel(id=uuid4(), name="Project 1", owner_id=normal_user.id)
    p2 = ProjectModel(id=uuid4(), name="Project 2", owner_id=uuid4())
    
    # -------------------------------------------------------------------------
    # Scenario 1: Superuser should see all projects
    # -------------------------------------------------------------------------
    crud_project.project.get_multi = AsyncMock(return_value=[p1, p2])
    
    result = await read_projects(db=db, skip=0, limit=10, current_user=superuser)
    
    crud_project.project.get_multi.assert_called_once()
    assert len(result) == 2
    print("Scenario 1 Passed: Superuser sees all projects.")
    
    # -------------------------------------------------------------------------
    # Scenario 2: Normal user should only see their projects
    # -------------------------------------------------------------------------
    crud_project.project.get_multi_by_owner = AsyncMock(return_value=[p1])
    
    result = await read_projects(db=db, skip=0, limit=10, current_user=normal_user)
    
    crud_project.project.get_multi_by_owner.assert_called_once_with(
        db, owner_id=normal_user.id, skip=0, limit=10
    )
    assert len(result) == 1
    assert result[0].name == "Project 1"
    print("Scenario 2 Passed: Normal user sees only owned projects.")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(test_projects_list_endpoint_logic())