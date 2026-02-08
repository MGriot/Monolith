from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.idea_comment import IdeaComment
from app.schemas.idea_comment import IdeaCommentCreate, IdeaCommentUpdate

class CRUDIdeaComment(CRUDBase[IdeaComment, IdeaCommentCreate, IdeaCommentUpdate]):
    async def get_multi_by_idea(
        self, db: AsyncSession, *, idea_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[IdeaComment]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.idea_id == idea_id)
            .order_by(self.model.created_at.asc())
            .options(selectinload(IdeaComment.author))
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def create(self, db: AsyncSession, *, obj_in: IdeaCommentCreate, author_id: UUID) -> IdeaComment:
        obj_in_data = obj_in.dict()
        db_obj = self.model(**obj_in_data, author_id=author_id)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

idea_comment = CRUDIdeaComment(IdeaComment)
