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
                    owner = User(email=f"owner-{uuid4().hex[:8]}@example.com", full_name="Test Owner",
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
        other = User(email=f"other-{uuid4().hex[:8]}@example.com", full_name="Other",
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


def test_portfolio_health_counts_overdue_and_critical_tasks():
    from datetime import datetime, timedelta

    from app.api.api_v1.endpoints import projects as projects_api

    async def scenario(db, owner_id):
        user = await db.get(User, owner_id)
        past = datetime.utcnow() - timedelta(days=10)
        chain = await _project(db, owner_id, "Chain")
        quiet = await _project(db, owner_id, "Quiet")
        # A (3 days) -> B (3 days) is the longest chain; C (1 day) runs in parallel with slack.
        a = await crud_task.task.create(db, obj_in=TaskCreate(
            title="A", project_id=chain.id, start_date=past, due_date=past + timedelta(days=2)), owner_id=owner_id)
        b = await crud_task.task.create(db, obj_in=TaskCreate(
            title="B", project_id=chain.id, start_date=past + timedelta(days=3), due_date=past + timedelta(days=5)),
            owner_id=owner_id)
        await crud_task.task.create(db, obj_in=TaskCreate(
            title="C", project_id=chain.id, start_date=past, due_date=past), owner_id=owner_id)
        await crud_dependency.dependency.create(db, obj_in=DependencyCreate(
            successor_id=b.id, predecessor_id=a.id, type=DependencyType.FS))
        await crud_task.task.create(db, obj_in=TaskCreate(title="Undated", project_id=quiet.id), owner_id=owner_id)
        db.expire_all()
        await db.refresh(user)

        health = await projects_api.get_portfolio_health(db=db, current_user=user)
        by_name = {p.name: p for p in health.projects}
        assert (by_name["Chain"].overdue_tasks, by_name["Chain"].critical_path_tasks) == (3, 2)
        assert by_name["Chain"].health_score == 85.0
        assert (by_name["Quiet"].overdue_tasks, by_name["Quiet"].critical_path_tasks, by_name["Quiet"].health_score) == (0, 1, 100.0)
        assert health.total_active == 2

    run_in_rolled_back_db(scenario)


def test_team_workload_only_counts_tasks_inside_the_window():
    from datetime import datetime, timedelta

    from app.api.api_v1.endpoints import dashboard as dashboard_api

    async def scenario(db, owner_id):
        user = await db.get(User, owner_id)
        project = await _project(db, owner_id, "Load")
        today = datetime.utcnow().replace(hour=10, minute=0, second=0, microsecond=0)
        for title, start, due in (("Now", today, today + timedelta(days=1)),          # 4h on day 0 and 1
                                  ("Past", today - timedelta(days=20), today - timedelta(days=10)),
                                  ("Later", today + timedelta(days=30), today + timedelta(days=31))):
            await crud_task.task.create(db, obj_in=TaskCreate(
                title=title, project_id=project.id, start_date=start, due_date=due, assignee_ids=[owner_id]),
                owner_id=owner_id)

        response = await dashboard_api.get_team_workload(db=db, current_user=user, days=7)
        mine = next(u for u in response.users if u.user_id == str(owner_id))
        assert [(w.hours, w.task_count) for w in mine.workload[:3]] == [(4.0, 1), (4.0, 1), (0.0, 0)]
        assert sum(w.task_count for w in mine.workload) == 2 and not mine.is_overallocated

    run_in_rolled_back_db(scenario)


def test_parent_and_blocker_cycles_and_done_guard():
    async def scenario(db, owner_id):
        project = await _project(db, owner_id, "Graph")

        async def new(title, **kw):
            return (await crud_task.task.create(db, obj_in=TaskCreate(title=title, project_id=project.id, **kw),
                                                owner_id=owner_id)).id

        async def update(task_id, data):
            obj = await crud_task.task.get(db, id=task_id)
            return await crud_task.task.update(db, db_obj=obj, obj_in=data)

        # Parent loops: a task cannot move under its own descendant, at any depth
        root = await new("Root")
        child = await new("Child", parent_id=root)
        grandchild = await new("Grandchild", parent_id=child)
        other = await new("Other")
        for bad_parent in (root, child, grandchild):
            with pytest.raises(ValueError):
                await update(root, {"parent_id": bad_parent})
        await update(grandchild, {"parent_id": other})  # a legal move still works
        assert (await crud_task.task.get(db, id=grandchild)).parent_id == other

        # Blocker loops through dependency rows AND legacy blocked_by_ids: x <-dep- y <-legacy- z
        x, y, z = await new("X"), await new("Y"), await new("Z")
        await crud_dependency.dependency.create(db, obj_in=DependencyCreate(
            successor_id=y, predecessor_id=x, type=DependencyType.FS))
        await update(z, {"blocked_by_ids": [y]})
        with pytest.raises(ValueError, match="Circular"):
            await update(x, {"blocked_by_ids": [z]})
        with pytest.raises(ValueError, match="itself"):
            await update(x, {"blocked_by_ids": [x]})
        await update(x, {"blocked_by_ids": [other]})  # no loop: accepted

        # Done guard lists unfinished blockers from both sources, dependency rows first, no duplicates
        await update(z, {"blocked_by_ids": [y, x, y]})
        await crud_dependency.dependency.create(db, obj_in=DependencyCreate(
            successor_id=z, predecessor_id=other, type=DependencyType.FS))
        with pytest.raises(ValueError) as exc:
            await update(z, {"status": Status.DONE})
        assert str(exc.value) == "Task is blocked by unfinished items: Other, Y, X"

    run_in_rolled_back_db(scenario)


def test_rollup_results_after_nested_create_update_and_bulk():
    from datetime import datetime
    from types import SimpleNamespace

    from app.api.api_v1.endpoints import tasks as tasks_api
    from app.models.metadata import Topic
    from app.schemas.task import BulkTaskRequest

    async def scenario(db, owner_id):
        project = await _project(db, owner_id, "Rollup")
        t1, t2 = Topic(name="Alpha"), Topic(name="Beta")
        db.add_all([t1, t2])
        await db.flush()
        d = lambda day: datetime(2026, 3, day)  # noqa: E731
        root = await crud_task.task.create(db, obj_in=TaskCreate(
            title="Root", project_id=project.id, topic_ids=[t1.id],
            subtasks=[TaskShortCreate(title="A", start_date=d(2), due_date=d(4), subtasks=[
                          TaskShortCreate(title="A1", start_date=d(2), due_date=d(3)),
                          TaskShortCreate(title="A2", due_date=d(9))]),
                      TaskShortCreate(title="B", start_date=d(5), due_date=d(6))],
        ), owner_id=owner_id)
        lone = await crud_task.task.create(db, obj_in=TaskCreate(
            title="Lone", project_id=project.id, topic_ids=[t2.id], start_date=d(1), due_date=d(1)), owner_id=owner_id)
        root_id, lone_id, project_id = root.id, lone.id, project.id

        async def state():
            db.expire_all()
            p = await crud_project.project.get(db, id=project_id)
            tree = await crud_task.task.get_multi_by_project(db, project_id=project_id)
            statuses = {}

            def walk(ts):
                for t in ts:
                    statuses[t.title] = t.status.value
                    walk(t.subtasks)
            walk(tree)
            return (p.progress_percent, p.start_date, p.due_date, sorted(t.name for t in p.topics), statuses)

        after_create = await state()
        assert after_create[1:4] == (d(1), d(9), ["Alpha", "Beta"])
        assert set(after_create[4].values()) == {"Todo"}

        tree = {t.title: t for t in (await crud_task.task.get(db, id=root_id)).subtasks}
        a1 = await crud_task.task.get(db, id=tree["A"].subtasks[0].id)
        await crud_task.task.update(db, db_obj=a1, obj_in={"status": Status.DONE})
        after_leaf = await state()
        assert after_leaf[4] == {"Root": "In Progress", "A": "In Progress", "A1": "Done", "A2": "Todo", "B": "Todo",
                                 "Lone": "Todo"}

        ids = [tree["A"].subtasks[1].id, tree["B"].id, lone_id]
        await tasks_api.bulk_update_tasks(db=db, body=BulkTaskRequest(ids=ids, patch={"status": "Done"}),
                                          current_user=SimpleNamespace(id=owner_id, is_superuser=True))
        after_bulk = await state()
        assert after_bulk[4] == {"Root": "Done", "A": "Done", "A1": "Done", "A2": "Done", "B": "Done", "Lone": "Done"}
        assert after_bulk[0] == 100.0 and after_leaf[0] < after_bulk[0]

    run_in_rolled_back_db(scenario)


def test_assigned_tasks_serialise_deep_subtrees():
    from app.api.api_v1.endpoints import tasks as tasks_api
    from app.schemas.task import Task as TaskSchema

    async def scenario(db, owner_id):
        user = await db.get(User, owner_id)
        project = await _project(db, owner_id, "Deep")
        chain = None
        for level in range(6, 0, -1):  # L1 > L2 > ... > L6
            chain = [TaskShortCreate(title=f"L{level}", subtasks=chain or [])]
        await crud_task.task.create(db, obj_in=TaskCreate(
            title="Assigned", project_id=project.id, assignee_ids=[owner_id], subtasks=chain), owner_id=owner_id)
        db.expire_all()
        await db.refresh(user)

        tasks = await tasks_api.read_assigned_tasks(db=db, skip=0, limit=100, current_user=user)
        schemas = [TaskSchema.model_validate(t) for t in tasks]  # what the response_model does
        node, depth = schemas[0], 0
        while node.subtasks:
            node, depth = node.subtasks[0], depth + 1
        assert (schemas[0].title, depth, node.title) == ("Assigned", 6, "L6")

    run_in_rolled_back_db(scenario)


def test_lists_use_one_visibility_rule():
    """Owner or member of the project, or owner / assignee of the task; nothing else (dashboard, calendar, risk, search)."""
    from datetime import datetime, timedelta

    from app.api.access import visible_project_filter, visible_task_filter
    from app.api.api_v1.endpoints import calendar as calendar_api, dashboard as dashboard_api, search as search_api
    from app.models.associations import project_members
    from app.models.project import Project
    from app.models.task import Task

    async def scenario(db, owner_id):
        me = User(email=f"me-{uuid4().hex[:8]}@example.com", full_name="Me", hashed_password="x", is_active=True)
        db.add(me)
        await db.flush()
        soon = datetime.utcnow() + timedelta(days=2)
        mine = await _project(db, me.id, "Vis mine")
        shared = await _project(db, owner_id, "Vis shared")        # I'm a member
        foreign = await _project(db, owner_id, "Vis foreign")      # I'm not
        await db.execute(project_members.insert().values(project_id=shared.id, user_id=me.id, role="viewer"))
        for title, project, owner, assignees in (
            ("Vis in mine", mine, me.id, []), ("Vis in shared", shared, owner_id, []),
            ("Vis hidden", foreign, owner_id, []), ("Vis assigned to me", foreign, owner_id, [me.id]),
            ("Vis no project", None, me.id, []),
        ):
            await crud_task.task.create(db, obj_in=TaskCreate(
                title=title, project_id=project.id if project else None, due_date=soon, start_date=soon,
                assignee_ids=assignees), owner_id=owner)
        for p in (mine, shared, foreign):
            p.due_date = soon
        await db.flush()

        expected_projects = {"Vis mine", "Vis shared"}
        expected_tasks = {"Vis in mine", "Vis in shared", "Vis assigned to me", "Vis no project"}
        projects = (await db.execute(select(Project.name).where(visible_project_filter(me)))).scalars().all()
        tasks = (await db.execute(select(Task.title).where(visible_task_filter(me)))).scalars().all()
        assert set(projects) == expected_projects and set(tasks) == expected_tasks

        cal = await calendar_api.get_calendar_events(db=db, current_user=me, start_date=None, end_date=None)
        titles = {i.title for i in (cal["items"] if isinstance(cal, dict) else cal.items)}
        assert titles == expected_projects | expected_tasks

        summary = await dashboard_api.get_dashboard_summary(db=db, current_user=me)
        assert (summary["total_projects"], summary["total_tasks"]) == (2, 4)

        risk = await dashboard_api.get_risk_data(db=db, current_user=me)
        assert {i["name"] for i in risk} == expected_projects | expected_tasks

        hits = await search_api.search_all(q="Vis", db=db, current_user=me)
        assert {h.title for h in hits} == expected_projects | expected_tasks

    run_in_rolled_back_db(scenario)


def test_team_workload_shows_only_people_who_share_a_project():
    from datetime import datetime, timedelta

    from app.api.api_v1.endpoints import dashboard as dashboard_api
    from app.models.associations import project_members

    async def scenario(db, owner_id):
        def person(name):
            return User(email=f"{name}-{uuid4().hex[:6]}@example.com", full_name=name, hashed_password="x", is_active=True)

        me, mate, stranger = person("Me"), person("Mate"), person("Stranger")
        db.add_all([me, mate, stranger])
        await db.flush()
        shared = await _project(db, me.id, "Shared")
        theirs = await _project(db, stranger.id, "Theirs")     # mate is a member, I am not
        await db.execute(project_members.insert().values([
            {"project_id": shared.id, "user_id": mate.id, "role": "editor"},
            {"project_id": theirs.id, "user_id": mate.id, "role": "editor"}]))
        today = datetime.utcnow().replace(hour=10)
        for title, project, who in (("Shared work", shared, mate), ("Their work", theirs, mate), ("Private", theirs, stranger)):
            await crud_task.task.create(db, obj_in=TaskCreate(
                title=title, project_id=project.id, start_date=today, due_date=today, assignee_ids=[who.id]),
                owner_id=who.id)

        mine = await dashboard_api.get_team_workload(db=db, current_user=me, days=3)
        by_user = {u.user_name: u for u in mine.users}
        assert set(by_user) == {"Me", "Mate"}                       # the stranger shares no project with me
        assert by_user["Mate"].workload[0].task_count == 1          # "Their work" is in a project I cannot see

        admin = User(id=uuid4(), is_superuser=True)
        everyone = await dashboard_api.get_team_workload(db=db, current_user=admin, days=3)
        names = {u.user_name for u in everyone.users}
        assert {"Me", "Mate", "Stranger"} <= names
        assert next(u for u in everyone.users if u.user_name == "Mate").workload[0].task_count == 2

    run_in_rolled_back_db(scenario)
