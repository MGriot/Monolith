import asyncio
import os
from app.db.session import AsyncSessionLocal
from app.crud import crud_project, crud_task, crud_user
from app.models.project import Project
from app.schemas.project import ProjectCreate
from app.schemas.task import TaskCreate, SubtaskCreate
from app.core.enums import Status, Priority
from sqlalchemy import select
from uuid import UUID
from datetime import datetime, timedelta

async def recreate_monolith_alpha():
    async with AsyncSessionLocal() as db:
        # 1. Find and Delete existing project
        res = await db.execute(select(Project).where(Project.name.ilike("%Monolith Alpha%")))
        old_project = res.scalars().first()
        if old_project:
            print(f"Deleting existing project: {old_project.name} ({old_project.id})")
            await crud_project.project.remove(db, id=old_project.id)
        
        # 2. Get a user for owner
        users = await crud_user.get_multi(db, limit=1)
        if not users:
            print("No users found. Please create one first.")
            return
        owner_id = users[0].id
        
        # 3. Create the new BIG project
        print("Creating new '🚀 Monolith Alpha: Core System'...")
        now = datetime.utcnow()
        project_in = ProjectCreate(
            name="🚀 Monolith Alpha: Core System",
            description="""# Monolith Alpha: Core System
The primary backbone of the Monolith Project Planner. This project tracks the development of the internal core modules, including:
- Async Database Engine
- Unified Dependency Model
- Status Propagation Loops
- MCP AI Bridge
""",
            topic="Core",
            type="System",
            start_date=now - timedelta(days=5),
            due_date=now + timedelta(days=30),
            tags=["core", "alpha", "critical"]
        )
        project = await crud_project.project.create_with_owner(db, obj_in=project_in, owner_id=owner_id)
        print(f"Project created with ID: {project.id}")

        # 4. Add Tasks and Subtasks
        
        # --- Task 1: Infrastructure ---
        t1_in = TaskCreate(
            project_id=project.id,
            title="🏗️ Backend Infrastructure",
            description="Setup the core FastAPI and SQLAlchemy async engine.",
            status=Status.DONE,
            priority=Priority.CRITICAL,
            topic="Infrastructure",
            type="Setup",
            start_date=now - timedelta(days=5),
            due_date=now - timedelta(days=3),
            owner_id=owner_id
        )
        t1 = await crud_task.task.create(db, obj_in=t1_in)
        
        await crud_task.subtask.create(db, obj_in=SubtaskCreate(
            task_id=t1.id, title="Dockerize Backend", status=Status.DONE, priority=Priority.HIGH,
            start_date=now - timedelta(days=5), due_date=now - timedelta(days=4), owner_id=owner_id
        ))
        await crud_task.subtask.create(db, obj_in=SubtaskCreate(
            task_id=t1.id, title="Async DB Migration", status=Status.DONE, priority=Priority.CRITICAL,
            start_date=now - timedelta(days=4), due_date=now - timedelta(days=3), owner_id=owner_id
        ))

        # --- Task 2: Hierarchical Logic ---
        t2_in = TaskCreate(
            project_id=project.id,
            title="🧬 Hierarchical State Engine",
            description="Implement status propagation and dependency validation.",
            status=Status.IN_PROGRESS,
            priority=Priority.HIGH,
            topic="Backend",
            type="Logic",
            start_date=now - timedelta(days=2),
            due_date=now + timedelta(days=5),
            owner_id=owner_id
        )
        t2 = await crud_task.task.create(db, obj_in=t2_in)
        
        st2_1 = await crud_task.subtask.create(db, obj_in=SubtaskCreate(
            task_id=t2.id, title="Subtask -> Task Propagation", status=Status.DONE, priority=Priority.MEDIUM,
            start_date=now - timedelta(days=2), due_date=now - timedelta(days=1), owner_id=owner_id
        ))
        st2_2 = await crud_task.subtask.create(db, obj_in=SubtaskCreate(
            task_id=t2.id, title="Task -> Project Progress %", status=Status.IN_PROGRESS, priority=Priority.HIGH,
            start_date=now - timedelta(days=1), due_date=now + timedelta(days=2), owner_id=owner_id
        ))
        st2_3 = await crud_task.subtask.create(db, obj_in=SubtaskCreate(
            task_id=t2.id, title="Recursive Cycle Detection (DAG)", status=Status.TODO, priority=Priority.CRITICAL,
            start_date=now + timedelta(days=2), due_date=now + timedelta(days=5), owner_id=owner_id
        ))

        # --- Task 3: Visualizations ---
        t3_in = TaskCreate(
            project_id=project.id,
            title="📊 High-Density Visualizations",
            description="Gantt, Kanban, and Activity Heatmaps.",
            status=Status.IN_PROGRESS,
            priority=Priority.MEDIUM,
            topic="Frontend",
            type="Feature",
            start_date=now,
            due_date=now + timedelta(days=10),
            owner_id=owner_id
        )
        t3 = await crud_task.task.create(db, obj_in=t3_in)
        
        await crud_task.subtask.create(db, obj_in=SubtaskCreate(
            task_id=t3.id, title="SVG Orthogonal Connectors", status=Status.DONE, priority=Priority.MEDIUM,
            start_date=now, due_date=now + timedelta(days=2), owner_id=owner_id
        ))
        await crud_task.subtask.create(db, obj_in=SubtaskCreate(
            task_id=t3.id, title="Gantt Multi-Level Zoom", status=Status.DONE, priority=Priority.MEDIUM,
            start_date=now + timedelta(days=1), due_date=now + timedelta(days=3), owner_id=owner_id
        ))
        await crud_task.subtask.create(db, obj_in=SubtaskCreate(
            task_id=t3.id, title="Interactive Kanban Board", status=Status.IN_PROGRESS, priority=Priority.HIGH,
            start_date=now + timedelta(days=3), due_date=now + timedelta(days=7), owner_id=owner_id
        ))

        # --- Task 4: MCP Bridge ---
        t4_in = TaskCreate(
            project_id=project.id,
            title="🤖 MCP AI Bridge",
            description="Expose project data to external AI agents.",
            status=Status.TODO,
            priority=Priority.HIGH,
            topic="AI",
            type="Integration",
            start_date=now + timedelta(days=10),
            due_date=now + timedelta(days=20),
            owner_id=owner_id
        )
        t4 = await crud_task.task.create(db, obj_in=t4_in)
        
        await crud_task.subtask.create(db, obj_in=SubtaskCreate(
            task_id=t4.id, title="Define MCP Tools", status=Status.TODO, priority=Priority.MEDIUM,
            start_date=now + timedelta(days=10), due_date=now + timedelta(days=12), owner_id=owner_id
        ))
        await crud_task.subtask.create(db, obj_in=SubtaskCreate(
            task_id=t4.id, title="Standalone MCP Container", status=Status.TODO, priority=Priority.HIGH,
            start_date=now + timedelta(days=13), due_date=now + timedelta(days=15), owner_id=owner_id
        ))

        # Add some dependencies
        print("Setting up dependencies...")
        # st2_3 depends on st2_2
        await crud_task.subtask.update(db, db_obj=st2_3, obj_in={"blocked_by_ids": [st2_2.id]})
        # t4 depends on t2
        await crud_task.task.update(db, db_obj=t4, obj_in={"blocked_by_ids": [t2.id]})

        print("Done!")

if __name__ == "__main__":
    asyncio.run(recreate_monolith_alpha())
