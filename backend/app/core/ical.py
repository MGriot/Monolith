"""Minimal, spec-careful iCalendar (RFC 5545) writer for the personal calendar feed."""
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable, List, Optional

CRLF = "\r\n"


def escape_text(value: str) -> str:
    """TEXT escaping: backslash, semicolon, comma and newlines; control characters are dropped."""
    out = (value or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
    out = out.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n")
    return "".join(ch for ch in out if ch == "\t" or ord(ch) >= 0x20)


def fold(line: str) -> str:
    """Content lines are limited to 75 OCTETS; continuation lines start with one space. Never split a UTF-8 character."""
    if len(line.encode("utf-8")) <= 75:
        return line
    chunks: List[str] = []
    current = ""
    limit = 75
    for ch in line:
        if len((current + ch).encode("utf-8")) > limit:
            chunks.append(current)
            current, limit = ch, 74  # the leading space of a continuation line counts
        else:
            current += ch
    chunks.append(current)
    return (CRLF + " ").join(chunks)


@dataclass
class Event:
    uid: str
    summary: str
    start: date                      # all-day events: first day
    end_inclusive: date              # last day (DTEND is exclusive in iCalendar, handled here)
    description: str = ""
    url: Optional[str] = None
    status: str = "CONFIRMED"        # CONFIRMED | TENTATIVE | CANCELLED
    modified: Optional[datetime] = None
    categories: Optional[List[str]] = None


def _dt_utc(dt: datetime) -> str:
    return dt.strftime("%Y%m%dT%H%M%SZ")


def build_calendar(name: str, events: Iterable[Event], now: Optional[datetime] = None) -> str:
    now = now or datetime.utcnow()
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Monolith//Planner//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_text(name)}",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
    ]
    for ev in events:
        end_exclusive = ev.end_inclusive + timedelta(days=1)
        lines += [
            "BEGIN:VEVENT",
            f"UID:{ev.uid}",
            f"DTSTAMP:{_dt_utc(now)}",
            f"DTSTART;VALUE=DATE:{ev.start:%Y%m%d}",
            f"DTEND;VALUE=DATE:{end_exclusive:%Y%m%d}",
            f"SUMMARY:{escape_text(ev.summary)}",
            f"STATUS:{ev.status}",
            "TRANSP:TRANSPARENT",
        ]
        if ev.description:
            lines.append(f"DESCRIPTION:{escape_text(ev.description)}")
        if ev.url:
            lines.append(f"URL:{ev.url}")
        if ev.modified:
            lines.append(f"LAST-MODIFIED:{_dt_utc(ev.modified)}")
        if ev.categories:
            lines.append("CATEGORIES:" + ",".join(escape_text(c) for c in ev.categories))
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return CRLF.join(fold(l) for l in lines) + CRLF
