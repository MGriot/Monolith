import asyncio
import sys
import os

# Add the current directory to sys.path to allow importing from 'app'
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.session import engine

async def apply_updates():
    print("Applying sharing and public visibility schema updates...")
    async with engine.begin() as conn:
        # 1. Add is_public columns
        print("Adding is_public columns...")
        try:
            await conn.execute(text("ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE"))
            await conn.execute(text("ALTER TABLE workflows ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE"))
            print("Successfully added is_public columns.")
        except Exception as e:
            print(f"Error adding is_public columns: {e}")

        # 2. Create sharing association tables
        print("Creating sharing association tables...")
        
        # Template Shares
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS template_shares (
                    template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    PRIMARY KEY (template_id, user_id)
                )
            """))
            print("Created template_shares table.")
        except Exception as e:
            print(f"Error creating template_shares table: {e}")

        # Team Shares
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS team_shares (
                    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    PRIMARY KEY (team_id, user_id)
                )
            """))
            print("Created team_shares table.")
        except Exception as e:
            print(f"Error creating team_shares table: {e}")

        # Workflow Shares
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS workflow_shares (
                    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    PRIMARY KEY (workflow_id, user_id)
                )
            """))
            print("Created workflow_shares table.")
        except Exception as e:
            print(f"Error creating workflow_shares table: {e}")

    print("Schema updates completed.")

if __name__ == "__main__":
    asyncio.run(apply_updates())
