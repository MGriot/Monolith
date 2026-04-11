import sys
import os
import asyncio
from unittest.mock import AsyncMock, patch
from uuid import uuid4

# Setup path and dummy env
sys.path.append(os.getcwd())
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

from app.api.api_v1.endpoints.ai import decompose_task
from app.schemas.ai import TaskDecompositionRequest
from app.models.user import User

async def test_ai_endpoint():
    print("Testing AI Decomposition Endpoint...")
    
    current_user = User(id=uuid4())
    request = TaskDecompositionRequest(title="Build a rocket", description="Need to reach Mars")
    
    # Mock llm_service.decompose_task
    with patch('app.core.llm.llm_service.decompose_task', new_callable=AsyncMock) as mock_decompose:
        mock_decompose.return_value = [
            {"title": "Design engine", "description": "Use liquid oxygen"},
            {"title": "Build hull", "description": "Titanium alloy"}
        ]
        
        response = await decompose_task(request=request, current_user=current_user)
        
        assert len(response.subtasks) == 2
        assert response.subtasks[0].title == "Design engine"
        assert response.subtasks[1].title == "Build hull"
        print("PASS: AI endpoint returned formatted subtasks")

if __name__ == "__main__":
    asyncio.run(test_ai_endpoint())
