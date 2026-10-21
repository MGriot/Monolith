"""
Integration tests against a real PostgreSQL database (they replace the old hand-run scripts
`test_crud_dependencies_standalone.py` and `test_recursive_logic.py`).

Set TEST_DATABASE_URL to an empty or throw-away database, for example
    TEST_DATABASE_URL=postgresql+asyncpg://postgres:test@localhost:55432/postgres
Each test runs inside one outer transaction that is rolled back at the end (the schema is created inside it too,
since Postgres DDL is transactional), so nothing is left behind. Without TEST_DATABASE_URL the module is skipped.
"""
import asyncio
import os
from uuid import uuid4

import pytest

DB_URL = os.environ.get("TEST_DATABASE_URL")
if not DB_URL:
    pytest.skip("TEST_DATABASE_URL is not set (needs a throw-away PostgreSQL)", allow_module_level=True)

from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402

import app.models  # noqa: E402,F401  (registers every table and index)
from app.core.enums import DependencyType, Status  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.crud import crud_dependency, crud_project, crud_task  # noqa: E402
from app.db.session import Base  # noqa: E402
from app.models.activity import ActivityEvent  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.project import ProjectCreate  # noqa: E402
from app.schemas.task import DependencyCreate, TaskCreate, TaskShortCreate  # noqa: E402


def run_in_rolled_back_db(scenario):
    """Run `scenario(db, owner_id)` in a session whose every commit is a SAVEPOINT of an outer, rolled-back transaction."""

    async def main():
        engine = create_async_engine(DB_URL)
        try:
            async with engine.connect() as conn:
                outer = await conn.begin()
                try:
                    await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
                    await conn.run_sync(Base.metadata.create_all)
                    db = AsyncSession(bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint")
                    owner = User(email=f"owner-{uuid4().hex[:8]}@example.test", full_name="Test Owner",
                                 hashed_password=get_password_hash("Not-used-1234"), is_active=True)
                    db.add(owner)
                    await db.flush()
                    await scenario(db, owner.id)
                    await db.close()
                finally:
                    await outer.rollback()
        finally:
            await engine.dispose()

    asyncio.run(main())


async def _project(db, owner_id, name):
    return await crud_project.project.create_with_owner(db, obj_in=ProjectCreate(name=name), owner_id=owner_id)


def test_dependencies_are_stored_and_cycles_rejected():
    async def scenario(db, owner_id):
        project = await _project(db, owner_id, "Dependencies")
        a = await crud_task.task.create(db, obj_in=TaskCreate(title="Task A", project_id=project.id), owner_id=owner_id)
        b = await crud_task.task.create(db, obj_in=TaskCreate(title="Task B", project_id=project.id), owner_id=owner_id)

        dep = await crud_dependency.dependency.create(db, obj_in=DependencyCreate(
            successor_id=b.id, predecessor_id=a.id, type=DependencyType.FS, lag_days=1))
        assert dep.id is not None
        a_id, b_id = a.id, b.id  # expire_all() below expires these instances; reading .id would lazy-load

        with pytest.raises(ValueError):
            await crud_dependency.dependency.create(db, obj_in=DependencyCreate(
                successor_id=a.id, predecessor_id=b.id, type=DependencyType.FS))
        with pytest.raises(ValueError):
            await crud_dependency.dependency.create(db, obj_in=DependencyCreate(
                successor_id=a.id, predecessor_id=a.id, type=DependencyType.FS))

        db.expire_all()
        loaded = await crud_task.task.get(db, id=b_id)
        assert [d.predecessor_id for d in loaded.blocked_by] == [a_id]
        assert loaded.blocked_by[0].lag_days == 1

        # Deleting the project takes its tasks and dependencies with it.
        await crud_project.project.remove(db, id=project.id)
        assert await crud_task.task.get(db, id=a_id) is None

    run_in_rolled_back_db(scenario)


def test_nested_create_and_status_roll_up():
    async def scenario(db, owner_id):
        project = await _project(db, owner_id, "Recursive")
        root = await crud_task.task.create(db, obj_in=TaskCreate(
            title="Root", project_id=project.id,
            subtasks=[TaskShortCreate(title="Level 1", subtasks=[TaskShortCreate(title="Level 2", status=Status.TODO)])],
        ), owner_id=owner_id)
        root_id, project_id = root.id, project.id

        db.expire_all()
        root_loaded = await crud_task.task.get(db, id=root_id)
        assert [s.title for s in root_loaded.subtasks] == ["Level 1"]
        level1 = await crud_task.task.get(db, id=root_loaded.subtasks[0].id)
        assert [s.title for s in level1.subtasks] == ["Level 2"]
        level1_id, level2_id = level1.id, level1.subtasks[0].id

        level2 = await crud_task.task.get(db, id=level2_id)
        await crud_task.task.update(db, db_obj=level2, obj_in={"status": Status.DONE})

        db.expire_all()
        assert (await crud_task.task.get(db, id=level1_id)).status == Status.DONE
        assert (await crud_task.task.get(db, id=root_id)).status == Status.DONE

        # The roll-up is in the change log, labelled as automatic.
        rows = (await db.execute(select(ActivityEvent).where(
            ActivityEvent.project_id == project_id, ActivityEvent.kind == "status_changed"))).scalars().all()
        by_task = {r.task_id: r for r in rows}
        assert by_task[level2_id].actor_label is None
        assert by_task[level1_id].actor_label == "Automatic (from subtasks)"
        assert by_task[root_id].actor_label == "Automatic (from subtasks)"

    run_in_rolled_back_db(scenario)
