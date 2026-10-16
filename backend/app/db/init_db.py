from app.db.session import engine, Base, AsyncSessionLocal
from app.core.config import settings
from app.core.security import get_password_hash, verify_password, validate_password_strength
from app.models.user import User
from sqlalchemy import select
import logging

logger = logging.getLogger(__name__)

# Credentials that older versions of this project seeded on every fresh database.
LEGACY_DEFAULT_ACCOUNTS = {
    "admin@admin.com": "admin123",
    "tester@example.com": "tester123",
}


async def seed_users():
    """
    Creates the first superuser from FIRST_SUPERUSER_EMAIL / FIRST_SUPERUSER_PASSWORD.

    No default accounts are created any more. If the variables are unset nothing is seeded
    (set them, or create the first admin by hand). Also warns loudly if a legacy default
    account with its well-known password still exists.
    """
    async with AsyncSessionLocal() as db:
        # 1. Flag legacy default credentials left over from earlier seeds
        for email, password in LEGACY_DEFAULT_ACCOUNTS.items():
            user = (await db.execute(select(User).filter(User.email == email))).scalars().first()
            if user and verify_password(password, user.hashed_password):
                logger.critical(
                    "SECURITY: account %s still uses the default password. Change it or deactivate the account.",
                    email,
                )

        # 2. Seed the configured first superuser
        email, password = settings.FIRST_SUPERUSER_EMAIL, settings.FIRST_SUPERUSER_PASSWORD
        if not email or not password:
            logger.warning(
                "FIRST_SUPERUSER_EMAIL/FIRST_SUPERUSER_PASSWORD not set: no user was seeded."
            )
            return
        existing = (await db.execute(select(User).filter(User.email == email))).scalars().first()
        if existing:
            logger.info("First superuser already exists. Skipping seed.")
            return
        try:
            validate_password_strength(password)
        except ValueError as e:
            logger.error("FIRST_SUPERUSER_PASSWORD rejected: %s", e)
            return

        db.add(User(
            email=email,
            hashed_password=get_password_hash(password),
            full_name=settings.FIRST_SUPERUSER_NAME,
            is_superuser=True,
            is_active=True,
        ))
        await db.commit()
        logger.info("Seeded first superuser %s", email)


async def reset_db():
    """
    DANGER: Drops all tables, recreates them, and seeds the configured first superuser.
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
