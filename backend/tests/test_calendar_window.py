"""GET /calendar/ always queries a bounded window (PERF-10): explicit ranges as sent, otherwise 90 days back to a year
ahead. Database-free; the visibility rule itself is covered in test_db_integration.py."""
import asyncio
from datetime import date, datetime, time, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

from app.api.api_v1.endpoints import calendar as cal_mod
from app.api.api_v1.endpoints.calendar import calendar_window

TODAY = date(2026, 10, 23)


class TestCalendarWindow:
    def test_no_range_is_90_days_back_to_one_year_ahead(self):
        start, end = calendar_window(None, None, today=TODAY)
        assert start == datetime(2026, 7, 25, 0, 0)
        assert end == datetime.combine(date(2027, 10, 23), time.max)

    def test_explicit_range_is_kept_as_sent(self):
        s, e = datetime(2020, 1, 1), datetime(2030, 12, 31, 12, 30)
        assert calendar_window(s, e, today=TODAY) == (s, e)

    def test_only_start_gives_a_window_from_it(self):
        s = datetime(2031, 1, 1)
        assert calendar_window(s, None, today=TODAY) == (s, datetime(2032, 3, 31))

    def test_only_end_gives_a_window_up_to_it(self):
        e = datetime(2025, 3, 31)
        assert calendar_window(None, e, today=TODAY) == (datetime(2024, 1, 1), e)

    def test_defaults_to_the_current_day(self):
        start, end = calendar_window(None, None)
        assert start.date() < datetime.now(timezone.utc).date() < end.date()


class TestEndpointUsesTheWindow:
    def _params(self, **query):
        statements = []

        async def execute(stmt):
            statements.append(stmt)
            result = MagicMock()
            result.scalars.return_value.all.return_value = []
            return result

        db = SimpleNamespace(execute=execute)
        user = SimpleNamespace(id=uuid4(), is_superuser=True)
        out = asyncio.run(cal_mod.get_calendar_events(db=db, current_user=user, **query))
        assert out == {"items": []}
        assert len(statements) == 2  # projects, tasks
        return [set(s.compile().params.values()) for s in statements]

    def test_no_range_still_filters_projects_and_tasks(self):
        start, end = calendar_window(None, None)
        for params in self._params(start_date=None, end_date=None):
            assert start in params and end in params

    def test_explicit_range_is_passed_through(self):
        s, e = datetime(2020, 1, 1), datetime(2030, 12, 31)
        for params in self._params(start_date=s, end_date=e):
            assert s in params and e in params
