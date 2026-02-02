import asyncio
from sqlalchemy import text
from app.db.session import engine

async def run_stmt(conn, stmt, msg):
    try:
        await conn.execute(text(stmt))
        await conn.commit()
        print(f"SUCCESS: {msg}")
    except Exception as e:
        await conn.rollback()
        if "already exists" in str(e).lower():
            print(f"SKIP: {msg} (already exists)")
        else:
            print(f"ERROR: {msg}: {e}")

async def sync_db_schema():
    print("Syncing database schema...")
    
    # 1. Create All
    async with engine.begin() as conn:
        from app.db.session import Base
        import app.models  # Load models
        await conn.run_sync(Base.metadata.create_all)
        print("Created new tables (if any).")

    # 2. Individual column updates
    async with engine.connect() as conn:
        # Tasks
        await run_stmt(conn, "ALTER TABLE tasks ADD COLUMN is_milestone BOOLEAN DEFAULT FALSE", "is_milestone to tasks")
        await run_stmt(conn, "ALTER TABLE tasks ADD COLUMN deadline_at TIMESTAMP WITHOUT TIME ZONE", "deadline_at to tasks")
        await run_stmt(conn, "ALTER TABLE tasks ADD COLUMN parent_id UUID REFERENCES tasks(id)", "parent_id to tasks")
        
        # Subtasks (still exist for now)
        await run_stmt(conn, "ALTER TABLE subtasks ADD COLUMN is_milestone BOOLEAN DEFAULT FALSE", "is_milestone to subtasks")
        await run_stmt(conn, "ALTER TABLE subtasks ADD COLUMN deadline_at TIMESTAMP WITHOUT TIME ZONE", "deadline_at to subtasks")

    print("Schema sync complete.")

if __name__ == "__main__":
    asyncio.run(sync_db_schema())