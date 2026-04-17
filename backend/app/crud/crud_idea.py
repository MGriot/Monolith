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

from sqlalchemy import func, exists
from app.models.associations import idea_votes, idea_downvotes
from app.models.project import Project as ProjectModel
from app.schemas.project import ProjectCreate

class CRUDIdea(CRUDBase[Idea, IdeaCreate, IdeaUpdate]):
    async def get(self, db: AsyncSession, id: Any, current_user_id: Optional[UUID] = None) -> Optional[Idea]:
        query = select(self.model).filter(self.model.id == id).options(
            selectinload(Idea.author),
            selectinload(Idea.threaded_comments).options(selectinload(Comment.author))
        )
        
        result = await db.execute(query)
        db_obj = result.scalars().first()
        if db_obj:
            # Count upvotes
            vote_count = await db.execute(
                select(func.count()).select_from(idea_votes).where(idea_votes.c.idea_id == id)
            )
            db_obj.vote_count = vote_count.scalar()
            
            # Count downvotes
            downvote_count = await db.execute(
                select(func.count()).select_from(idea_downvotes).where(idea_downvotes.c.idea_id == id)
            )
            db_obj.downvote_count = downvote_count.scalar()

            if current_user_id:
                # Check upvote
                vote_exists = await db.execute(
                    select(exists().where(idea_votes.c.idea_id == id).where(idea_votes.c.user_id == current_user_id))
                )
                db_obj.has_voted = vote_exists.scalar()
                
                # Check downvote
                downvote_exists = await db.execute(
                    select(exists().where(idea_downvotes.c.idea_id == id).where(idea_downvotes.c.user_id == current_user_id))
                )
                db_obj.has_downvoted = downvote_exists.scalar()
            else:
                db_obj.has_voted = False
                db_obj.has_downvoted = False
            
        return db_obj

    async def get_multi_by_project(
        self, db: AsyncSession, *, project_id: UUID, task_id: Optional[UUID] = None, skip: int = 0, limit: int = 100, current_user_id: Optional[UUID] = None
    ) -> List[Idea]:
        query = select(self.model).filter(self.model.project_id == project_id)
        if task_id:
            query = query.filter(self.model.task_id == task_id)
            
        result = await db.execute(
            query
            .order_by(self.model.created_at.desc())
            .options(
                selectinload(Idea.author),
                selectinload(Idea.threaded_comments).options(selectinload(Comment.author))
            )
            .offset(skip)
            .limit(limit)
        )
        ideas = result.scalars().all()
        
        for idea in ideas:
            # Count votes
            count_res = await db.execute(
                select(func.count()).select_from(idea_votes).where(idea_votes.c.idea_id == idea.id)
            )
            idea.vote_count = count_res.scalar()
            
            # Count downvotes
            down_res = await db.execute(
                select(func.count()).select_from(idea_downvotes).where(idea_downvotes.c.idea_id == idea.id)
            )
            idea.downvote_count = down_res.scalar()
            
            if current_user_id:
                vote_exists = await db.execute(
                    select(exists().where(idea_votes.c.idea_id == idea.id).where(idea_votes.c.user_id == current_user_id))
                )
                idea.has_voted = vote_exists.scalar()
                
                downvote_exists = await db.execute(
                    select(exists().where(idea_downvotes.c.idea_id == idea.id).where(idea_downvotes.c.user_id == current_user_id))
                )
                idea.has_downvoted = downvote_exists.scalar()
            else:
                idea.has_voted = False
                idea.has_downvoted = False
                
        return ideas

    async def get_multi_by_user(
        self, db: AsyncSession, *, user_id: UUID, skip: int = 0, limit: int = 100, current_user_id: Optional[UUID] = None
    ) -> List[Idea]:
        from app.models.project import Project
        from app.models.associations import project_members
        from sqlalchemy import or_

        # Ideas authored by user OR from projects user is in
        query = (
            select(self.model)
            .outerjoin(Project, self.model.project_id == Project.id)
            .outerjoin(project_members, Project.id == project_members.c.project_id)
            .filter(
                or_(
                    self.model.author_id == user_id,
                    Project.owner_id == user_id,
                    project_members.c.user_id == user_id
                )
            )
            .distinct()
            .order_by(self.model.created_at.desc())
            .options(
                selectinload(Idea.author),
                selectinload(Idea.threaded_comments).options(selectinload(Comment.author))
            )
            .offset(skip)
            .limit(limit)
        )

        result = await db.execute(query)
        ideas = result.scalars().all()

        for idea_obj in ideas:
            # Count upvotes
            count_res = await db.execute(
                select(func.count()).select_from(idea_votes).where(idea_votes.c.idea_id == idea_obj.id)
            )
            idea_obj.vote_count = count_res.scalar()
            
            # Count downvotes
            down_res = await db.execute(
                select(func.count()).select_from(idea_downvotes).where(idea_downvotes.c.idea_id == idea_obj.id)
            )
            idea_obj.downvote_count = down_res.scalar()

            if current_user_id:
                vote_exists = await db.execute(
                    select(exists().where(idea_votes.c.idea_id == idea_obj.id).where(idea_votes.c.user_id == current_user_id))
                )
                idea_obj.has_voted = vote_exists.scalar()
                
                downvote_exists = await db.execute(
                    select(exists().where(idea_downvotes.c.idea_id == idea_obj.id).where(idea_downvotes.c.user_id == current_user_id))
                )
                idea_obj.has_downvoted = downvote_exists.scalar()
            else:
                idea_obj.has_voted = False
                idea_obj.has_downvoted = False

        return ideas

    async def toggle_vote(self, db: AsyncSession, *, idea_id: UUID, user_id: UUID) -> bool:
        # 1. Remove downvote if exists
        await db.execute(
            idea_downvotes.delete().where(idea_downvotes.c.idea_id == idea_id).where(idea_downvotes.c.user_id == user_id)
        )
        
        # 2. Check if already upvoted
        query = select(idea_votes).where(idea_votes.c.idea_id == idea_id).where(idea_votes.c.user_id == user_id)
        result = await db.execute(query)
        if result.first():
            # Remove upvote
            await db.execute(
                idea_votes.delete().where(idea_votes.c.idea_id == idea_id).where(idea_votes.c.user_id == user_id)
            )
            await db.commit()
            return False
        else:
            # Add upvote
            await db.execute(
                idea_votes.insert().values(idea_id=idea_id, user_id=user_id)
            )
            await db.commit()
            return True

    async def toggle_downvote(self, db: AsyncSession, *, idea_id: UUID, user_id: UUID) -> bool:
        # 1. Remove upvote if exists
        await db.execute(
            idea_votes.delete().where(idea_votes.c.idea_id == idea_id).where(idea_votes.c.user_id == user_id)
        )
        
        # 2. Check if already downvoted
        query = select(idea_downvotes).where(idea_downvotes.c.idea_id == idea_id).where(idea_downvotes.c.user_id == user_id)
        result = await db.execute(query)
        if result.first():
            # Remove downvote
            await db.execute(
                idea_downvotes.delete().where(idea_downvotes.c.idea_id == idea_id).where(idea_downvotes.c.user_id == user_id)
            )
            await db.commit()
            return False
        else:
            # Add downvote
            await db.execute(
                idea_downvotes.insert().values(idea_id=idea_id, user_id=user_id)
            )
            await db.commit()
            return True

    async def promote_to_project(self, db: AsyncSession, *, idea_id: UUID, owner_id: UUID) -> ProjectModel:
        idea = await self.get(db, id=idea_id)
        if not idea:
            raise ValueError("Idea not found")
        if idea.status == IdeaStatus.CONVERTED:
            raise ValueError("Idea already converted")
            
        from app.crud.crud_project import project as crud_project
        
        project_in = ProjectCreate(
            name=idea.title,
            description=idea.description,
            status=Status.TODO
        )
        
        new_project = await crud_project.create_with_owner(db, obj_in=project_in, owner_id=owner_id)
        
        # Update idea status
        await self.update(db, db_obj=idea, obj_in={
            "status": IdeaStatus.CONVERTED,
            "promoted_project_id": new_project.id
        })
        
        return new_project

    async def create(self, db: AsyncSession, *, obj_in: IdeaCreate, author_id: UUID) -> Idea:
        obj_in_data = obj_in.dict()
        db_obj = self.model(**obj_in_data, author_id=author_id)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return await self.get(db, id=db_obj.id, current_user_id=author_id)

idea = CRUDIdea(Idea)
