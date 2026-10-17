"""Recurring tasks (rule validation, next occurrence, spawning) and the personal iCalendar feed. Database-free; the real
flows run in backend/tests/live/smoke_recurrence_ics.py."""
import asyncio
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import deps
from app.api.api_v1.endpoints import calendar as cal_mod
from app.core import ical, recurrence
from app.core.config import settings
from app.core.enums import Priority, Status
from app.crud.crud_task import CRUDTask
from app.main import app
from app.schemas.task import TaskCreate, TaskUpdate


def run(coro):
    return asyncio.run(coro)


# ----------------------------------------------------------------------------------------------- rule validation
class TestRuleValidation:
    @pytest.mark.parametrize("rule", [
        "FREQ=DAILY", "FREQ=DAILY;INTERVAL=3", "FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU",
        "FREQ=MONTHLY;BYMONTHDAY=15", "FREQ=MONTHLY;BYMONTHDAY=-1", "FREQ=MONTHLY;BYDAY=1MO", "FREQ=MONTHLY;BYDAY=-1FR",
        "FREQ=YEARLY", "FREQ=DAILY;UNTIL=20261231", "FREQ=DAILY;UNTIL=20261231T235959Z", "RRULE:FREQ=DAILY", "freq=daily;interval=2",
    ])
    def test_valid_rules(self, rule):
        assert recurrence.normalize(rule)

    @pytest.mark.parametrize("rule,why", [
        ("FREQ", "malformed"), ("INTERVAL=2", "FREQ"), ("FREQ=HOURLY", "FREQ"),
        ("FREQ=DAILY;COUNT=5", "unsupported"), ("FREQ=DAILY;BYSETPOS=1", "unsupported"), ("FREQ=DAILY;BYHOUR=3", "unsupported"),
        ("FREQ=DAILY;INTERVAL=0", "INTERVAL"), ("FREQ=DAILY;INTERVAL=366", "INTERVAL"), ("FREQ=DAILY;INTERVAL=x", "INTERVAL"),
        ("FREQ=DAILY;FREQ=WEEKLY", "twice"), ("FREQ=DAILY;BYDAY=MO", "BYDAY"), ("FREQ=WEEKLY;BYDAY=XX", "BYDAY"),
        ("FREQ=WEEKLY;BYDAY=1MO", "ordinals"), ("FREQ=WEEKLY;BYDAY=MO,MO", "twice"), ("FREQ=WEEKLY;BYMONTHDAY=3", "MONTHLY"),
        ("FREQ=MONTHLY;BYMONTHDAY=32", "BYMONTHDAY"), ("FREQ=MONTHLY;BYMONTHDAY=3;BYDAY=MO", "either"),
        ("FREQ=DAILY;UNTIL=tomorrow", "UNTIL"), ("FREQ=DAILY;UNTIL=20261340", "UNTIL"), ("FREQ=DAILY;X=1", "unsupported"),
        ("FREQ=DAILY;" + "INTERVAL=1;" * 40, "long"),
    ])
    def test_invalid_rules_have_clear_errors(self, rule, why):
        with pytest.raises(recurrence.RecurrenceError) as e:
            recurrence.normalize(rule)
        assert why.lower() in str(e.value).lower()

    def test_normalisation_is_canonical(self):
        assert recurrence.normalize("rrule:interval=2;byday=mo,we;freq=weekly") == "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE"
        assert recurrence.normalize(None) is None and recurrence.normalize("  ") is None

    def test_schema_validates_and_normalises(self):
        assert TaskCreate(title="t", recurrence_rule="freq=daily").recurrence_rule == "FREQ=DAILY"
        assert TaskCreate(title="t", recurrence_rule="").recurrence_rule is None
        assert TaskCreate(title="t").recurrence_rule is None
        with pytest.raises(ValidationError):
            TaskCreate(title="t", recurrence_rule="FREQ=DAILY;COUNT=2")
        with pytest.raises(ValidationError):
            TaskUpdate(recurrence_rule="nonsense")
        assert TaskUpdate(recurrence_rule=None).model_dump(exclude_unset=True) == {"recurrence_rule": None}  # explicit clear


# ----------------------------------------------------------------------------------------------- next occurrence
D = datetime


class TestNextOccurrence:
    def test_daily_and_interval(self):
        assert recurrence.next_occurrence("FREQ=DAILY", D(2026, 10, 5, 9)) == D(2026, 10, 6, 9)
        assert recurrence.next_occurrence("FREQ=DAILY;INTERVAL=3", D(2026, 10, 5)) == D(2026, 10, 8)

    def test_weekly_and_byday(self):
        # Monday 2026-10-05
        assert recurrence.next_occurrence("FREQ=WEEKLY", D(2026, 10, 5)) == D(2026, 10, 12)
        assert recurrence.next_occurrence("FREQ=WEEKLY;BYDAY=MO,WE,FR", D(2026, 10, 5)) == D(2026, 10, 7)
        assert recurrence.next_occurrence("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", D(2026, 10, 5)) == D(2026, 10, 19)

    def test_monthly_variants(self):
        assert recurrence.next_occurrence("FREQ=MONTHLY", D(2026, 1, 15)) == D(2026, 2, 15)
        assert recurrence.next_occurrence("FREQ=MONTHLY;BYMONTHDAY=-1", D(2026, 1, 31)) == D(2026, 2, 28)
        assert recurrence.next_occurrence("FREQ=MONTHLY;BYDAY=1MO", D(2026, 10, 5)) == D(2026, 11, 2)
        # RFC semantics: months without a 31st are skipped
        assert recurrence.next_occurrence("FREQ=MONTHLY;BYMONTHDAY=31", D(2026, 1, 31)) == D(2026, 3, 31)

    def test_yearly_including_leap_day(self):
        assert recurrence.next_occurrence("FREQ=YEARLY", D(2026, 10, 5)) == D(2027, 10, 5)
        assert recurrence.next_occurrence("FREQ=YEARLY", D(2024, 2, 29)) == D(2028, 2, 29)

    def test_never_returns_the_base_or_the_past(self):
        base = D(2026, 10, 5, 9)
        assert recurrence.next_occurrence("FREQ=DAILY", base) > base

    def test_finishing_late_skips_missed_occurrences(self):
        # due Mon 5 Oct, completed Thu 8 Oct: next Monday, not 12 Oct... and daily moves past today
        assert recurrence.next_occurrence("FREQ=WEEKLY", D(2026, 10, 5), not_before=D(2026, 10, 8, 14)) == D(2026, 10, 12)
        assert recurrence.next_occurrence("FREQ=DAILY", D(2026, 10, 5), not_before=D(2026, 10, 8, 14)) == D(2026, 10, 9)
        assert recurrence.next_occurrence("FREQ=WEEKLY;INTERVAL=2", D(2026, 10, 5), not_before=D(2026, 11, 20)) == D(2026, 11, 30)

    def test_until_stops_the_series(self):
        assert recurrence.next_occurrence("FREQ=DAILY;UNTIL=20261006", D(2026, 10, 5)) == D(2026, 10, 6)
        assert recurrence.next_occurrence("FREQ=DAILY;UNTIL=20261005", D(2026, 10, 5)) is None
        assert recurrence.next_occurrence("FREQ=WEEKLY;UNTIL=20261010", D(2026, 10, 5)) is None

    def test_timezone_aware_input_is_treated_as_utc(self):
        from datetime import timedelta, timezone

        aware = D(2026, 10, 5, 12, tzinfo=timezone(timedelta(hours=2)))
        assert recurrence.next_occurrence("FREQ=DAILY", aware) == D(2026, 10, 6, 10)

    def test_describe(self):
        assert recurrence.describe(None) == "Does not repeat"
        assert recurrence.describe("FREQ=DAILY") == "Every day"
        assert recurrence.describe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE") == "Every 2 weeks on MO, WE"
        assert recurrence.describe("FREQ=MONTHLY;BYMONTHDAY=-1;UNTIL=20271231") == "Every month on the last day until 2027-12-31"


# ----------------------------------------------------------------------------------------------- spawning
class TestSpawn:
    def done_task(self, **kw):
        base = dict(
            id=uuid4(), title="Weekly report", description="d", project_id=uuid4(), parent_id=None, color=None, topic=None,
            type=None, topic_id=None, type_id=None, priority=Priority.HIGH, is_milestone=False, status=Status.DONE,
            start_date=D(2026, 10, 5), due_date=D(2026, 10, 7), deadline_at=D(2026, 10, 9), duration_days=3, tags=["a"],
            budget=10.0, risk_probability=2, risk_impact=3, optimistic_days=1, normal_days=2, pessimistic_days=4,
            checklist=[{"id": "1", "text": "x", "is_done": True}], recurrence_rule="FREQ=WEEKLY",
            custom_values={"f": "v"}, owner_id=uuid4(), completed_at=D(2026, 10, 7, 16),
            assignees=[SimpleNamespace(id=uuid4())], topics=[SimpleNamespace(id=uuid4())], types=[SimpleNamespace(id=uuid4())],
        )
        base.update(kw)
        return SimpleNamespace(**base)

    def spawn(self, done):
        crud = CRUDTask(MagicMock())
        crud.create = AsyncMock(return_value="created")
        out = run(crud._spawn_next_occurrence(MagicMock(), done))
        return out, crud.create

    def test_next_copy_has_shifted_dates_and_a_fresh_state(self):
        done = self.done_task()
        out, create = self.spawn(done)
        assert out == "created"
        payload = create.await_args.kwargs["obj_in"]
        assert payload.status == Status.TODO and payload.title == "Weekly report" and payload.priority == Priority.HIGH
        # anchored to the due date (Wed 7 Oct): next weekly occurrence is Wed 14 Oct -> everything shifts by 7 days
        assert payload.due_date == D(2026, 10, 14) and payload.start_date == D(2026, 10, 12) and payload.deadline_at == D(2026, 10, 16)
        assert payload.recurrence_rule == "FREQ=WEEKLY" and payload.completed_at is None
        assert payload.checklist == [{"id": "1", "text": "x", "is_done": False}]
        assert payload.assignee_ids == [u.id for u in done.assignees]
        assert payload.topic_ids == [t.id for t in done.topics] and payload.type_ids == [t.id for t in done.types]
        assert payload.custom_values == {"f": "v"} and payload.project_id == done.project_id
        assert create.await_args.kwargs["owner_id"] == done.owner_id

    def test_the_original_task_is_not_touched(self):
        done = self.done_task()
        before = dict(vars(done))
        self.spawn(done)
        assert vars(done) == before

    def test_late_completion_does_not_create_an_overdue_copy(self):
        done = self.done_task(recurrence_rule="FREQ=DAILY", completed_at=D(2026, 10, 12, 10))  # due 7 Oct, done 12 Oct
        _, create = self.spawn(done)
        assert create.await_args.kwargs["obj_in"].due_date > D(2026, 10, 12, 10)

    def test_task_without_dates_gets_a_due_date_from_the_rule(self):
        done = self.done_task(start_date=None, due_date=None, deadline_at=None, completed_at=D(2026, 10, 7, 16))
        _, create = self.spawn(done)
        payload = create.await_args.kwargs["obj_in"]
        assert payload.due_date == D(2026, 10, 14) and payload.start_date is None

    def test_an_expired_series_creates_nothing(self):
        out, create = self.spawn(self.done_task(recurrence_rule="FREQ=WEEKLY;UNTIL=20261008"))
        assert out is None
        create.assert_not_awaited()

    def test_an_unusable_stored_rule_is_ignored_not_fatal(self):
        out, create = self.spawn(self.done_task(recurrence_rule="COUNT=3"))
        assert out is None
        create.assert_not_awaited()


# ----------------------------------------------------------------------------------------------- iCalendar writer
class TestIcal:
    def test_text_escaping(self):
        assert ical.escape_text("a,b;c\\d\ne") == "a\\,b\\;c\\\\d\\ne"
        assert ical.escape_text("x\x00y\x07z") == "xyz"
        assert ical.escape_text("tab\tkept") == "tab\tkept"

    def test_lines_are_folded_at_75_octets_without_splitting_characters(self):
        line = "SUMMARY:" + "é" * 100            # 2 bytes each
        folded = ical.fold(line)
        parts = folded.split("\r\n")
        assert all(len(p.encode("utf-8")) <= 75 for p in parts)
        assert all(p.startswith(" ") for p in parts[1:])
        assert "".join([parts[0]] + [p[1:] for p in parts[1:]]) == line
        assert ical.fold("short") == "short"

    def test_calendar_structure(self):
        ev = ical.Event(uid="task-1@monolith", summary="Ship, it; now", start=date(2026, 10, 5), end_inclusive=date(2026, 10, 7),
                        description="line1\nline2", url="http://x/t", modified=D(2026, 10, 1, 12), categories=["P", "Todo"])
        text = ical.build_calendar("My cal", [ev], now=D(2026, 10, 2, 8))
        assert text.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") and text.endswith("END:VCALENDAR\r\n")
        assert "\n" not in text.replace("\r\n", "")
        for expected in ("UID:task-1@monolith", "DTSTART;VALUE=DATE:20261005", "DTEND;VALUE=DATE:20261008",   # DTEND is exclusive
                         "SUMMARY:Ship\\, it\\; now", "DESCRIPTION:line1\\nline2", "URL:http://x/t",
                         "LAST-MODIFIED:20261001T120000Z", "DTSTAMP:20261002T080000Z", "CATEGORIES:P,Todo", "X-WR-CALNAME:My cal"):
            assert expected in text, expected
        assert text.count("BEGIN:VEVENT") == text.count("END:VEVENT") == 1

    def test_single_day_event_ends_the_next_day(self):
        text = ical.build_calendar("c", [ical.Event(uid="u", summary="s", start=date(2026, 12, 31), end_inclusive=date(2026, 12, 31))])
        assert "DTSTART;VALUE=DATE:20261231" in text and "DTEND;VALUE=DATE:20270101" in text

    def test_empty_calendar_is_valid(self):
        text = ical.build_calendar("c", [])
        assert "BEGIN:VCALENDAR" in text and "VEVENT" not in text


# ----------------------------------------------------------------------------------------------- feed endpoint + tokens
class FakeDB:
    def __init__(self, user=None, tasks=()):
        self.user, self.tasks, self.calls = user, list(tasks), 0

    async def execute(self, stmt):
        self.calls += 1
        if self.calls == 1:
            return SimpleNamespace(scalars=lambda: SimpleNamespace(first=lambda: self.user))
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: self.tasks))

    async def commit(self):
        pass

    def add(self, _):
        pass


def feed_task(**kw):
    base = dict(
        id=uuid4(), title="Fix <it>; now", description="body", project_id=uuid4(), project=SimpleNamespace(name="Apollo"),
        status=Status.TODO, priority=Priority.HIGH, start_date=D(2026, 10, 5), due_date=D(2026, 10, 7),
        updated_at=D(2026, 10, 1), is_archived=False,
    )
    base.update(kw)
    return SimpleNamespace(**base)


@pytest.fixture
def feed_client():
    holder = SimpleNamespace(db=FakeDB())

    async def fake_db():
        yield holder.db

    app.dependency_overrides[deps.get_db] = fake_db
    cal_mod.feed_failures.__init__(30, 3600)
    yield holder, TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


class TestFeedEndpoint:
    def test_unknown_token_is_404_and_throttled(self, feed_client):
        holder, c = feed_client
        holder.db = FakeDB(user=None)
        assert c.get("/api/v1/calendar/feed/nope.ics").status_code == 404
        for _ in range(35):
            holder.db = FakeDB(user=None)
            last = c.get("/api/v1/calendar/feed/guess.ics")
        assert last.status_code == 429 and int(last.headers["retry-after"]) > 0

    def test_valid_token_returns_a_calendar_with_safe_headers(self, feed_client):
        holder, c = feed_client
        user = SimpleNamespace(id=uuid4(), full_name="Eve", email="eve@example.com")
        t = feed_task()
        holder.db = FakeDB(user=user, tasks=[t])
        r = c.get("/api/v1/calendar/feed/secret.ics")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/calendar")
        assert r.headers["cache-control"].startswith("private") and r.headers["x-robots-tag"] == "noindex"
        body = r.text.replace("\r\n ", "")  # unfold
        assert "X-WR-CALNAME:Monolith - Eve" in body
        assert f"UID:task-{t.id}@monolith" in body
        assert "SUMMARY:Fix <it>\\; now" in body
        assert "DTSTART;VALUE=DATE:20261005" in body and "DTEND;VALUE=DATE:20261008" in body
        assert "Project: Apollo" in body and f"/projects/{t.project_id}?task_id={t.id}" in body

    def test_due_date_only_and_independent_tasks(self, feed_client):
        holder, c = feed_client
        user = SimpleNamespace(id=uuid4(), full_name=None, email="eve@example.com")
        t = feed_task(start_date=None, project_id=None, project=None, due_date=D(2026, 10, 9))
        holder.db = FakeDB(user=user, tasks=[t])
        body = c.get("/api/v1/calendar/feed/secret.ics").text.replace("\r\n ", "")
        assert "DTSTART;VALUE=DATE:20261009" in body and "DTEND;VALUE=DATE:20261010" in body
        assert f"/tasks?task_id={t.id}" in body and "X-WR-CALNAME:Monolith - eve@example.com" in body

    def test_done_tasks_are_marked(self, feed_client):
        holder, c = feed_client
        holder.db = FakeDB(user=SimpleNamespace(id=uuid4(), full_name="E", email="e@e.com"), tasks=[feed_task(status=Status.DONE)])
        assert "SUMMARY:✓ Fix" in c.get("/api/v1/calendar/feed/secret.ics?include_done=true").text

    def test_query_is_scoped_to_the_user_and_hides_done_by_default(self, feed_client):
        holder, c = feed_client
        seen = []

        class SpyDB(FakeDB):
            async def execute(self, stmt):
                seen.append(str(stmt))
                return await super().execute(stmt)

        holder.db = SpyDB(user=SimpleNamespace(id=uuid4(), full_name="E", email="e@e.com"), tasks=[])
        c.get("/api/v1/calendar/feed/secret.ics")
        sql = seen[1]
        assert "task_assignees" in sql and "is_archived" in sql and "tasks.status !=" in sql and "LIMIT" in sql.upper()
        seen.clear()
        holder.db = SpyDB(user=SimpleNamespace(id=uuid4(), full_name="E", email="e@e.com"), tasks=[])
        c.get("/api/v1/calendar/feed/secret.ics?include_done=true")
        assert "tasks.status !=" not in seen[1]


class TestTokenManagement:
    @pytest.fixture
    def me(self):
        self.user = SimpleNamespace(
            id=uuid4(), email="eve@example.com", full_name="Eve", is_active=True, is_superuser=False,
            calendar_token=None, email_verified_at=None, notify_email_assignments=True, notify_email_digest=True,
        )
        db = FakeDB()

        async def fake_db():
            yield db

        app.dependency_overrides[deps.get_db] = fake_db
        app.dependency_overrides[deps.get_current_user] = lambda: self.user
        yield TestClient(app, raise_server_exceptions=False)
        app.dependency_overrides.clear()

    def test_lifecycle(self, me):
        assert me.get("/api/v1/users/me/calendar-feed").json() == {"enabled": False, "url": None}
        first = me.post("/api/v1/users/me/calendar-feed").json()
        assert first["enabled"] and first["url"].startswith(settings.APP_BASE_URL.rstrip("/") + "/api/v1/calendar/feed/")
        assert first["url"].endswith(".ics") and len(self.user.calendar_token) >= 40
        assert me.get("/api/v1/users/me/calendar-feed").json() == first
        second = me.post("/api/v1/users/me/calendar-feed").json()
        assert second["url"] != first["url"]                       # rotating replaces the secret
        assert me.delete("/api/v1/users/me/calendar-feed").status_code == 204
        assert self.user.calendar_token is None
        assert me.get("/api/v1/users/me/calendar-feed").json()["enabled"] is False

    def test_token_never_appears_in_the_profile(self, me):
        me.post("/api/v1/users/me/calendar-feed")
        assert self.user.calendar_token not in me.get("/api/v1/users/me").text

    def test_requires_login(self):
        app.dependency_overrides.clear()
        c = TestClient(app, raise_server_exceptions=False)
        assert c.get("/api/v1/users/me/calendar-feed").status_code == 401
        assert c.post("/api/v1/users/me/calendar-feed").status_code == 401
        assert c.delete("/api/v1/users/me/calendar-feed").status_code == 401
