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

from sqlalchemy import func, select, text  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402

import app.models  # noqa: E402,F401  (registers every table and index)
from app.core.enums import DependencyType, Status  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.crud import crud_dependency, crud_project, crud_task  # noqa: E402
from app.db.session import Base  # noqa: E402
from app.models.activity import ActivityEvent  # noqa: E402
from app.models.metadata import Topic, WorkType  # noqa: E402
from app.models.template import ProjectTemplate  # noqa: E402
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


def test_topic_and_work_type_names_are_unique_per_scope():
    async def scenario(db, owner_id):
        project = await _project(db, owner_id, "Taxonomy")
        db.add(Topic(name="Research"))
        await db.flush()
        # NULL scope columns used to make UNIQUE(name, project_id, task_id) a no-op for global names.
        with pytest.raises(IntegrityError):
            async with db.begin_nested():
                db.add(Topic(name="Research"))
                await db.flush()
        with pytest.raises(IntegrityError):
            async with db.begin_nested():
                db.add_all([WorkType(name="Dev", project_id=project.id), WorkType(name="Dev", project_id=project.id)])
                await db.flush()
        # The same name in another scope is fine.
        db.add(Topic(name="Research", project_id=project.id))
        await db.flush()

    run_in_rolled_back_db(scenario)


def test_template_with_a_repeated_preset_name_instantiates_once():
    async def scenario(db, owner_id):
        template = ProjectTemplate(
            name="Tpl", owner_id=owner_id, tasks_json=[{"title": "Uses the second copy", "topic_id": "t2"}],
            topics_preset=[{"id": "t1", "name": "Ops"}, {"id": "t2", "name": "Ops"}],
            work_types_preset=[{"id": "w1", "name": "Build"}, {"id": "w2", "name": "Build"}],
            allowed_global_topics=[], allowed_global_work_types=[],
        )
        db.add(template)
        await db.flush()
        project = await crud_project.project.create_with_owner(
            db, obj_in=ProjectCreate(name="From template", template_id=template.id), owner_id=owner_id)
        project_id = project.id

        topics = (await db.execute(select(Topic).where(Topic.project_id == project_id))).scalars().all()
        assert [t.name for t in topics] == ["Ops"]
        assert (await db.execute(select(func.count()).select_from(WorkType).where(WorkType.project_id == project_id))).scalar_one() == 1
        tasks = await crud_task.task.get_multi_by_project(db, project_id=project_id)
        assert [t.topic_id for t in tasks] == [topics[0].id]

    run_in_rolled_back_db(scenario)


def test_idea_vote_counts_and_flags():
    from app.crud.crud_idea import idea as crud_idea
    from app.models.associations import idea_downvotes, idea_votes
    from app.models.idea import Idea

    async def scenario(db, owner_id):
        other = User(email=f"other-{uuid4().hex[:8]}@example.test", full_name="Other",
                     hashed_password=get_password_hash("Not-used-1234"), is_active=True)
        db.add(other)
        project = await _project(db, owner_id, "Ideas")
        a, b, c = (Idea(title=t, project_id=project.id, author_id=owner_id) for t in ("A", "B", "C"))
        db.add_all([a, b, c])
        await db.flush()
        await db.execute(idea_votes.insert().values([
            {"idea_id": a.id, "user_id": owner_id}, {"idea_id": a.id, "user_id": other.id},
            {"idea_id": b.id, "user_id": other.id}]))
        await db.execute(idea_downvotes.insert().values([{"idea_id": c.id, "user_id": owner_id}]))

        def flags(ideas):
            return {i.title: (i.vote_count, i.downvote_count, i.has_voted, i.has_downvoted) for i in ideas}

        expected = {"A": (2, 0, True, False), "B": (1, 0, False, False), "C": (0, 1, False, True)}
        assert flags(await crud_idea.get_multi_by_project(db, project_id=project.id, current_user_id=owner_id)) == expected
        assert flags(await crud_idea.get_multi_by_user(db, user_id=owner_id, current_user_id=owner_id)) == expected
        assert flags([await crud_idea.get(db, id=a.id, current_user_id=owner_id)]) == {"A": expected["A"]}
        # Without a current user nothing is flagged.
        anonymous = flags(await crud_idea.get_multi_by_project(db, project_id=project.id))
        assert anonymous == {k: (v[0], v[1], False, False) for k, v in expected.items()}

    run_in_rolled_back_db(scenario)
