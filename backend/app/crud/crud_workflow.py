from typing import List, Optional, Any, Union, Dict
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.workflow import Workflow
from app.schemas.workflow import WorkflowCreate, WorkflowUpdate

class CRUDWorkflow(CRUDBase[Workflow, WorkflowCreate, WorkflowUpdate]):
    async def create_with_owner(
        self, db: AsyncSession, *, obj_in: WorkflowCreate, owner_id: UUID
    ) -> Workflow:
        db_obj = self.model(
            **obj_in.dict(),
            owner_id=owner_id
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get_multi(
        self, db: AsyncSession, *, skip: int = 0, limit: int = 100
    ) -> List[Workflow]:
        result = await db.execute(
            select(self.model)
            .options(selectinload(Workflow.owner))
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

workflow = CRUDWorkflow(Workflow)
