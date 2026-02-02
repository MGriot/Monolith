import asyncio
from sqlalchemy import text
from app.db.session import engine

async def sync_db_schema():
    print("Syncing database schema...")
    async with engine.begin() as conn:
        # Create new tables (like 'dependencies') if they don't exist
        from app.db.session import Base
        import app.models  # Load models
        await conn.run_sync(Base.metadata.create_all)
        print("Created new tables (if any).")

        # Add missing columns to existing tables
        # SQLAlchemy create_all doesn't add columns to existing tables.
        
        # Tasks
        try:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN is_milestone BOOLEAN DEFAULT FALSE"))
            print("Added 'is_milestone' to 'tasks'.")
        except Exception as e:
            if "already exists" in str(e):
                print("'is_milestone' already exists in 'tasks'.")
            else:
                print(f"Error adding 'is_milestone' to 'tasks': {e}")

        try:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN deadline_at TIMESTAMP WITHOUT TIME ZONE"))
            print("Added 'deadline_at' to 'tasks'.")
        except Exception as e:
            if "already exists" in str(e):
                print("'deadline_at' already exists in 'tasks'.")
            else:
                print(f"Error adding 'deadline_at' to 'tasks': {e}")

        # Subtasks
        try:
            await conn.execute(text("ALTER TABLE subtasks ADD COLUMN is_milestone BOOLEAN DEFAULT FALSE"))
            print("Added 'is_milestone' to 'subtasks'.")
        except Exception as e:
            if "already exists" in str(e):
                print("'is_milestone' already exists in 'subtasks'.")
            else:
                print(f"Error adding 'is_milestone' to 'subtasks': {e}")

        try:
            await conn.execute(text("ALTER TABLE subtasks ADD COLUMN deadline_at TIMESTAMP WITHOUT TIME ZONE"))
            print("Added 'deadline_at' to 'subtasks'.")
        except Exception as e:
            if "already exists" in str(e):
                print("'deadline_at' already exists in 'subtasks'.")
            else:
                print(f"Error adding 'deadline_at' to 'subtasks': {e}")

    print("Schema sync complete.")

if __name__ == "__main__":
    asyncio.run(sync_db_schema())
