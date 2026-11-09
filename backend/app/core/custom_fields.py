"""Validation of custom-field definitions and values (pure, no database).

`projects.custom_values` and `tasks.custom_values` are JSON objects keyed by the definition id (stable across
renames). A definition with `applies_to='project'` has its values on projects, `'task'` on tasks. Accepted JSON
value per type:

  text      string
  number    int or float (not bool, not NaN/inf); honours min_value / max_value, rounded to `decimals`
  currency  same as number; shown with the definition's currency (or the instance CURRENCY)
  select    string that is one of the definition's options
  date      ISO-8601 date or datetime string (normalised to YYYY-MM-DD / ISO datetime)
  user      UUID string (existence is checked by the caller)
  checkbox  true / false
  url       absolute http(s) URL

`null` clears a value. Unknown keys are rejected.
"""
import math
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Optional, Set
from urllib.parse import urlsplit
from uuid import UUID

FIELD_TYPES = ("text", "number", "currency", "select", "date", "user", "checkbox", "url")
NUMERIC_TYPES = ("number", "currency")
APPLIES_TO = ("project", "task")
MAX_TEXT_LENGTH = 5000
MAX_URL_LENGTH = 2048
MAX_OPTIONS = 100
MAX_DECIMALS = 6
MAX_UNIT_LENGTH = 32
CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


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


@dataclass
class NumberSettings:
    unit: Optional[str] = None
    currency: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    decimals: Optional[int] = None


def normalize_number_settings(
    field_type: str,
    unit: Optional[str] = None,
    currency: Optional[str] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    decimals: Optional[int] = None,
) -> NumberSettings:
    """Check the unit / currency / limits of a definition against its type. Non-numeric types carry none of them."""
    unit = (unit or "").strip() or None
    currency = (currency or "").strip().upper() or None
    if field_type not in NUMERIC_TYPES:
        if any(v is not None for v in (unit, currency, min_value, max_value, decimals)):
            raise ValueError("Unit, currency, limits and decimals apply to number and currency fields only")
        return NumberSettings()
    if unit is not None:
        if field_type != "number":
            raise ValueError("A currency field takes a currency code, not a unit")
        if len(unit) > MAX_UNIT_LENGTH:
            raise ValueError(f"The unit can be at most {MAX_UNIT_LENGTH} characters")
    if currency is not None:
        if field_type != "currency":
            raise ValueError("Only currency fields have a currency")
        if not CURRENCY_RE.match(currency):
            raise ValueError("The currency must be a 3-letter ISO 4217 code such as EUR")
    for label, v in (("minimum", min_value), ("maximum", max_value)):
        if v is not None and (isinstance(v, bool) or not math.isfinite(v)):
            raise ValueError(f"The {label} must be a finite number")
    if min_value is not None and max_value is not None and min_value > max_value:
        raise ValueError("The minimum cannot be greater than the maximum")
    if decimals is not None and not 0 <= decimals <= MAX_DECIMALS:
        raise ValueError(f"Decimals must be between 0 and {MAX_DECIMALS}")
    return NumberSettings(unit, currency, min_value, max_value, decimals)


def _validate_number(field, value: Any) -> Any:
    name = field.name
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"'{name}' must be a number")
    decimals = getattr(field, "decimals", None)
    if decimals is not None:
        value = round(value, decimals)
        if decimals == 0:
            value = int(value)
    lo, hi = getattr(field, "min_value", None), getattr(field, "max_value", None)
    if lo is not None and value < lo:
        raise ValueError(f"'{name}' must be at least {lo:g}")
    if hi is not None and value > hi:
        raise ValueError(f"'{name}' must be at most {hi:g}")
    return value


def validate_value(field, value: Any) -> Any:
    """Validate one value against a definition (object with .name/.field_type/.options...). Returns the stored form."""
    t, name = field.field_type, field.name
    if t == "text":
        if not isinstance(value, str):
            raise ValueError(f"'{name}' must be text")
        if len(value) > MAX_TEXT_LENGTH:
            raise ValueError(f"'{name}' is longer than {MAX_TEXT_LENGTH} characters")
        return value
    if t in NUMERIC_TYPES:
        return _validate_number(field, value)
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
    if t == "checkbox":
        if not isinstance(value, bool):
            raise ValueError(f"'{name}' must be true or false")
        return value
    if t == "url":
        if not isinstance(value, str):
            raise ValueError(f"'{name}' must be a link")
        value = value.strip()
        parts = urlsplit(value)
        if len(value) > MAX_URL_LENGTH or parts.scheme not in ("http", "https") or not parts.netloc:
            raise ValueError(f"'{name}' must be an http(s) link")
        return value
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


def export_label(field, currency: Optional[str] = None) -> str:
    """Column header for a field in exports: the name plus its unit or currency, e.g. "Effort (h)"."""
    suffix = field.unit if field.field_type == "number" else None
    if field.field_type == "currency":
        suffix = field.currency or currency
    return f"{field.name} ({suffix})" if suffix else field.name


def export_columns(defs: Iterable, values: Optional[Dict[str, Any]], currency: Optional[str] = None) -> Dict[str, Any]:
    """Stored values as export cells, keyed by `export_label` (ids mean nothing in a spreadsheet).

    Every definition gets a column, blank when unset, so rows line up. Checkboxes read Yes / No.
    """
    values = values or {}
    out: Dict[str, Any] = {}
    for d in defs:
        v = values.get(str(d.id))
        if d.field_type == "checkbox" and v is not None:
            v = "Yes" if v else "No"
        out[export_label(d, currency)] = "" if v is None else v
    return out
