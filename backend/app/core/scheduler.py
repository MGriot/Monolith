"""Scheduled jobs: weekly digest (Monday 08:00 UTC) and daily deadline reminders (07:00 UTC).

State lives in the database (`job_runs`) instead of a file next to the code, and a slot is claimed with one atomic
UPDATE, so several workers/containers never run the same job twice and a restart never re-sends or skips it.
Jobs are at-most-once per slot: if one crashes after claiming, that slot is skipped (and logged) rather than
spamming everybody on the next start.
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Awaitable, Callable, Optional

from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.email_outbox import JobRun

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Job:
    name: str
    hour: int                                   # UTC
    weekday: Optional[int]                      # 0 = Monday; None = every day
    run: Callable[[AsyncSession], Awaitable[None]]


async def _weekly_digest(db: AsyncSession) -> None:
    from app.core.summaries import SummaryGenerator

    await SummaryGenerator(db).dispatch_all_summaries()


async def _deadline_reminders(db: AsyncSession) -> None:
    from app.core.reports import notify_near_deadlines

    await notify_near_deadlines(db)


JOBS = (
    Job("weekly_digest", hour=8, weekday=0, run=_weekly_digest),
    Job("deadline_reminders", hour=7, weekday=None, run=_deadline_reminders),
)


def latest_slot(now: datetime, hour: int, weekday: Optional[int]) -> datetime:
    """The most recent moment <= now at `hour`:00 UTC (on `weekday` if given)."""
    slot = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if slot > now:
        slot -= timedelta(days=1)
    if weekday is not None:
        while slot.weekday() != weekday:
            slot -= timedelta(days=1)
    return slot


async def claim_slot(db: AsyncSession, name: str, slot: datetime) -> bool:
    """True for exactly one caller per (job, slot).

    The first time a job is ever seen its current slot is recorded as already done, so installing or upgrading on a
    Wednesday does not fire the Monday digest.
    """
    await db.execute(pg_insert(JobRun).values(name=name, last_run_at=slot).on_conflict_do_nothing(index_elements=["name"]))
    won = (
        await db.execute(
            update(JobRun).where(JobRun.name == name, JobRun.last_run_at < slot).values(last_run_at=slot).returning(JobRun.name)
        )
    ).first() is not None
    await db.commit()
    return won


async def run_due_jobs(now: Optional[datetime] = None) -> list:
    """One scheduler tick. Returns the names of the jobs that ran."""
    now = now or datetime.utcnow()
    ran = []
    async with AsyncSessionLocal() as db:
        for job in JOBS:
            if await claim_slot(db, job.name, latest_slot(now, job.hour, job.weekday)):
                logger.info("Running scheduled job %s", job.name)
                try:
                    await job.run(db)
                    ran.append(job.name)
                except Exception:  # noqa: BLE001
                    logger.exception("Scheduled job %s failed", job.name)
                    await db.rollback()
    return ran


async def run_scheduler(interval_seconds: int = 60) -> None:
    logger.info("Scheduler started (%s)", ", ".join(j.name for j in JOBS))
    while True:
        try:
            await run_due_jobs()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("Scheduler tick failed")
        await asyncio.sleep(interval_seconds)
