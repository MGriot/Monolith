from typing import List, Optional, Any, Union, Dict
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.workflow import Workflow
from app.models.user import User
from app.schemas.workflow import WorkflowCreate, WorkflowUpdate

class CRUDWorkflow(CRUDBase[Workflow, WorkflowCreate, WorkflowUpdate]):
    async def get(self, db: AsyncSession, id: Any) -> Optional[Workflow]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.id == id)
            .options(selectinload(Workflow.shared_with), selectinload(Workflow.owner))
        )
        return result.scalars().first()

    async def create_with_owner(
        self, db: AsyncSession, *, obj_in: WorkflowCreate, owner_id: UUID
    ) -> Workflow:
        obj_in_data = obj_in.dict(exclude={'shared_with_ids'})
        db_obj = self.model(
            **obj_in_data,
            owner_id=owner_id
        )
        
        if obj_in.shared_with_ids:
            shares_result = await db.execute(select(User).filter(User.id.in_(obj_in.shared_with_ids)))
            db_obj.shared_with = shares_result.scalars().all()
            
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return await self.get(db, id=db_obj.id)

    async def update(
        self, db: AsyncSession, *, db_obj: Workflow, obj_in: Union[WorkflowUpdate, Dict[str, Any]]
    ) -> Workflow:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.dict(exclude_unset=True)
            
        if "shared_with_ids" in update_data:
            shared_with_ids = update_data.pop("shared_with_ids")
            if shared_with_ids:
                shares_result = await db.execute(select(User).filter(User.id.in_(shared_with_ids)))
                db_obj.shared_with = shares_result.scalars().all()
            else:
                db_obj.shared_with = []

        await super().update(db, db_obj=db_obj, obj_in=update_data)
        return await self.get(db, id=db_obj.id)

    async def get_multi(
        self, db: AsyncSession, *, skip: int = 0, limit: int = 100
    ) -> List[Workflow]:
        result = await db.execute(
            select(self.model)
            .options(selectinload(Workflow.owner), selectinload(Workflow.shared_with))
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def get_multi_by_user(
        self, db: AsyncSession, *, user_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Workflow]:
        """
        Fetch workflows where the user is either the owner OR it's shared OR it's public.
        """
        from app.models.associations import workflow_shares
        from sqlalchemy import or_
        query = (
            select(self.model)
            .outerjoin(workflow_shares)
            .filter(
                or_(
                    self.model.owner_id == user_id,
                    self.model.is_public == True,
                    workflow_shares.c.user_id == user_id
                )
            )
            .distinct()
            .options(selectinload(Workflow.shared_with), selectinload(Workflow.owner))
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(query)
        return result.scalars().all()

workflow = CRUDWorkflow(Workflow)
