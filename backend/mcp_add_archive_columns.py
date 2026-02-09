import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Get DB URL from env or default
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://monolith_user:monolith_password@localhost:5432/monolith_db")

async def add_columns():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        print("Checking/Adding archive columns to projects...")
        try:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN is_archived BOOLEAN DEFAULT FALSE"))
            print("Added is_archived to projects")
        except Exception as e:
            print(f"Skipping projects.is_archived (likely exists): {e}")

        try:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN archived_at TIMESTAMP"))
            print("Added archived_at to projects")
        except Exception as e:
            print(f"Skipping projects.archived_at (likely exists): {e}")

        print("Checking/Adding archive columns to tasks...")
        try:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN is_archived BOOLEAN DEFAULT FALSE"))
            print("Added is_archived to tasks")
        except Exception as e:
            print(f"Skipping tasks.is_archived (likely exists): {e}")

        try:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN archived_at TIMESTAMP"))
            print("Added archived_at to tasks")
        except Exception as e:
            print(f"Skipping tasks.archived_at (likely exists): {e}")
            
        print("Checking/Adding archive columns to subtasks (legacy)...")
        try:
            await conn.execute(text("ALTER TABLE subtasks ADD COLUMN is_archived BOOLEAN DEFAULT FALSE"))
            print("Added is_archived to subtasks")
        except Exception as e:
            print(f"Skipping subtasks.is_archived (likely exists): {e}")

        try:
            await conn.execute(text("ALTER TABLE subtasks ADD COLUMN archived_at TIMESTAMP"))
            print("Added archived_at to subtasks")
        except Exception as e:
            print(f"Skipping subtasks.archived_at (likely exists): {e}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(add_columns())
