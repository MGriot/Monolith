import asyncio
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import AsyncSessionLocal
from app import crud, schemas
from app.models.user import User
from sqlalchemy.future import select

async def test_team_crud():
    async with AsyncSessionLocal() as db:
        # 1. Get an admin user
        result = await db.execute(select(User).filter(User.is_superuser == True))
        admin = result.scalars().first()
        if not admin:
            print("No admin user found")
            return

        # 2. Create a team
        team_in = schemas.team.TeamCreate(
            name="Test Team Alpha",
            description="A team for testing",
            member_ids=[admin.id]
        )
        team = await crud.team.create(db, obj_in=team_in)
        print(f"Created Team: {team.name} (ID: {team.id})")
        assert team.name == "Test Team Alpha"
        assert len(team.members) == 1

        # 3. Read team
        team_db = await crud.team.get(db, id=team.id)
        assert team_db.id == team.id
        print(f"Read Team: {team_db.name}")

        # 4. Update team
        team_up = schemas.team.TeamUpdate(name="Test Team Beta")
        team_updated = await crud.team.update(db, db_obj=team_db, obj_in=team_up)
        assert team_updated.name == "Test Team Beta"
        print(f"Updated Team: {team_updated.name}")

        # 5. List teams
        teams = await crud.team.get_multi(db)
        assert len(teams) >= 1
        print(f"Total Teams: {len(teams)}")

        # 6. Delete team
        await crud.team.remove(db, id=team.id)
        team_deleted = await crud.team.get(db, id=team.id)
        assert team_deleted is None
        print("Team Deleted Successfully")

if __name__ == "__main__":
    asyncio.run(test_team_crud())
