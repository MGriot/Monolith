import asyncio
import logging
import os
from datetime import datetime, timedelta
from app.db.session import AsyncSessionLocal
from app.core.summaries import SummaryGenerator

logger = logging.getLogger(__name__)

LAST_RUN_FILE = "last_summary_run.txt"

def get_last_run_week():
    if os.path.exists(LAST_RUN_FILE):
        with open(LAST_RUN_FILE, "r") as f:
            return f.read().strip()
    return ""

def save_last_run_week(week_str: str):
    with open(LAST_RUN_FILE, "w") as f:
        f.write(week_str)

async def weekly_summary_task():
    """
    Background task that checks if it's Monday 08:00 UTC and dispatches summaries.
    """
    logger.info("Weekly summary scheduler started.")
    while True:
        now = datetime.utcnow()
        # Monday is 0, 08:00 UTC
        current_week = now.strftime("%Y-W%W")
        
        if now.weekday() == 0 and now.hour == 8:
            if get_last_run_week() != current_week:
                logger.info(f"Triggering weekly summary dispatch for {current_week}")
                async with AsyncSessionLocal() as db:
                    generator = SummaryGenerator(db)
                    try:
                        await generator.dispatch_all_summaries()
                        save_last_run_week(current_week)
                    except Exception as e:
                        logger.error(f"Error during weekly summary dispatch: {e}")
            else:
                logger.debug(f"Weekly summary for {current_week} already sent.")
        
        # Check every hour
        await asyncio.sleep(3600)

def start_scheduler():
    loop = asyncio.get_event_loop()
    loop.create_task(weekly_summary_task())
