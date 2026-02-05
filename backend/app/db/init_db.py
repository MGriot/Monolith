from app.db.session import engine, Base, AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User
from sqlalchemy import select
import logging

logger = logging.getLogger(__name__)

async def seed_users():
    """
    Seeds default users if they don't exist.
    """
    async with AsyncSessionLocal() as db:
        # Check if admin already exists to avoid duplicates
        result = await db.execute(select(User).filter(User.email == "admin@admin.com"))
        if result.scalars().first():
            logger.info("Admin user already exists. Skipping seed.")
            return

        logger.info("Seeding users...")
        # Create Admin
        admin = User(
            email="admin@admin.com",
            hashed_password=get_password_hash("admin123"),
            full_name="Admin User",
            is_superuser=True,
            is_active=True
        )
        db.add(admin)
        
        # Create Tester
        tester = User(
            email="tester@example.com",
            hashed_password=get_password_hash("tester123"),
            full_name="Tester User",
            is_superuser=False,
            is_active=True
        )
        db.add(tester)
        
        await db.commit()
        logger.info("Database seeded with admin@admin.com and tester@example.com")

async def reset_db():
    """
    DANGER: Drops all tables, recreates them, and seeds default users.
    Use this only when you want to wipe everything.
    """
    logger.warning("FORCED DATABASE RESET INITIATED")
    async with engine.begin() as conn:
        logger.info("Dropping all tables...")
        await conn.run_sync(Base.metadata.drop_all)
        logger.info("Creating all tables...")
        await conn.run_sync(Base.metadata.create_all)
    
    await seed_users()

if __name__ == "__main__":
    import asyncio
    logging.basicConfig(level=logging.INFO)
    asyncio.run(reset_db())