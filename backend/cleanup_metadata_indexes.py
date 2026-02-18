import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://monolith_user:monolith_password@localhost:5432/monolith_db")

async def apply_migration():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        print("Cleaning up old unique indexes...")
        
        # Drop unique indexes if they exist
        await conn.execute(text("DROP INDEX IF EXISTS ix_topics_name"))
        await conn.execute(text("DROP INDEX IF EXISTS ix_work_types_name"))
        
        # Re-create as non-unique indexes (since name is still indexed in the model)
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_topics_name ON topics (name)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_work_types_name ON work_types (name)"))
        
        print("Cleanup complete.")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(apply_migration())
