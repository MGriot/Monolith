import sys
import os
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

# Setup path and dummy env
sys.path.append(os.getcwd())
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

from app.core.enums import IdeaStatus, Status
from app.models.idea import Idea
from app.models.task import Task
from app.schemas.idea import IdeaCreate
from app.crud.crud_idea import idea as crud_idea

async def test_idea_logic():
    print("Testing Project Ideas Logic...")
    
    db = AsyncMock()
    project_id = uuid4()
    user_id = uuid4()
    
    # 1. Test Create Idea
    print("\n[1] Testing Create Idea...")
    idea_in = IdeaCreate(title="Test Idea", description="Test Description", project_id=project_id)
    
    with patch('app.crud.base.CRUDBase.create', new_callable=AsyncMock) as mock_super_create:
        async def side_effect_create(db, obj_in, **kwargs):
            return Idea(id=uuid4(), **obj_in.dict(), author_id=kwargs.get('author_id'))
        mock_super_create.side_effect = side_effect_create
        
        created_idea = await crud_idea.create(db, obj_in=idea_in, author_id=user_id)
        assert created_idea.title == "Test Idea"
        assert created_idea.author_id == user_id
        print("PASS: Idea Creation")

    # 2. Test Promote to Task
    print("\n[2] Testing Promote to Task...")
    idea_obj = Idea(
        id=uuid4(),
        title="Promotable Idea",
        description="Description",
        project_id=project_id,
        status=IdeaStatus.PROPOSED
    )
    
    # Mock crud_idea.get
    crud_idea.get = AsyncMock(return_value=idea_obj)
    
    # Mock crud_task.create
    with patch('app.crud.crud_task.task.create', new_callable=AsyncMock) as mock_task_create:
        task_id = uuid4()
        mock_task_create.return_value = Task(id=task_id, title=idea_obj.title)
        
        # Mock crud_idea.update
        with patch('app.crud.base.CRUDBase.update', new_callable=AsyncMock) as mock_super_update:
            
            promoted_task = await crud_idea.promote_to_task(db, idea_id=idea_obj.id, owner_id=user_id)
            
            assert promoted_task.title == idea_obj.title
            
            # Verify idea was updated
            mock_super_update.assert_called_once()
            args, kwargs = mock_super_update.call_args
            assert kwargs['obj_in']['status'] == IdeaStatus.CONVERTED
            assert kwargs['obj_in']['converted_task_id'] == task_id
            print("PASS: Idea Promotion")

if __name__ == "__main__":
    asyncio.run(test_idea_logic())