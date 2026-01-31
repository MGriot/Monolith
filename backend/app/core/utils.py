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

def clean_dict_datetimes(data: Any) -> Any:
    """
    Recursively clean all datetime objects in a dictionary or list to be naive.
    """
    if isinstance(data, dict):
        return {k: clean_dict_datetimes(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [clean_dict_datetimes(v) for v in data]
    elif isinstance(data, datetime):
        return make_naive(data)
    else:
        return data
