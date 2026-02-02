import asyncio
import sys
import os
# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.db.session import AsyncSessionLocal
from app.crud import crud_task, crud_project, crud_user
from app.schemas.task import TaskCreate, TaskShortCreate
from app.core.enums import Status, Priority
from uuid import UUID

async def test_recursive_logic():
    async with AsyncSessionLocal() as db:
        # 1. Setup project and user
        users = await crud_user.get_multi(db, limit=1)
        if not users:
            print("No users found.")
            return
        owner_id = users[0].id
        
        from app.schemas.project import ProjectCreate
        project_in = ProjectCreate(name="Recursive Logic Project", description="Test", topic="Test", type="Test")
        project = await crud_project.project.create_with_owner(db, obj_in=project_in, owner_id=owner_id)
        
        # 2. Create recursive structure
        # Root -> Level 1 -> Level 2
        root_in = TaskCreate(
            title="Root Task",
            project_id=project.id,
            owner_id=owner_id,
            subtasks=[
                TaskShortCreate(
                    title="Level 1 Task",
                    subtasks=[
                        TaskShortCreate(title="Level 2 Task", status=Status.TODO)
                    ]
                )
            ]
        )
        root = await crud_task.task.create(db, obj_in=root_in)
        print(f"Created recursive structure under root: {root.id}")
        
        # 3. Verify nesting
        root_id = root.id
        db.expire_all()
        root_loaded = await crud_task.task.get(db, id=root_id)
        assert len(root_loaded.subtasks) == 1
        level1_id = root_loaded.subtasks[0].id
        level1_title = root_loaded.subtasks[0].title
        assert level1_title == "Level 1 Task"
        
        # We need to load Level 1 to see Level 2 if get() only loads one level
        level1_loaded = await crud_task.task.get(db, id=level1_id)
        assert len(level1_loaded.subtasks) == 1
        level2_id = level1_loaded.subtasks[0].id
        level2_title = level1_loaded.subtasks[0].title
        assert level2_title == "Level 2 Task"
        print("Recursive structure verification passed.")
        
        # 4. Test Recursive Status Propagation
        # Change Level 2 to DONE -> Level 1 should be DONE -> Root should be DONE
        print("Testing status propagation...")
        level2_obj = await crud_task.task.get(db, id=level2_id)
        await crud_task.task.update(db, db_obj=level2_obj, obj_in={"status": Status.DONE})
        
        db.expire_all()
        l1_after = await crud_task.task.get(db, id=level1_id)
        root_after = await crud_task.task.get(db, id=root_id)
        
        print(f"Level 1 Status: {l1_after.status}")
        print(f"Root Status: {root_after.status}")
        
        assert l1_after.status == Status.DONE
        assert root_after.status == Status.DONE
        print("Status propagation check passed.")

        # Cleanup
        await crud_project.project.remove(db, id=project.id)
        print("Cleanup complete.")

if __name__ == "__main__":
    asyncio.run(test_recursive_logic())
