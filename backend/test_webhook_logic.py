import sys
import os
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

# Setup path and dummy env
sys.path.append(os.getcwd())
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

from app.crud.crud_webhook import webhook as crud_webhook
from app.schemas.webhook import WebhookCreate
from app.models.webhook import Webhook

async def test_webhook_crud():
    print("Testing Webhook CRUD Logic...")
    
    db = AsyncMock()
    user_id = uuid4()
    
    # Mock super().create
    with patch('app.crud.base.CRUDBase.create', new_callable=AsyncMock) as mock_super_create:
        mock_super_create.return_value = Webhook(id=uuid4(), name="Slack", url="http://slack.com", owner_id=user_id)
        
        webhook_in = WebhookCreate(name="Slack", url="http://slack.com")
        created = await crud_webhook.create_with_owner(db, obj_in=webhook_in, owner_id=user_id)
        
        assert created.name == "Slack"
        assert created.owner_id == user_id
        print("PASS: Webhook creation with owner")

if __name__ == "__main__":
    asyncio.run(test_webhook_crud())
