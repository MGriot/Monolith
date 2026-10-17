"""Validation of task custom-field values against a project's field definitions (pure, no database).

`tasks.custom_values` is a JSON object keyed by the definition id (stable across renames). Accepted JSON value per type:

  text    string
  number  int or float (not bool, not NaN/inf)
  select  string that is one of the definition's options
  date    ISO-8601 date or datetime string (normalised to YYYY-MM-DD / ISO datetime)
  user    UUID string (existence is checked by the caller)

`null` clears a value. Unknown keys are rejected.
"""
import math
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Set
from uuid import UUID

FIELD_TYPES = ("text", "number", "select", "date", "user")
MAX_TEXT_LENGTH = 5000
MAX_OPTIONS = 100


def normalize_options(field_type: str, options: Iterable[str]) -> List[str]:
    """Trim, drop blanks and duplicates (keeping order). Only `select` carries options."""
    if field_type != "select":
        return []
    seen, out = set(), []
    for opt in options or []:
        opt = str(opt).strip()
        if opt and opt not in seen:
            seen.add(opt)
            out.append(opt)
    if not out:
        raise ValueError("A select field needs at least one option")
    if len(out) > MAX_OPTIONS:
        raise ValueError(f"A select field can have at most {MAX_OPTIONS} options")
    return out


def validate_value(field, value: Any) -> Any:
    """Validate one value against a definition (object with .name/.field_type/.options). Returns the stored form."""
    t, name = field.field_type, field.name
    if t == "text":
        if not isinstance(value, str):
            raise ValueError(f"'{name}' must be text")
        if len(value) > MAX_TEXT_LENGTH:
            raise ValueError(f"'{name}' is longer than {MAX_TEXT_LENGTH} characters")
        return value
    if t == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"'{name}' must be a number")
        return value
    if t == "select":
        if not isinstance(value, str) or value not in (field.options or []):
            raise ValueError(f"'{name}' must be one of: {', '.join(field.options or [])}")
        return value
    if t == "date":
        if not isinstance(value, str):
            raise ValueError(f"'{name}' must be an ISO date")
        try:
            if len(value) == 10:
                return date.fromisoformat(value).isoformat()
            return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
        except ValueError:
            raise ValueError(f"'{name}' must be an ISO date (YYYY-MM-DD)") from None
    if t == "user":
        try:
            if not isinstance(value, str):
                raise ValueError
            return str(UUID(value))
        except ValueError:
            raise ValueError(f"'{name}' must be a user id") from None
    raise ValueError(f"Unknown field type '{t}'")


def validate_custom_values(defs: Iterable, values: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a whole `custom_values` object. Returns the cleaned dict (nulls dropped) or raises ValueError."""
    if not isinstance(values, dict):
        raise ValueError("custom_values must be an object")
    by_id = {str(d.id): d for d in defs}
    cleaned: Dict[str, Any] = {}
    for key, value in values.items():
        field = by_id.get(str(key))
        if field is None:
            raise ValueError(f"Unknown custom field '{key}' for this project")
        if value is None:
            continue
        cleaned[str(key)] = validate_value(field, value)
    return cleaned


def user_ids_in(defs: Iterable, cleaned: Dict[str, Any]) -> Set[UUID]:
    """User ids referenced by `user` fields in already-validated values."""
    user_fields = {str(d.id) for d in defs if d.field_type == "user"}
    return {UUID(v) for k, v in cleaned.items() if k in user_fields}
