"""Apply Alembic migrations at start-up.

* Empty database           -> `upgrade head` creates everything.
* Database created before Alembic existed (by `metadata.create_all()`, i.e. has tables but no
  `alembic_version`) -> stamped at the baseline revision, then upgraded, so only newer migrations run.
* Already versioned        -> normal `upgrade head`.

A Postgres advisory lock serialises concurrent start-ups (several replicas/workers booting together).
Set AUTO_MIGRATE=false to manage migrations yourself with the `alembic` CLI.
"""
import asyncio
import logging
import os

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from app.db.session import engine

logger = logging.getLogger(__name__)

BASELINE_REVISION = "0001"
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_LOCK_KEY = 7_272_740_001  # arbitrary, app-wide constant


def _alembic_config() -> Config:
    cfg = Config(os.path.join(_BACKEND_ROOT, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(_BACKEND_ROOT, "migrations"))
    cfg.attributes["skip_logging_config"] = True  # do not let alembic reconfigure the app's logging
    return cfg


async def upgrade_database() -> None:
    cfg = _alembic_config()
    async with engine.connect() as lock_conn:
        await lock_conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": _LOCK_KEY})
        try:
            tables = await lock_conn.run_sync(lambda c: set(inspect(c).get_table_names()))
            if "alembic_version" not in tables and "tasks" in tables:
                logger.warning("Unversioned database found: stamping baseline revision %s", BASELINE_REVISION)
                await asyncio.to_thread(command.stamp, cfg, BASELINE_REVISION)
            # env.py drives its own event loop, so it must run outside ours
            await asyncio.to_thread(command.upgrade, cfg, "head")
            logger.info("Database schema is up to date")
        finally:
            await lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _LOCK_KEY})
            await lock_conn.commit()
