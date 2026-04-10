import asyncio
from app.db.session import AsyncSessionLocal
from app.models.project import Project
from app.models.user import User
from app.models.task import Task
from app.models.dependency import Dependency
from app.models.notification import Notification
from app.models.team import Team
from app.models.idea import Idea
from app.models.workflow import Workflow
from app.models.template import ProjectTemplate
from app.models.associations import project_topics, project_types, task_topics, task_types, project_members, task_assignees, subtask_assignees, team_members
from app.crud import crud_user
from app.schemas.user import UserCreate
from sqlalchemy import delete

async def reset_database():
    async with AsyncSessionLocal() as db:
        print("Deleting association table data...")
        await db.execute(delete(project_topics))
        await db.execute(delete(project_types))
        await db.execute(delete(task_topics))
        await db.execute(delete(task_types))
        await db.execute(delete(project_members))
        await db.execute(delete(task_assignees))
        await db.execute(delete(subtask_assignees))
        await db.execute(delete(team_members))
        
        print("Deleting main table data...")
        await db.execute(delete(Idea))
        await db.execute(delete(Dependency))
        await db.execute(delete(Notification))
        await db.execute(delete(Task))
        await db.execute(delete(Project))
        await db.execute(delete(Team))
        await db.execute(delete(Workflow))
        await db.execute(delete(ProjectTemplate))
        await db.execute(delete(User))
        
        await db.commit()
        print("All data deleted.")

        print("Recreating default users...")
        # Admin
        admin_in = UserCreate(
            email="admin@admin.com",
            password="admin123",
            full_name="System Admin",
            is_superuser=True
        )
        await crud_user.create(db, obj_in=admin_in)
        print("Admin recreated.")

        # Tester
        tester_in = UserCreate(
            email="tester@example.com",
            password="tester123",
            full_name="QA Tester",
            is_superuser=False
        )
        await crud_user.create(db, obj_in=tester_in)
        print("Tester recreated.")
        
        await db.commit()

if __name__ == "__main__":
    asyncio.run(reset_database())
