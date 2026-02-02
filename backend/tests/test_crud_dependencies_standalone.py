import asyncio
import sys
import os
# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.db.session import AsyncSessionLocal
from app.crud import crud_task, crud_dependency, crud_project, crud_user
from app.schemas.task import TaskCreate, DependencyCreate
from app.core.enums import Status, Priority, DependencyType
from uuid import UUID

async def test_crud_dependencies():
    async with AsyncSessionLocal() as db:
        # 1. Setup project and user
        users = await crud_user.get_multi(db, limit=1)
        if not users:
            print("No users found.")
            return
        owner_id = users[0].id
        
        from app.schemas.project import ProjectCreate
        project_in = ProjectCreate(name="Test Dependencies Project", description="Test", topic="Test", type="Test")
        project = await crud_project.project.create_with_owner(db, obj_in=project_in, owner_id=owner_id)
        
        # 2. Create two tasks
        t1_in = TaskCreate(title="Task A", project_id=project.id, owner_id=owner_id)
        t2_in = TaskCreate(title="Task B", project_id=project.id, owner_id=owner_id)
        
        t1 = await crud_task.task.create(db, obj_in=t1_in)
        t2 = await crud_task.task.create(db, obj_in=t2_in)
        t1_id = t1.id
        t2_id = t2.id
        
        print(f"Created tasks: {t1_id}, {t2_id}")
        
        # 3. Create dependency: B blocked by A (FS)
        dep_in = DependencyCreate(
            successor_id=t2_id,
            predecessor_id=t1_id,
            type=DependencyType.FS,
            lag_days=1
        )
        dep = await crud_dependency.dependency.create(db, obj_in=dep_in)
        print(f"Created dependency: {dep.id}")
        
        # 4. Try to create circular dependency: A blocked by B
        print("Testing circular dependency detection...")
        dep_in_circ = DependencyCreate(
            successor_id=t1_id,
            predecessor_id=t2_id,
            type=DependencyType.FS
        )
        try:
            await crud_dependency.dependency.create(db, obj_in=dep_in_circ)
            print("FAILED: Circular dependency should have been caught.")
        except ValueError as e:
            print(f"PASSED: Caught circular dependency: {e}")

        # 5. Verify task retrieval includes dependencies
        db.expire_all()
        t2_loaded = await crud_task.task.get(db, id=t2_id)
        print(f"t2_loaded blocked_by: {t2_loaded.blocked_by}")
        assert len(t2_loaded.blocked_by) == 1
        assert t2_loaded.blocked_by[0].predecessor_id == t1_id
        print("Task retrieval with dependencies passed.")

        # Cleanup
        await crud_project.project.remove(db, id=project.id)
        print("Cleanup complete.")

if __name__ == "__main__":
    # Ensure DATABASE_URL is set in environment if running locally, 
    # but here we'll assume it's set or we're in the container.
    asyncio.run(test_crud_dependencies())
