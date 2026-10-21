"""Tier-1 backend behaviour that does not need a database: search, bulk notification update, dependency graph scoping,
pagination caps. (The SQL itself runs against PostgreSQL in the live suites described in docs/guide/08-administration.html#migrations.)"""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql

from app.api import deps
from app.main import app


def run(coro):
    return asyncio.run(coro)


class RecordingDB:
    """Fake AsyncSession: records every statement and returns empty results (or scripted ones)."""

    def __init__(self, scripted=None):
        self.statements = []
        self.scripted = list(scripted or [])
        self.committed = False
        self.info = {}

    async def execute(self, stmt):
        self.statements.append(stmt)
        rows = self.scripted.pop(0) if self.scripted else []
        return SimpleNamespace(
            scalars=lambda: SimpleNamespace(all=lambda: rows, first=lambda: rows[0] if rows else None),
            all=lambda: rows,
            rowcount=len(rows),
        )

    async def commit(self):
        self.committed = True

    def sql(self, i=-1):
        return str(self.statements[i].compile(dialect=postgresql.dialect()))


def user(**kw):
    return SimpleNamespace(**{"id": uuid4(), "is_superuser": False, "is_active": True, **kw})


class TestSearch:
    def test_wildcards_are_escaped_and_results_limited(self):
        from app.api.api_v1.endpoints import search

        db = RecordingDB()
        run(search.search_all(q="100%_x\\", db=db, current_user=user()))
        assert len(db.statements) == 3
        for i in range(3):
            sql = db.sql(i)
            assert "ESCAPE" in sql.upper(), sql
            assert "LIMIT" in sql.upper(), sql
        # the bound pattern has % and _ and the backslash escaped
        params = db.statements[0].compile(dialect=postgresql.dialect()).params
        assert any(v == "%100\\%\\_x\\\\%" for v in params.values()), params

    def test_non_admin_search_is_scoped_to_owned_member_or_assigned(self):
        from app.api.api_v1.endpoints import search

        db = RecordingDB()
        run(search.search_all(q="x", db=db, current_user=user()))
        project_sql, task_sql, idea_sql = db.sql(0), db.sql(1), db.sql(2)
        assert "project_members" in project_sql
        assert "project_members" in task_sql and "task_assignees" in task_sql
        assert "project_members" in idea_sql

    def test_superuser_search_is_unscoped(self):
        from app.api.api_v1.endpoints import search

        db = RecordingDB()
        run(search.search_all(q="x", db=db, current_user=user(is_superuser=True)))
        assert all("project_members" not in db.sql(i) for i in range(3))


class TestNotifications:
    def test_mark_all_as_read_is_one_update(self):
        from app.crud.crud_notification import notification

        uid = uuid4()
        db = RecordingDB()
        run(notification.mark_all_as_read(db, user_id=uid))
        assert len(db.statements) == 1 and db.committed
        sql = db.sql().upper()
        assert sql.startswith("UPDATE NOTIFICATIONS") and "IS_READ" in sql and "USER_ID" in sql
        assert str(uid) in str(db.statements[0].compile(dialect=postgresql.dialect()).params.values())


class TestDependencyGraph:
    @staticmethod
    def dep(successor, predecessor):
        return SimpleNamespace(successor_id=successor, predecessor_id=predecessor)

    def test_graph_query_is_a_recursive_cte_not_a_table_scan(self):
        from app.crud.crud_dependency import dependency
        from app.schemas.task import DependencyCreate

        a, b = uuid4(), uuid4()
        db = RecordingDB()
        with patch("app.crud.base.CRUDBase.create", new=AsyncMock(return_value="created")):
            out = run(dependency.create(db, obj_in=DependencyCreate(successor_id=a, predecessor_id=b)))
        assert out == "created"
        assert "WITH RECURSIVE" in db.sql(0).upper()

    def test_cycle_is_still_detected(self):
        from app.crud.crud_dependency import dependency
        from app.schemas.task import DependencyCreate

        a, b, c = uuid4(), uuid4(), uuid4()
        # existing: b blocked by a, c blocked by b.  Adding "a blocked by c" closes the loop.
        db = RecordingDB(scripted=[[self.dep(b, a), self.dep(c, b)]])
        with patch("app.crud.base.CRUDBase.create", new=AsyncMock()) as create:
            with pytest.raises(ValueError, match="ircular"):
                run(dependency.create(db, obj_in=DependencyCreate(successor_id=a, predecessor_id=c)))
        create.assert_not_awaited()

    def test_unrelated_dependency_is_allowed(self):
        from app.crud.crud_dependency import dependency
        from app.schemas.task import DependencyCreate

        a, b, c, x = uuid4(), uuid4(), uuid4(), uuid4()
        db = RecordingDB(scripted=[[self.dep(b, a)]])
        with patch("app.crud.base.CRUDBase.create", new=AsyncMock(return_value="ok")):
            assert run(dependency.create(db, obj_in=DependencyCreate(successor_id=x, predecessor_id=c))) == "ok"

    def test_self_dependency_rejected_before_any_query(self):
        from app.crud.crud_dependency import dependency
        from app.schemas.task import DependencyCreate

        a = uuid4()
        db = RecordingDB()
        with pytest.raises(ValueError):
            run(dependency.create(db, obj_in=DependencyCreate(successor_id=a, predecessor_id=a)))
        assert db.statements == []


class TestPaginationCaps:
    @pytest.fixture
    def client(self):
        async def fake_db():
            yield MagicMock()

        app.dependency_overrides[deps.get_db] = fake_db
        app.dependency_overrides[deps.get_current_user] = lambda: user()
        yield TestClient(app, raise_server_exceptions=False)
        app.dependency_overrides.clear()

    @pytest.mark.parametrize("path", [
        "/api/v1/tasks/?limit=100000", "/api/v1/users/?limit=0", "/api/v1/ideas/?limit=501",
        "/api/v1/webhooks/?limit=-1", "/api/v1/notifications/?limit=9999", "/api/v1/templates/?limit=501",
        "/api/v1/workflows/?limit=501", "/api/v1/whiteboards/?limit=501", "/api/v1/projects/?limit=501",
    ])
    def test_out_of_range_limit_is_422(self, client, path):
        assert client.get(path).status_code == 422, path
