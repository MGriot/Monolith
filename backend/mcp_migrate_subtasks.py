import asyncio
from sqlalchemy import text
from app.db.session import engine

async def migrate_subtasks():
    print("Starting subtask data migration...")
    
    async with engine.connect() as conn:
        # 1. Migrate subtasks to tasks table
        # We join with tasks to get the project_id
        migration_stmt = """
        INSERT INTO tasks (
            id, project_id, parent_id, owner_id, title, description, 
            topic, type, status, priority, is_milestone, deadline_at, 
            created_at, updated_at, start_date, due_date, completed_at, 
            tags, attachments, blocked_by_ids, sort_index
        )
        SELECT 
            s.id, t.project_id, s.task_id, s.owner_id, s.title, s.description, 
            s.topic, s.type, s.status, s.priority, s.is_milestone, s.deadline_at, 
            s.created_at, s.updated_at, s.start_date, s.due_date, s.completed_at, 
            s.tags, s.attachments, s.blocked_by_ids, s.sort_index
        FROM subtasks s
        JOIN tasks t ON s.task_id = t.id
        ON CONFLICT (id) DO NOTHING;
        """
        
        try:
            res = await conn.execute(text(migration_stmt))
            await conn.commit()
            print(f"Migrated subtask records to tasks table.")
        except Exception as e:
            print(f"Error migrating subtasks: {e}")
            await conn.rollback()

        # 2. Migrate assignees
        assignee_stmt = """
        INSERT INTO task_assignees (task_id, user_id)
        SELECT subtask_id, user_id FROM subtask_assignees
        ON CONFLICT DO NOTHING;
        """
        
        try:
            await conn.execute(text(assignee_stmt))
            await conn.commit()
            print("Migrated subtask assignees to task_assignees table.")
        except Exception as e:
            print(f"Error migrating assignees: {e}")
            await conn.rollback()

        # 3. Verify counts
        st_count_res = await conn.execute(text("SELECT COUNT(*) FROM subtasks"))
        st_count = st_count_res.scalar()
        
        t_count_res = await conn.execute(text("SELECT COUNT(*) FROM tasks WHERE parent_id IS NOT NULL"))
        t_count = t_count_res.scalar()
        
        print(f"Migration check: {st_count} subtasks existed, {t_count} recursive tasks now exist.")
        
        if st_count == t_count:
            print("Migration verified successfully.")
        else:
            print("WARNING: Row count mismatch!")

    print("Migration complete.")

if __name__ == "__main__":
    asyncio.run(migrate_subtasks())
