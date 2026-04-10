import sys
import os
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

# Setup path and dummy env
sys.path.append(os.getcwd())
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

from app.api.api_v1.endpoints.search import search_all
from app.models.user import User

async def test_search_logic():
    print("Testing Unified Search Logic...")
    
    db = AsyncMock()
    current_user = User(id=uuid4(), is_superuser=True)
    
    # Mock db.execute for Projects, Tasks, and Ideas
    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = []
    db.execute.return_value = mock_res
    
    # Call search
    results = await search_all(q="test", db=db, current_user=current_user)
    
    assert isinstance(results, list)
    assert db.execute.call_count == 3
    print("PASS: Unified search executed 3 sub-queries")

if __name__ == "__main__":
    asyncio.run(test_search_logic())
