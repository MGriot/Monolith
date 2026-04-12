from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.crud.base import CRUDBase
from app.models.webhook import Webhook
from app.schemas.webhook import WebhookCreate, WebhookUpdate

class CRUDWebhook(CRUDBase[Webhook, WebhookCreate, WebhookUpdate]):
    async def create_with_owner(
        self, db: AsyncSession, *, obj_in: WebhookCreate, owner_id: UUID
    ) -> Webhook:
        obj_in_data = obj_in.dict()
        db_obj = self.model(**obj_in_data, owner_id=owner_id)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get_multi_by_owner(
        self, db: AsyncSession, *, owner_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Webhook]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.owner_id == owner_id)
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

webhook = CRUDWebhook(Webhook)
