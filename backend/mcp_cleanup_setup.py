import asyncio
import logging
from uuid import UUID

from app.db.session import AsyncSessionLocal
from app.crud import crud_project, crud_user, crud_task
from app.models.dependency import Dependency
from app.schemas.user import UserCreate
from app.schemas.project import ProjectCreate
from app.core.enums import Status
from sqlalchemy import select, delete

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def cleanup_and_setup():
    async with AsyncSessionLocal() as db:
        logger.info("Starting cleanup...")
        
        # 1. Delete Dependencies (to avoid FK violation)
        # We delete ALL dependencies for simplicity in this reset script
        await db.execute(delete(Dependency))
        await db.commit()
        logger.info("Deleted all dependencies.")

        # 2. Delete Projects (Cascades to Tasks, Subtasks)
        projects = await crud_project.project.get_multi(db, limit=1000)
        for p in projects:
            logger.info(f"Deleting project: {p.name}")
            await crud_project.project.remove(db, id=p.id)
        
        # 3. Create Users
        admin_email = "admin@admin.com"
        test_email = "test@example.com"
        
        admin = await crud_user.get_by_email(db, email=admin_email)
        if not admin:
            logger.info("Creating admin user...")
            admin_in = UserCreate(
                email=admin_email,
                password="password",
                full_name="Admin User",
                is_superuser=True
            )
            admin = await crud_user.create(db, obj_in=admin_in)
        
        test_user = await crud_user.get_by_email(db, email=test_email)
        if not test_user:
            logger.info("Creating test user...")
            test_in = UserCreate(
                email=test_email,
                password="password",
                full_name="Test User",
                is_superuser=False
            )
            test_user = await crud_user.create(db, obj_in=test_in)

        # 4. Create New Project Template
        # Admin Project
        admin_project_in = ProjectCreate(
            name="Admin Strategic Initiative",
            topic="Strategy",
            type="Internal",
            description="Top level strategic planning.",
            status=Status.IN_PROGRESS,
            owner_id=admin.id
        )
        admin_proj = await crud_project.project.create_with_owner(db, obj_in=admin_project_in, owner_id=admin.id)
        logger.info(f"Created Admin Project: {admin_proj.name}")

        # Test User Project
        test_project_in = ProjectCreate(
            name="Test User Sandbox",
            topic="Research",
            type="Personal",
            description="A sandbox for testing the WBS features.",
            status=Status.TODO,
            owner_id=test_user.id
        )
        test_proj = await crud_project.project.create_with_owner(db, obj_in=test_project_in, owner_id=test_user.id)
        logger.info(f"Created Test Project: {test_proj.name}")
        
        logger.info("Cleanup and Setup complete.")

if __name__ == "__main__":
    asyncio.run(cleanup_and_setup())
