from typing import List, Optional, Any, Union, Dict
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.idea import Idea
from app.models.comment import Comment
from app.models.task import Task
from app.schemas.idea import IdeaCreate, IdeaUpdate
from app.schemas.task import TaskCreate
from app.core.enums import IdeaStatus, Status
from app.crud.crud_task import task as crud_task

class CRUDIdea(CRUDBase[Idea, IdeaCreate, IdeaUpdate]):
    async def get(self, db: AsyncSession, id: Any) -> Optional[Idea]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.id == id)
            .options(
                selectinload(Idea.author),
                selectinload(Idea.threaded_comments).options(selectinload(Comment.author))
            )
        )
        return result.scalars().first()

    async def get_multi_by_project(
        self, db: AsyncSession, *, project_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Idea]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.project_id == project_id)
            .order_by(self.model.created_at.desc())
            .options(
                selectinload(Idea.author),
                selectinload(Idea.threaded_comments).options(selectinload(Comment.author))
            )
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()


    async def create(self, db: AsyncSession, *, obj_in: IdeaCreate, author_id: UUID) -> Idea:
        obj_in_data = obj_in.dict()
        db_obj = self.model(**obj_in_data, author_id=author_id)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return await self.get(db, id=db_obj.id)

    async def update(
        self, db: AsyncSession, *, db_obj: Idea, obj_in: Union[IdeaUpdate, Dict[str, Any]]
    ) -> Idea:
        db_obj = await super().update(db, db_obj=db_obj, obj_in=obj_in)
        return await self.get(db, id=db_obj.id)

    async def promote_to_task(self, db: AsyncSession, *, idea_id: UUID, owner_id: UUID) -> Task:
        idea = await self.get(db, id=idea_id)
        if not idea:
            raise ValueError("Idea not found")
        if idea.status == IdeaStatus.CONVERTED:
            raise ValueError("Idea already converted to task")
            
        # Create task from idea
        task_in = TaskCreate(
            title=idea.title,
            description=idea.description,
            project_id=idea.project_id,
            owner_id=owner_id,
            status=Status.TODO
        )
        
        new_task = await crud_task.create(db, obj_in=task_in)
        
        # Update idea status
        await self.update(db, db_obj=idea, obj_in={
            "status": IdeaStatus.CONVERTED,
            "converted_task_id": new_task.id
        })
        
        return new_task

idea = CRUDIdea(Idea)
