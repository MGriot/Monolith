from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.crud.base import CRUDBase
from app.models.notification import Notification
from app.schemas.notification import NotificationCreate, NotificationUpdate

class CRUDNotification(CRUDBase[Notification, NotificationCreate, NotificationUpdate]):
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
