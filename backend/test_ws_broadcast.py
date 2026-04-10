import sys
import os
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

# Setup path and dummy env
sys.path.append(os.getcwd())
os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@localhost/db"
os.environ["SECRET_KEY"] = "testing_secret"

from app.crud.crud_notification import notification as crud_notification
from app.schemas.notification import NotificationCreate
from app.models.notification import Notification

async def test_ws_broadcast():
    print("Testing WebSocket Broadcast on Notification Creation...")
    
    db = AsyncMock()
    user_id = uuid4()
    
    # 1. Mock super().create to return a dummy Notification
    with patch('app.crud.base.CRUDBase.create', new_callable=AsyncMock) as mock_super_create:
        mock_super_create.return_value = Notification(
            id=uuid4(),
            title="Test",
            message="Msg",
            user_id=user_id,
            created_at=MagicMock()
        )
        
        # 2. Mock manager.send_personal_message
        with patch('app.core.websockets.manager.send_personal_message', new_callable=AsyncMock) as mock_send:
            notification_in = NotificationCreate(title="Test", message="Msg", user_id=user_id)
            
            await crud_notification.create(db, obj_in=notification_in)
            
            # Verify send_personal_message was called
            mock_send.assert_called_once()
            args, kwargs = mock_send.call_args
            assert kwargs['user_id'] == user_id
            assert args[0]['type'] == 'new_notification'
            assert args[0]['data']['title'] == "Test"
            print("PASS: WebSocket broadcast triggered correctly")

if __name__ == "__main__":
    asyncio.run(test_ws_broadcast())
