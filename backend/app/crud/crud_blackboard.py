from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.crud.base import CRUDBase
from app.models.blackboard import Blackboard
from app.schemas.blackboard import BlackboardCreate, BlackboardUpdate

class CRUDBlackboard(CRUDBase[Blackboard, BlackboardCreate, BlackboardUpdate]):
    async def get_by_project(
        self, db: AsyncSession, *, project_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Blackboard]:
        result = await db.execute(
            select(Blackboard)
            .filter(Blackboard.project_id == project_id)
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def get_by_task(
        self, db: AsyncSession, *, task_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Blackboard]:
        result = await db.execute(
            select(Blackboard)
            .filter(Blackboard.task_id == task_id)
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def create_with_owner(
        self, db: AsyncSession, *, obj_in: BlackboardCreate, owner_id: UUID
    ) -> Blackboard:
        db_obj = Blackboard(
            title=obj_in.title,
            description=obj_in.description,
            data=obj_in.data,
            preview_image=obj_in.preview_image,
            project_id=obj_in.project_id,
            task_id=obj_in.task_id,
            owner_id=owner_id,
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

blackboard = CRUDBlackboard(Blackboard)
