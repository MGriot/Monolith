import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://monolith_user:monolith_password@localhost:5432/monolith_db")

async def apply_migration():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        print("Refining Scoped Taxonomy constraints using partial indexes...")
        
        # 1. Topics
        await conn.execute(text("ALTER TABLE topics DROP CONSTRAINT IF EXISTS _topic_name_scope_uc"))
        await conn.execute(text("DROP INDEX IF EXISTS topics_global_unique_idx"))
        await conn.execute(text("DROP INDEX IF EXISTS topics_project_unique_idx"))
        await conn.execute(text("DROP INDEX IF EXISTS topics_task_unique_idx"))

        # Global scope (project_id IS NULL AND task_id IS NULL)
        await conn.execute(text("CREATE UNIQUE INDEX topics_global_unique_idx ON topics (name) WHERE project_id IS NULL AND task_id IS NULL"))
        # Project scope (project_id IS NOT NULL)
        await conn.execute(text("CREATE UNIQUE INDEX topics_project_unique_idx ON topics (name, project_id) WHERE project_id IS NOT NULL"))
        # Task scope (task_id IS NOT NULL)
        await conn.execute(text("CREATE UNIQUE INDEX topics_task_unique_idx ON topics (name, task_id) WHERE task_id IS NOT NULL"))

        # 2. WorkTypes
        await conn.execute(text("ALTER TABLE work_types DROP CONSTRAINT IF EXISTS _work_type_name_scope_uc"))
        await conn.execute(text("DROP INDEX IF EXISTS work_types_global_unique_idx"))
        await conn.execute(text("DROP INDEX IF EXISTS work_types_project_unique_idx"))
        await conn.execute(text("DROP INDEX IF EXISTS work_types_task_unique_idx"))

        # Global scope
        await conn.execute(text("CREATE UNIQUE INDEX work_types_global_unique_idx ON work_types (name) WHERE project_id IS NULL AND task_id IS NULL"))
        # Project scope
        await conn.execute(text("CREATE UNIQUE INDEX work_types_project_unique_idx ON work_types (name, project_id) WHERE project_id IS NOT NULL"))
        # Task scope
        await conn.execute(text("CREATE UNIQUE INDEX work_types_task_unique_idx ON work_types (name, task_id) WHERE task_id IS NOT NULL"))
        
        print("Migration complete.")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(apply_migration())
