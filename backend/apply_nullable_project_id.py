import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import settings

async def apply_alter():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        print("Altering tasks table to make project_id nullable...")
        await conn.execute(text("ALTER TABLE tasks ALTER COLUMN project_id DROP NOT NULL"))
        print("Done.")

if __name__ == "__main__":
    asyncio.run(apply_alter())
