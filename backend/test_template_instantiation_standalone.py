import asyncio
import os
import uuid
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.db.session import Base
from app.models.project import Project
from app.models.task import Task
from app.models.metadata import Topic, WorkType
from app.models.template import ProjectTemplate
from app.models.user import User
from app.crud import crud_project
from app.schemas.project import ProjectCreate

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://monolith_user:monolith_password@localhost:5432/monolith_db")

async def test_template_instantiation():
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # 1. Setup User
        user_id = uuid.uuid4()
        user = User(id=user_id, email=f"tmpl_{uuid.uuid4().hex[:6]}@example.com", hashed_password="xxx", is_active=True)
        session.add(user)
        await session.commit()

        # 2. Create Template with Presets
        template_id = uuid.uuid4()
        topic_preset_id = "tmpl-topic-1"
        type_preset_id = "tmpl-type-1"
        
        template = ProjectTemplate(
            id=template_id,
            name="Marketing Launch Template",
            owner_id=user_id,
            topics_preset=[{"id": topic_preset_id, "name": "Content", "color": "#ff0000"}],
            work_types_preset=[{"id": type_preset_id, "name": "Copywriting", "color": "#00ff00", "icon": "edit"}],
            tasks_json=[
                {
                    "title": "Draft Press Release",
                    "topic_id": topic_preset_id,
                    "type_id": type_preset_id,
                    "subtasks": [
                        {"title": "Initial Draft"},
                        {"title": "Internal Review"}
                    ]
                }
            ]
        )
        session.add(template)
        await session.commit()
        print(f"Template created: {template_id}")

        # 3. Instantiate Project from Template
        project_in = ProjectCreate(
            name="New Campaign 2026",
            template_id=template_id
        )
        
        print("Instantiating project from template...")
        new_project = await crud_project.project.create_with_owner(session, obj_in=project_in, owner_id=user_id)
        print(f"Project instantiated: {new_project.id}")

        # 4. Verify Scoped Metadata
        topics_result = await session.execute(select(Topic).filter(Topic.project_id == new_project.id))
        scoped_topics = topics_result.scalars().all()
        print(f"Verified {len(scoped_topics)} scoped topics.")
        assert len(scoped_topics) == 1
        assert scoped_topics[0].name == "Content"

        # 5. Verify Hierarchical Tasks
        tasks_result = await session.execute(select(Task).filter(Task.project_id == new_project.id, Task.parent_id == None))
        root_tasks = tasks_result.scalars().all()
        print(f"Verified {len(root_tasks)} root tasks.")
        assert len(root_tasks) == 1
        assert root_tasks[0].title == "Draft Press Release"
        assert root_tasks[0].topic_id == scoped_topics[0].id

        # Verify subtasks
        subtasks_result = await session.execute(select(Task).filter(Task.parent_id == root_tasks[0].id))
        subtasks = subtasks_result.scalars().all()
        print(f"Verified {len(subtasks)} subtasks.")
        assert len(subtasks) == 2

        # 6. Cleanup
        # Cascade delete should handle tasks and metadata if project is deleted (once we add it)
        # For now manual cleanup or trust CASCADE
        await session.delete(template)
        await session.delete(new_project)
        await session.delete(user)
        await session.commit()
        print("Cleanup complete.")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(test_template_instantiation())
