"""Tier-1 database work: migration chain integrity and in-memory task tree assembly (no database needed).

The SQL side (recursive CTE, baseline == models, index usage, stamp/upgrade of a legacy database) is verified
against a live PostgreSQL by scripts documented in docs/guide/08-administration.html#migrations.
"""
import os
from datetime import datetime, timedelta
from uuid import uuid4

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.crud.crud_task import CRUDTask
from app.db import migrate
from app.models.task import Task


def _script_dir() -> ScriptDirectory:
    return ScriptDirectory.from_config(migrate._alembic_config())


class TestMigrations:
    def test_single_linear_history_with_baseline_first(self):
        script = _script_dir()
        assert len(script.get_heads()) == 1, "branched migration history"
        revisions = list(script.walk_revisions())          # newest -> oldest
        assert revisions[-1].revision == migrate.BASELINE_REVISION
        assert revisions[-1].down_revision is None
        chain = [r.revision for r in reversed(revisions)]
        assert chain == sorted(chain), "revision ids should sort in application order"

    def test_every_revision_defines_downgrade(self):
        for rev in _script_dir().walk_revisions():
            assert "def downgrade" in open(rev.path, encoding="utf-8").read(), rev.revision

    def test_index_migration_covers_every_declared_index(self):
        """If someone adds an Index in app/models/indexes.py they must also add a migration."""
        import app.models  # noqa: F401
        from app.db.session import Base

        declared = {
            ix.name for t in Base.metadata.tables.values() for ix in t.indexes if ix.name and ix.name.startswith("ix_")
            and ix.name in open(os.path.join(os.path.dirname(migrate.__file__), "..", "models", "indexes.py"), encoding="utf-8").read()
        }
        assert declared, "indexes.py declares no indexes?"
        migration_src = ""
        for rev in _script_dir().walk_revisions():
            migration_src += open(rev.path, encoding="utf-8").read()
        missing = sorted(n for n in declared if f"'{n}'" not in migration_src and f'"{n}"' not in migration_src)
        assert not missing, f"indexes declared but not created by any migration: {missing}"

    def test_alembic_ini_points_at_migrations_dir(self):
        cfg = migrate._alembic_config()
        assert os.path.isdir(cfg.get_main_option("script_location"))
        assert isinstance(cfg, Config)


class TestTreeAssembly:
    @staticmethod
    def _task(parent=None, sort_index=0, created=None, tid=None):
        return Task(id=tid or uuid4(), parent_id=parent.id if parent else None, sort_index=sort_index,
                    created_at=created or datetime(2025, 1, 1))

    def test_children_are_attached_and_sorted(self):
        root = self._task()
        b = self._task(root, sort_index=20)
        a = self._task(root, sort_index=10)
        c_late = self._task(root, sort_index=10, created=datetime(2025, 1, 2))
        grandchild = self._task(a)
        by_id = {t.id: t for t in (root, b, a, c_late, grandchild)}

        CRUDTask._attach_children(by_id)

        assert [t.id for t in root.subtasks] == [a.id, c_late.id, b.id]
        assert [t.id for t in a.subtasks] == [grandchild.id]
        assert b.subtasks == [] and grandchild.subtasks == []

    def test_depth_is_unbounded(self):
        chain = [self._task()]
        for _ in range(60):
            chain.append(self._task(chain[-1]))
        CRUDTask._attach_children({t.id: t for t in chain})
        node, depth = chain[0], 0
        while node.subtasks:
            node = node.subtasks[0]
            depth += 1
        assert depth == 60

    def test_only_loaded_tasks_become_children(self):
        outside = self._task()
        orphan = self._task(outside)        # parent not part of the loaded set
        CRUDTask._attach_children({orphan.id: orphan})
        assert orphan.subtasks == []

    def test_attaching_does_not_mark_the_collection_dirty(self):
        from sqlalchemy import inspect

        root = self._task()
        child = self._task(root)
        CRUDTask._attach_children({root.id: root, child.id: child})
        state = inspect(root)
        assert "subtasks" not in state.committed_state or not state.modified

    def test_missing_created_at_does_not_break_sorting(self):
        root = self._task()
        x = Task(id=uuid4(), parent_id=root.id, sort_index=0, created_at=None)
        y = Task(id=uuid4(), parent_id=root.id, sort_index=0, created_at=datetime(2025, 1, 1))
        CRUDTask._attach_children({t.id: t for t in (root, x, y)})
        assert len(root.subtasks) == 2



def test_task_dependencies_are_deleted_with_their_tasks():
    """Deleting a project or task with dependencies used to fail: the ORM nulled the NOT NULL dependency FKs."""
    from sqlalchemy import inspect as sa_inspect
    from app.models.task import Task

    rels = sa_inspect(Task).relationships
    for name in ("blocked_by", "blocking"):
        assert rels[name].cascade.delete and rels[name].cascade.delete_orphan, name
        assert rels[name].passive_deletes, name


def test_project_children_are_deleted_not_orphaned():
    """Deleting a project must delete (not null out) its sketches, comments, folders and project webhooks."""
    from sqlalchemy import inspect as sa_inspect
    from app.models.project import Project
    from app.models.task import Task

    project = sa_inspect(Project).relationships
    for name in ("whiteboards", "threaded_comments", "folders", "webhooks", "tasks", "ideas"):
        assert project[name].cascade.delete, name
    task = sa_inspect(Task).relationships
    for name in ("threaded_comments", "folders"):
        assert task[name].cascade.delete and task[name].passive_deletes, name
    assert not task["whiteboards"].cascade.delete  # a task's sketches stay in the project


def test_reconcile_dates_respects_what_was_sent():
    from datetime import datetime
    from app.crud.crud_task import reconcile_dates

    d = lambda x: datetime(2026, 11, x)
    # start and due together (Gantt resize, MCP update): both kept, duration follows
    out = reconcile_dates({"start_date": d(2), "due_date": d(20)}, d(1), d(5), 5)
    assert out == {"start_date": d(2), "due_date": d(20), "duration_days": 19}
    # start alone keeps the length
    assert reconcile_dates({"start_date": d(10)}, d(1), d(5), 5)["due_date"] == d(14)
    # due alone changes the length
    assert reconcile_dates({"due_date": d(9)}, d(1), d(5), 5)["duration_days"] == 9
    # duration wins over a due date sent with it
    assert reconcile_dates({"duration_days": 3, "due_date": d(30)}, d(1), d(5), 5)["due_date"] == d(3)
    # explicit nulls just clear
    assert reconcile_dates({"due_date": None}, d(1), d(5), 5) == {"due_date": None}


def test_task_scoped_taxonomy_includes_the_projects_own_entries():
    """The task editor asks for (project, task): it must see project-level topics/types, not only task-level ones."""
    from uuid import uuid4
    from app.crud.crud_metadata import topic, work_type
    from sqlalchemy.dialects import postgresql

    captured = []

    class FakeDb:
        async def execute(self, stmt):
            captured.append(str(stmt.compile(dialect=postgresql.dialect())))

            class R:
                def scalars(self):
                    return self

                def all(self):
                    return []
            return R()

    import asyncio
    for crud in (topic, work_type):
        captured.clear()
        asyncio.run(crud.get_multi_scoped(FakeDb(), project_id=uuid4(), task_id=uuid4(), include_global=False))
        sql = captured[0]
        assert "task_id IS NULL" in sql and "task_id = " in sql, sql
