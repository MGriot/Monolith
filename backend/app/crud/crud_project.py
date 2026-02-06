from typing import List, Optional, Any, Union, Dict
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.project import Project
from app.models.metadata import Topic, WorkType
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.core.utils import clean_dict_datetimes

class CRUDProject(CRUDBase[Project, ProjectCreate, ProjectUpdate]):
    async def get(self, db: AsyncSession, id: Any) -> Optional[Project]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.id == id)
            .options(
                selectinload(Project.topic_ref),
                selectinload(Project.type_ref),
                selectinload(Project.topics),
                selectinload(Project.types)
            )
        )
        return result.scalars().first()

    async def get_multi(
        self, db: AsyncSession, *, skip: int = 0, limit: int = 100
    ) -> List[Project]:
        result = await db.execute(
            select(self.model)
            .options(
                selectinload(Project.topic_ref),
                selectinload(Project.type_ref),
                selectinload(Project.topics),
                selectinload(Project.types)
            )
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def create_with_owner(
        self, db: AsyncSession, *, obj_in: ProjectCreate, owner_id: UUID
    ) -> Project:
        obj_in_data = clean_dict_datetimes(obj_in.dict(exclude={'topic_ids', 'type_ids'}))
        db_obj = self.model(**obj_in_data, owner_id=owner_id)
        
        if obj_in.topic_ids:
            topics_result = await db.execute(select(Topic).filter(Topic.id.in_(obj_in.topic_ids)))
            db_obj.topics = topics_result.scalars().all()
            
        if obj_in.type_ids:
            types_result = await db.execute(select(WorkType).filter(WorkType.id.in_(obj_in.type_ids)))
            db_obj.types = types_result.scalars().all()
            
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return await self.get(db, id=db_obj.id)

    async def update(
        self, db: AsyncSession, *, db_obj: Project, obj_in: Union[ProjectUpdate, Dict[str, Any]]
    ) -> Project:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.dict(exclude_unset=True)
            
        # Handle many-to-many topics
        if "topic_ids" in update_data:
            topic_ids = update_data.pop("topic_ids")
            if topic_ids:
                topics_result = await db.execute(select(Topic).filter(Topic.id.in_(topic_ids)))
                db_obj.topics = topics_result.scalars().all()
            else:
                db_obj.topics = []
                
        # Handle many-to-many types
        if "type_ids" in update_data:
            type_ids = update_data.pop("type_ids")
            if type_ids:
                types_result = await db.execute(select(WorkType).filter(WorkType.id.in_(type_ids)))
                db_obj.types = types_result.scalars().all()
            else:
                db_obj.types = []

        return await super().update(db, db_obj=db_obj, obj_in=update_data)

    async def get_multi_by_owner(
        self, db: AsyncSession, *, owner_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Project]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.owner_id == owner_id)
            .options(
                selectinload(Project.topic_ref),
                selectinload(Project.type_ref),
                selectinload(Project.topics),
                selectinload(Project.types)
            )
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

project = CRUDProject(Project)
