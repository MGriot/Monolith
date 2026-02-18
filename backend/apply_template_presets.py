import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://monolith_user:monolith_password@localhost:5432/monolith_db")

async def apply_migration():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        print("Adding template preset columns...")
        await conn.execute(text("ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS topics_preset JSONB NOT NULL DEFAULT '[]'::jsonb"))
        await conn.execute(text("ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS work_types_preset JSONB NOT NULL DEFAULT '[]'::jsonb"))
        print("Migration complete.")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(apply_migration())
