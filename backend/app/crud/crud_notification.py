from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.crud.base import CRUDBase
from app.models.notification import Notification
from app.schemas.notification import NotificationCreate, NotificationUpdate, Notification as NotificationSchema

class CRUDNotification(CRUDBase[Notification, NotificationCreate, NotificationUpdate]):
    async def create(self, db: AsyncSession, *, obj_in: NotificationCreate) -> Notification:
        db_obj = await super().create(db, obj_in=obj_in)
        
        # Broadcast via WebSocket
        try:
            from app.core.websockets import manager
            from app.core.utils import clean_dict_for_json
            
            # Serialize and clean
            notification_data = NotificationSchema.model_validate(db_obj).model_dump()
            notification_data = clean_dict_for_json(notification_data)
            
            await manager.send_personal_message(
                {"type": "new_notification", "data": notification_data},
                user_id=db_obj.user_id
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"WebSocket broadcast failed: {e}")
            
        return db_obj

    async def get_multi_by_user(
        self, db: AsyncSession, *, user_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Notification]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.user_id == user_id)
            .order_by(self.model.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def mark_as_read(self, db: AsyncSession, *, notification_id: UUID) -> Notification:
        db_obj = await self.get(db, id=notification_id)
        if db_obj:
            db_obj.is_read = True
            db.add(db_obj)
            await db.commit()
            await db.refresh(db_obj)
        return db_obj

    async def mark_all_as_read(self, db: AsyncSession, *, user_id: UUID):
        # Implementation for marking all as read
        pass

notification = CRUDNotification(Notification)
