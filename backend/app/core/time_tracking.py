"""Pure helpers for time tracking (no database)."""
from datetime import datetime
from typing import Optional

WORKDAY_HOURS = 8.0


def entry_seconds(started_at: datetime, ended_at: Optional[datetime], now: Optional[datetime] = None) -> int:
    """Length of an entry in whole seconds; a running entry counts up to `now`. Never negative."""
    end = ended_at if ended_at is not None else (now or datetime.utcnow())
    return max(0, int((end - started_at).total_seconds()))


def estimate_hours(expected_duration_days: float, duration_days: Optional[int]) -> float:
    """Estimate from the task's PERT expected duration, falling back to its planned duration, in working hours."""
    days = expected_duration_days or float(duration_days or 0)
    return round(days * WORKDAY_HOURS, 2)


def estimate_vs_actual(estimate_h: float, actual_seconds: int) -> dict:
    actual_h = round(actual_seconds / 3600.0, 2)
    return {
        "estimate_hours": estimate_h,
        "actual_hours": actual_h,
        "variance_hours": round(actual_h - estimate_h, 2),
        # None when there is no estimate to compare against
        "percent_of_estimate": round(actual_h / estimate_h * 100.0, 1) if estimate_h > 0 else None,
    }
