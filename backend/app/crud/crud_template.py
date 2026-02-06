from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.crud.base import CRUDBase
from app.models.template import ProjectTemplate
from app.schemas.template import ProjectTemplateCreate, ProjectTemplateUpdate

class CRUDProjectTemplate(CRUDBase[ProjectTemplate, ProjectTemplateCreate, ProjectTemplateUpdate]):
    async def get_multi_by_owner(
        self, db: AsyncSession, *, owner_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[ProjectTemplate]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.owner_id == owner_id)
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def create_with_owner(
        self, db: AsyncSession, *, obj_in: ProjectTemplateCreate, owner_id: UUID
    ) -> ProjectTemplate:
        db_obj = self.model(**obj_in.dict(), owner_id=owner_id)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

project_template = CRUDProjectTemplate(ProjectTemplate)
