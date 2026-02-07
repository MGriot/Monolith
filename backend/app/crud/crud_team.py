from typing import List, Optional, Any, Union, Dict
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.crud.base import CRUDBase
from app.models.team import Team
from app.models.user import User
from app.schemas.team import TeamCreate, TeamUpdate

class CRUDTeam(CRUDBase[Team, TeamCreate, TeamUpdate]):
    async def get(self, db: AsyncSession, id: Any) -> Optional[Team]:
        result = await db.execute(
            select(self.model)
            .filter(self.model.id == id)
            .options(selectinload(Team.members))
        )
        return result.scalars().first()

    async def get_multi(
        self, db: AsyncSession, *, skip: int = 0, limit: int = 100
    ) -> List[Team]:
        result = await db.execute(
            select(self.model)
            .options(selectinload(Team.members))
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def create(
        self, db: AsyncSession, *, obj_in: TeamCreate
    ) -> Team:
        obj_in_data = obj_in.dict(exclude={'member_ids'})
        db_obj = self.model(**obj_in_data)
        
        if obj_in.member_ids:
            members_result = await db.execute(select(User).filter(User.id.in_(obj_in.member_ids)))
            db_obj.members = members_result.scalars().all()
            
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return await self.get(db, id=db_obj.id)

    async def update(
        self, db: AsyncSession, *, db_obj: Team, obj_in: Union[TeamUpdate, Dict[str, Any]]
    ) -> Team:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.dict(exclude_unset=True)
            
        if "member_ids" in update_data:
            member_ids = update_data.pop("member_ids")
            if member_ids:
                members_result = await db.execute(select(User).filter(User.id.in_(member_ids)))
                db_obj.members = members_result.scalars().all()
            else:
                db_obj.members = []

        return await super().update(db, db_obj=db_obj, obj_in=update_data)

    async def get_multi_by_user(
        self, db: AsyncSession, *, user_id: UUID, skip: int = 0, limit: int = 100
    ) -> List[Team]:
        """
        Fetch teams where the user is a member.
        """
        from app.models.associations import team_members
        query = (
            select(self.model)
            .join(team_members)
            .filter(team_members.c.user_id == user_id)
            .options(selectinload(Team.members))
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(query)
        return result.scalars().all()

team = CRUDTeam(Team)
