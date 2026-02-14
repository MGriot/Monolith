import asyncio
from app.db.session import AsyncSessionLocal
from app.models.user import User
from sqlalchemy import select

async def list_users():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User))
        users = res.scalars().all()
        for u in users:
            print(f"- {u.email} (ID: {u.id}, Superuser: {u.is_superuser})")

if __name__ == "__main__":
    asyncio.run(list_users())
