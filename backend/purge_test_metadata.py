import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://monolith_user:monolith_password@localhost:5432/monolith_db")

async def purge():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        print("Purging test metadata...")
        await conn.execute(text("DELETE FROM topics WHERE name = 'Research'"))
        await conn.execute(text("DELETE FROM work_types WHERE name = 'Coding'"))
        print("Purge complete.")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(purge())
