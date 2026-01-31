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

from app.api.api_v1.endpoints.projects import create_project
from app.models.user import User
from app.schemas.project import ProjectCreate
from app.crud import crud_project

async def test_project_creation_endpoint_logic():
    print("Testing Project Creation Endpoint Logic...")
    
    # Mocks
    db = AsyncMock()
    user = User(id=uuid4(), email="user@example.com", is_superuser=False)
    
    project_in = ProjectCreate(
        name="New Project",
        topic="Development",
        type="Internal",
        status="Todo",
        description="Test project creation",
        tags=["test"]
    )
    
    # Mock crud_project.project.create_with_owner
    mock_project = MagicMock()
    mock_project.id = uuid4()
    mock_project.name = project_in.name
    mock_project.owner_id = user.id
    
    crud_project.project.create_with_owner = AsyncMock(return_value=mock_project)
    
    # Call the endpoint function
    result = await create_project(db=db, project_in=project_in, current_user=user)
    
    crud_project.project.create_with_owner.assert_called_once()
    assert result.name == "New Project"
    assert result.owner_id == user.id
    print("Scenario Passed: Project created successfully with owner ID.")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(test_project_creation_endpoint_logic())
