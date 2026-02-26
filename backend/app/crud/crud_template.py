from typing import List, Optional, Any, Union, Dict
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.template import ProjectTemplate
from app.models.user import User
from app.schemas.template import ProjectTemplateCreate, ProjectTemplateUpdate
from app.core.utils import clean_dict_for_json

class CRUDProjectTemplate(CRUDBase[ProjectTemplate, ProjectTemplateCreate, ProjectTemplateUpdate]):
    async def get(self, db: AsyncSession, id: Any) -> Optional[ProjectTemplate]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.id == id)
            .options(selectinload(ProjectTemplate.shared_with), selectinload(ProjectTemplate.owner))
        )
        return result.scalars().first()

    async def get_multi(
        self, db: AsyncSession, *, skip: int = 0, limit: int = 100
    ) -> List[ProjectTemplate]:
        result = await db.execute(
            select(self.model)
            .options(selectinload(ProjectTemplate.shared_with), selectinload(ProjectTemplate.owner))
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def get_multi_by_owner(
        self, db: AsyncSession, *, owner_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[ProjectTemplate]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.owner_id == owner_id)
            .options(selectinload(ProjectTemplate.shared_with), selectinload(ProjectTemplate.owner))
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def get_multi_by_user(
        self, db: AsyncSession, *, user_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[ProjectTemplate]:
        """
        Fetch templates where the user is either the owner OR it's shared OR it's public.
        """
        from app.models.associations import template_shares
        from sqlalchemy import or_
        query = (
            select(self.model)
            .outerjoin(template_shares)
            .filter(
                or_(
                    self.model.owner_id == user_id,
                    self.model.is_public == True,
                    template_shares.c.user_id == user_id
                )
            )
            .distinct()
            .options(selectinload(ProjectTemplate.shared_with), selectinload(ProjectTemplate.owner))
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(query)
        return result.scalars().all()

    async def create_with_owner(
        self, db: AsyncSession, *, obj_in: ProjectTemplateCreate, owner_id: UUID
    ) -> ProjectTemplate:
        obj_in_data = obj_in.dict(exclude={'shared_with_ids'})
        # Clean for JSON serialization (convert UUIDs to strings in JSON fields)
        obj_in_data = clean_dict_for_json(obj_in_data)
        
        db_obj = self.model(**obj_in_data, owner_id=owner_id)
        
        if obj_in.shared_with_ids:
            shares_result = await db.execute(select(User).filter(User.id.in_(obj_in.shared_with_ids)))
            db_obj.shared_with = shares_result.scalars().all()
            
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return await self.get(db, id=db_obj.id)

    async def update(
        self, db: AsyncSession, *, db_obj: ProjectTemplate, obj_in: Union[ProjectTemplateUpdate, Dict[str, Any]]
    ) -> ProjectTemplate:
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

        # Clean for JSON serialization
        update_data = clean_dict_for_json(update_data)

        await super().update(db, db_obj=db_obj, obj_in=update_data)
        return await self.get(db, id=db_obj.id)

project_template = CRUDProjectTemplate(ProjectTemplate)
