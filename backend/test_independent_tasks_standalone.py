import asyncio
import uuid
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select
from sqlalchemy import delete
from app.db.session import Base
from app.models.task import Task
from app.models.user import User
from app.crud.crud_task import task as crud_task
from app.schemas.task import TaskCreate
from app.core.config import settings

# Standalone test for independent tasks
async def test_independent_task_lifecycle():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # 1. Get a test user
        result = await db.execute(select(User).limit(1))
        user = result.scalars().first()
        if not user:
            print("No user found, please run populate_genesis.py first")
            return

        print(f"Testing with user: {user.email}")

        # 2. Create an independent task using CRUD
        print("Attempting to create independent task via CRUD...")
        task_in = TaskCreate(
            title="Independent Task CRUD Test",
            description="Testing project-less tasks via CRUD",
            owner_id=user.id,
            project_id=None
        )
        
        try:
            db_obj = await crud_task.create(db, obj_in=task_in)
            print(f"Successfully created independent task: {db_obj.id}")
            
            # 3. Verify retrieval
            print("Verifying task retrieval...")
            fetched = await crud_task.get(db, id=db_obj.id)
            if fetched and fetched.project_id is None:
                print("Retrieved task has NULL project_id as expected.")
            else:
                print(f"Error: Fetched task project_id is {fetched.project_id if fetched else 'N/A'}")

            # 4. Cleanup
            print("Cleaning up...")
            await crud_task.remove(db, id=db_obj.id)
            print("Task removed.")
            
        except Exception as e:
            print(f"FAILED: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_independent_task_lifecycle())
