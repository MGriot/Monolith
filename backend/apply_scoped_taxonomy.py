import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/monolith")

async def apply_migration():
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        print("Applying Scoped Taxonomy migration...")
        
        # Add columns to topics
        await conn.execute(text("ALTER TABLE topics ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE"))
        await conn.execute(text("ALTER TABLE topics ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE CASCADE"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_topics_project_id ON topics (project_id)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_topics_task_id ON topics (task_id)"))
        
        # Add columns to work_types
        await conn.execute(text("ALTER TABLE work_types ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE"))
        await conn.execute(text("ALTER TABLE work_types ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE CASCADE"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_work_types_project_id ON work_types (project_id)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_work_types_task_id ON work_types (task_id)"))
        
        # Handle constraints: drop old unique constraint on 'name' and add new scoped one
        # Note: In previous schema 'name' might have been a simple UNIQUE column or a named constraint.
        # Postgres automatically creates a constraint named 'topics_name_key' or similar for UNIQUE(name).
        
        try:
            await conn.execute(text("ALTER TABLE topics DROP CONSTRAINT IF EXISTS topics_name_key"))
        except Exception: pass

        try:
            await conn.execute(text("ALTER TABLE work_types DROP CONSTRAINT IF EXISTS work_types_name_key"))
        except Exception: pass

        await conn.execute(text("ALTER TABLE topics ADD CONSTRAINT _topic_name_scope_uc UNIQUE (name, project_id, task_id)"))
        await conn.execute(text("ALTER TABLE work_types ADD CONSTRAINT _work_type_name_scope_uc UNIQUE (name, project_id, task_id)"))
        
        print("Migration complete.")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(apply_migration())
