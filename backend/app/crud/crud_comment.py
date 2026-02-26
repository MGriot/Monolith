from typing import List, Optional
from uuid import UUID
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.comment import Comment
from app.schemas.comment import CommentCreate, CommentUpdate

class CRUDComment:
    def _get_deep_options(self):
        """
        Helper to generate deep loading options for recursive replies.
        Supports up to 15 levels of nesting to handle deep threads.
        """
        # Load the author of the top-level comment
        base_author = selectinload(Comment.author)
        
        # Build a recursive chain for replies and their authors
        # selectinload(Comment.replies).selectinload(Comment.author)
        # selectinload(Comment.replies).selectinload(Comment.replies).selectinload(Comment.author)
        
        options = [base_author]
        
        curr_replies = selectinload(Comment.replies)
        for _ in range(15):
            # Load author for the current level
            options.append(curr_replies.selectinload(Comment.author))
            # Move to the next level of replies
            curr_replies = curr_replies.selectinload(Comment.replies)
            
        return options

    async def get(self, db: AsyncSession, id: UUID) -> Optional[Comment]:
        result = await db.execute(
            select(Comment)
            .options(*self._get_deep_options())
            .filter(Comment.id == id)
        )
        return result.scalars().first()

    async def get_by_project(self, db: AsyncSession, project_id: UUID) -> List[Comment]:
        result = await db.execute(
            select(Comment)
            .options(*self._get_deep_options())
            .filter(Comment.project_id == project_id, Comment.parent_id == None)
            .order_by(Comment.created_at.desc())
        )
        return result.scalars().all()

    async def get_by_task(self, db: AsyncSession, task_id: UUID) -> List[Comment]:
        result = await db.execute(
            select(Comment)
            .options(*self._get_deep_options())
            .filter(Comment.task_id == task_id, Comment.parent_id == None)
            .order_by(Comment.created_at.desc())
        )
        return result.scalars().all()
    
    async def get_by_idea(self, db: AsyncSession, idea_id: UUID) -> List[Comment]:
        result = await db.execute(
            select(Comment)
            .options(*self._get_deep_options())
            .filter(Comment.idea_id == idea_id, Comment.parent_id == None)
            .order_by(Comment.created_at.desc())
        )
        return result.scalars().all()

    async def create(self, db: AsyncSession, obj_in: CommentCreate, author_id: UUID) -> Comment:
        db_obj = Comment(
            content=obj_in.content,
            author_id=author_id,
            project_id=obj_in.project_id,
            task_id=obj_in.task_id,
            idea_id=obj_in.idea_id,
            parent_id=obj_in.parent_id
        )
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        
        # Refetch with deep options for the response
        return await self.get(db, db_obj.id)

    async def update(self, db: AsyncSession, *, db_obj: Comment, obj_in: CommentUpdate) -> Comment:
        update_data = obj_in.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        # Refetch with deep options
        return await self.get(db, db_obj.id)

    async def delete(self, db: AsyncSession, *, id: UUID) -> Comment:
        db_obj = await self.get(db, id=id)
        if db_obj:
            await db.delete(db_obj)
            await db.commit()
        return db_obj

crud_comment = CRUDComment()
