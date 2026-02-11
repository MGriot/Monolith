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
        
        # Work Types
        await run_stmt(conn, "ALTER TABLE work_types ADD COLUMN color VARCHAR DEFAULT '#64748b'", "color to work_types")
        
        # Teams
        await run_stmt(conn, "ALTER TABLE teams ADD COLUMN owner_id UUID REFERENCES users(id)", "owner_id to teams")
        
        # Projects
        await run_stmt(conn, "ALTER TABLE projects ADD COLUMN gantt_regions JSONB DEFAULT '[]'::jsonb", "gantt_regions to projects")
        
        # Enums
        # PostgreSQL enum updates need specialized handling
        try:
            await conn.execute(text("ALTER TYPE status ADD VALUE 'ON_HOLD'"))
            await conn.commit()
            print("SUCCESS: ON_HOLD added to status enum")
        except Exception as e:
            await conn.rollback()
            if "already exists" in str(e).lower():
                print("SKIP: ON_HOLD already in status enum")
            else:
                print(f"ERROR: status enum update: {e}")

    print("Schema sync complete.")

if __name__ == "__main__":
    asyncio.run(sync_db_schema())