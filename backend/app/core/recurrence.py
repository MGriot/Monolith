"""Recurring tasks: a small, strictly validated subset of RFC 5545 RRULE.

Supported parts:  FREQ (DAILY|WEEKLY|MONTHLY|YEARLY, required), INTERVAL (1-365), BYDAY (MO..SU; with an ordinal like
1MO / -1FR for MONTHLY only), BYMONTHDAY (MONTHLY only, 1-31 or -1), UNTIL (YYYYMMDD or YYYYMMDDTHHMMSS[Z]).
Anything else (COUNT, BYSETPOS, BYHOUR, ...) is rejected with a clear message instead of being half-understood.

Semantics are the RFC's: "every month on day 31" skips months that have no 31st.
When a recurring task is completed, the next occurrence is created strictly after BOTH the task's own date and the
completion time, so finishing a daily task three days late does not produce three overdue copies.
"""
import re
from datetime import datetime, timezone
from typing import Dict, Optional

from dateutil.rrule import rrulestr

MAX_RULE_LENGTH = 200
FREQS = ("DAILY", "WEEKLY", "MONTHLY", "YEARLY")
_WEEKDAY = r"(?:MO|TU|WE|TH|FR|SA|SU)"
_BYDAY_PLAIN = re.compile(rf"^{_WEEKDAY}$")
_BYDAY_ORDINAL = re.compile(rf"^[+-]?[1-5]{_WEEKDAY}$")
_UNTIL = re.compile(r"^\d{8}(T\d{6}Z?)?$")


class RecurrenceError(ValueError):
    pass


def _parse_until(value: str) -> datetime:
    if not _UNTIL.match(value):
        raise RecurrenceError("UNTIL must look like 20261231 or 20261231T235959Z")
    try:
        if "T" in value:
            return datetime.strptime(value.rstrip("Z"), "%Y%m%dT%H%M%S")
        return datetime.strptime(value, "%Y%m%d").replace(hour=23, minute=59, second=59)
    except ValueError:
        raise RecurrenceError("UNTIL is not a valid date")


def parse_rule(rule: str) -> Dict[str, str]:
    """Validate and return the parts (upper-cased keys). Raises RecurrenceError."""
    rule = (rule or "").strip()
    if rule.upper().startswith("RRULE:"):
        rule = rule[6:]
    if not rule:
        raise RecurrenceError("empty recurrence rule")
    if len(rule) > MAX_RULE_LENGTH:
        raise RecurrenceError("recurrence rule is too long")

    parts: Dict[str, str] = {}
    for chunk in rule.split(";"):
        if "=" not in chunk:
            raise RecurrenceError(f"malformed part: {chunk!r}")
        key, value = chunk.split("=", 1)
        key, value = key.strip().upper(), value.strip().upper()
        if key in parts:
            raise RecurrenceError(f"{key} given twice")
        if not value:
            raise RecurrenceError(f"{key} has no value")
        parts[key] = value

    unsupported = set(parts) - {"FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "UNTIL"}
    if unsupported:
        raise RecurrenceError(f"unsupported part(s): {', '.join(sorted(unsupported))} (supported: FREQ, INTERVAL, BYDAY, BYMONTHDAY, UNTIL)")
    freq = parts.get("FREQ")
    if freq not in FREQS:
        raise RecurrenceError("FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY")

    if "INTERVAL" in parts:
        if not parts["INTERVAL"].isdigit() or not 1 <= int(parts["INTERVAL"]) <= 365:
            raise RecurrenceError("INTERVAL must be a number from 1 to 365")

    if "BYDAY" in parts:
        days = parts["BYDAY"].split(",")
        if freq not in ("WEEKLY", "MONTHLY"):
            raise RecurrenceError("BYDAY is only supported with WEEKLY or MONTHLY")
        for d in days:
            ok = _BYDAY_PLAIN.match(d) or (freq == "MONTHLY" and _BYDAY_ORDINAL.match(d))
            if not ok:
                raise RecurrenceError(f"invalid BYDAY value {d!r}" + ("" if freq == "MONTHLY" else " (ordinals like 1MO are MONTHLY only)"))
        if len(set(days)) != len(days):
            raise RecurrenceError("BYDAY lists a day twice")

    if "BYMONTHDAY" in parts:
        if freq != "MONTHLY":
            raise RecurrenceError("BYMONTHDAY is only supported with MONTHLY")
        if parts["BYMONTHDAY"] != "-1" and not (parts["BYMONTHDAY"].isdigit() and 1 <= int(parts["BYMONTHDAY"]) <= 31):
            raise RecurrenceError("BYMONTHDAY must be 1-31 or -1 (last day)")
        if "BYDAY" in parts:
            raise RecurrenceError("use either BYDAY or BYMONTHDAY, not both")

    if "UNTIL" in parts:
        _parse_until(parts["UNTIL"])
    return parts


def normalize(rule: Optional[str]) -> Optional[str]:
    """Canonical form (fixed part order, upper case, no RRULE: prefix); None for blank input. Raises RecurrenceError."""
    if rule is None or not str(rule).strip():
        return None
    parts = parse_rule(str(rule))
    order = ("FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "UNTIL")
    return ";".join(f"{k}={parts[k]}" for k in order if k in parts)


def _naive_utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def next_occurrence(rule: str, base: datetime, not_before: Optional[datetime] = None) -> Optional[datetime]:
    """The first occurrence strictly after max(base, not_before), at base's time of day; None when UNTIL has passed.

    `base` is the date the rule is anchored to (the completed task's due/start date).
    """
    parts = parse_rule(rule)
    base = _naive_utc(base)
    after = max(base, _naive_utc(not_before)) if not_before else base
    rr = rrulestr(normalize(rule), dtstart=base)
    nxt = rr.after(after, inc=False)
    if nxt is None:
        return None
    if "UNTIL" in parts and nxt > _parse_until(parts["UNTIL"]):
        return None
    return nxt


def describe(rule: Optional[str]) -> str:
    """Human readable summary for the UI/e-mails, e.g. 'Every 2 weeks on MO, WE'."""
    if not rule:
        return "Does not repeat"
    parts = parse_rule(rule)
    interval = int(parts.get("INTERVAL", "1"))
    unit = {"DAILY": "day", "WEEKLY": "week", "MONTHLY": "month", "YEARLY": "year"}[parts["FREQ"]]
    text = f"Every {unit}" if interval == 1 else f"Every {interval} {unit}s"
    if "BYDAY" in parts:
        text += f" on {parts['BYDAY'].replace(',', ', ')}"
    if "BYMONTHDAY" in parts:
        text += " on the last day" if parts["BYMONTHDAY"] == "-1" else f" on day {parts['BYMONTHDAY']}"
    if "UNTIL" in parts:
        u = _parse_until(parts["UNTIL"])
        text += f" until {u:%Y-%m-%d}"
    return text
