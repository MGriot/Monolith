import asyncio
import os
import uuid
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text
from app.db.session import Base
from app.models.project import Project
from app.models.task import Task
from app.models.metadata import Topic, WorkType
from app.models.user import User

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/monolith")

async def test_scoped_taxonomy():
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Create a test user if not exists
        user_id = uuid.uuid4()
        user = User(id=user_id, email=f"taxo_{uuid.uuid4().hex[:6]}@example.com", hashed_password="xxx", is_active=True)
        session.add(user)
        
        # Create a test project
        project_id = uuid.uuid4()
        project = Project(id=project_id, name="Taxo Project", owner_id=user_id)
        session.add(project)
        
        # Create a test task
        task_id = uuid.uuid4()
        task = Task(id=task_id, title="Taxo Task", project_id=project_id, owner_id=user_id)
        session.add(task)
        
        await session.commit()

        print("Creating global topic...")
        t_global = Topic(name="Research", project_id=None, task_id=None)
        session.add(t_global)
        await session.commit()
        print("Global topic created.")

        print("Creating project-scoped topic with same name...")
        t_project = Topic(name="Research", project_id=project_id, task_id=None)
        session.add(t_project)
        await session.commit()
        print("Project-scoped topic created (allowed duplicate name due to scope).")

        print("Creating task-scoped topic with same name...")
        t_task = Topic(name="Research", project_id=None, task_id=task_id)
        session.add(t_task)
        await session.commit()
        print("Task-scoped topic created (allowed duplicate name due to scope).")

        print("Attempting to create duplicate global topic (should fail)...")
        try:
            t_dup = Topic(name="Research", project_id=None, task_id=None)
            session.add(t_dup)
            await session.commit()
            print("ERROR: Duplicate global topic created unexpectedly!")
        except Exception as e:
            print(f"Success: Duplicate global topic failed as expected: {type(e).__name__}")
            await session.rollback()

        print("Verifying WorkType scoping...")
        w_global = WorkType(name="Coding", project_id=None, task_id=None)
        w_project = WorkType(name="Coding", project_id=project_id, task_id=None)
        session.add(w_global)
        session.add(w_project)
        await session.commit()
        print("WorkType scoping verified.")

        # Cleanup
        await session.delete(t_task)
        await session.delete(t_project)
        await session.delete(t_global)
        await session.delete(w_project)
        await session.delete(w_global)
        await session.delete(task)
        await session.delete(project)
        await session.delete(user)
        await session.commit()
        print("Cleanup complete.")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(test_scoped_taxonomy())
