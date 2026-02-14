import asyncio
import os
from app.db.session import AsyncSessionLocal
from app.models.project import Project
from sqlalchemy import select

async def list_projects():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Project))
        projects = res.scalars().all()
        if not projects:
            print("No projects found.")
        else:
            for p in projects:
                print(f"- {p.name} (ID: {p.id}, Owner: {p.owner_id})")

if __name__ == "__main__":
    asyncio.run(list_projects())
