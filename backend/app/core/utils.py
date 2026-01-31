from datetime import datetime, timezone
from typing import Optional, Any

def make_naive(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Ensure a datetime is offset-naive (removes tzinfo).
    Required for PostgreSQL TIMESTAMP WITHOUT TIME ZONE columns when using asyncpg.
    """
    if dt is not None and dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt

def clean_dict_datetimes(data: dict) -> dict:
    """
    Recursively clean all datetime objects in a dictionary to be naive.
    """
    for key, value in data.items():
        if isinstance(value, datetime):
            data[key] = make_naive(value)
        elif isinstance(value, list):
            data[key] = [make_naive(v) if isinstance(v, datetime) else v for v in value]
    return data
