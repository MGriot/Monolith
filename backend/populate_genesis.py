import asyncio
from datetime import datetime, timedelta
from uuid import UUID
from app.db.session import AsyncSessionLocal
from app.crud import crud_user, crud_project, crud_task
from app.schemas.project import ProjectCreate
from app.schemas.task import TaskCreate
from app.core.enums import Status, Priority

async def create_genesis_project():
    async with AsyncSessionLocal() as db:
        # 1. Get Admin User
        admin = await crud_user.get_by_email(db, email="admin@admin.com")
        if not admin:
            print("Admin not found.")
            return
        
        # 2. Create Project
        print("Creating project 'Monolith Genesis: Core Platform'...")
        now = datetime.utcnow()
        project_in = ProjectCreate(
            name="Monolith Genesis: Core Platform",
            description="""# Monolith Genesis
The foundation of the Monolith Project Planner. This project tracks the initial development phases based on historical changelogs.""",
            topic="Core",
            type="System",
            start_date=now - timedelta(days=30),
            due_date=now + timedelta(days=15),
            tags=["genesis", "infrastructure", "critical"]
        )
        project = await crud_project.project.create_with_owner(db, obj_in=project_in, owner_id=admin.id)
        print(f"Project created: {project.id}")

        # 3. Create Tasks
        tasks_to_create = [
            {
                "title": "Phase 1: Infrastructure & Scaffold",
                "description": "Initialize Docker, FastAPI, and React foundations.",
                "status": Status.DONE,
                "priority": Priority.CRITICAL,
                "subtasks": [
                    {"title": "Initialize Docker Environment", "status": Status.DONE},
                    {"title": "FastAPI Project Scaffold", "status": Status.DONE},
                    {"title": "React + Vite Frontend Scaffold", "status": Status.DONE}
                ]
            },
            {
                "title": "Phase 2: Backend Core",
                "description": "Implement Database Models, Auth, and CRUD APIs.",
                "status": Status.DONE,
                "priority": Priority.HIGH,
                "subtasks": [
                    {"title": "SQLAlchemy Models Implementation", "status": Status.DONE},
                    {"title": "JWT Authentication System", "status": Status.DONE},
                    {"title": "Projects & Tasks CRUD API", "status": Status.DONE}
                ]
            },
            {
                "title": "Phase 3: Advanced Logic",
                "description": "Status propagation, dependencies, and MCP bridge.",
                "status": Status.IN_PROGRESS,
                "priority": Priority.HIGH,
                "subtasks": [
                    {"title": "Status Propagation Engine", "status": Status.DONE},
                    {"title": "Dependency & Cycle Detection", "status": Status.DONE},
                    {"title": "MCP Module Implementation", "status": Status.IN_PROGRESS}
                ]
            },
            {
                "title": "Phase 4: Visualizations",
                "description": "High-density charts and dashboards.",
                "status": Status.TODO,
                "priority": Priority.MEDIUM,
                "subtasks": [
                    {"title": "Master Gantt View", "status": Status.TODO},
                    {"title": "Interactive Kanban Board", "status": Status.TODO},
                    {"title": "Activity Heatmaps", "status": Status.TODO}
                ]
            }
        ]

        for t_data in tasks_to_create:
            print(f"Creating task: {t_data['title']}")
            subtasks_data = t_data.pop("subtasks")
            task_in = TaskCreate(
                project_id=project.id,
                owner_id=admin.id,
                **t_data
            )
            task_obj = await crud_task.task.create(db, obj_in=task_in)
            
            for st_data in subtasks_data:
                st_in = TaskCreate(
                    project_id=project.id,
                    parent_id=task_obj.id,
                    owner_id=admin.id,
                    **st_data
                )
                await crud_task.task.create(db, obj_in=st_in)

        await db.commit()
        print("Genesis project populated.")

if __name__ == "__main__":
    asyncio.run(create_genesis_project())
