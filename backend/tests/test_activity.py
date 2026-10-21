"""Task change log: snapshots, diffs, plain-English summaries and who gets credited (no database).

Run:  pytest backend/tests/test_activity.py
"""
from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

from app.core import activity


def task(**kw):
    base = dict(id=uuid4(), project_id=uuid4(), title="Wave 1", description="", status="Todo", priority="Medium",
                start_date=datetime(2026, 11, 2), due_date=datetime(2026, 11, 4), deadline_at=None, duration_days=3,
                optimistic_days=0, normal_days=0, pessimistic_days=0, is_milestone=False, budget=0.0, real_cost=0.0,
                risk_probability=1, risk_impact=1, parent_id=None, tags=[], recurrence_rule=None, color=None,
                custom_values={}, checklist=[], topics=[], types=[], assignees=[], is_archived=False)
    base.update(kw)
    return SimpleNamespace(**base)


def person(name):
    return SimpleNamespace(id=uuid4(), full_name=name, email=f"{name.lower()}@example.com")


class FakeDb:
    def __init__(self, actor=None):
        self.info = {activity.ACTOR_KEY: actor}
        self.added = []

    def add(self, obj):
        self.added.append(obj)


def lines(before, after):
    return activity.describe(activity.diff(activity.snapshot(before), activity.snapshot(after)))


class TestSummaries:
    def test_status_change_gets_its_own_line(self):
        out = lines(task(), task(status="In Progress"))
        assert out == [("status_changed", "changed status Todo → In Progress", {"status": ["Todo", "In Progress"]})]

    def test_field_edits_are_listed_together(self):
        out = lines(task(), task(due_date=datetime(2026, 11, 10), budget=21000.0, description="New scope"))
        kind, summary, changes = out[0]
        assert kind == "updated"
        assert summary.startswith("changed due date 04 Nov 2026 → 10 Nov 2026")
        assert "budget none → 21,000" not in summary and "budget 0 → 21,000" in summary
        assert "edited the description" in summary
        assert changes["due_date"] == ["2026-11-04T00:00:00", "2026-11-10T00:00:00"]

    def test_assignments_and_archiving(self):
        sam, ana = person("Sam"), person("Ana")
        out = dict((k, s) for k, s, _ in lines(task(assignees=[ana]), task(assignees=[sam], is_archived=True)))
        assert out["assigned"] == "assigned Sam; unassigned Ana"
        assert out["archived"] == "archived the task"

    def test_checklist_progress(self):
        before = task(checklist=[{"text": "a", "is_done": False}, {"text": "b", "is_done": False}])
        after = task(checklist=[{"text": "a", "is_done": True}, {"text": "b", "is_done": False}])
        assert lines(before, after)[0][1] == "changed checklist 0/2 done → 1/2 done"

    def test_nothing_changed_means_no_line(self):
        assert lines(task(), task()) == []

    def test_rename(self):
        assert lines(task(), task(title="Wave one"))[0][1] == "renamed it from “Wave 1”"


class TestActor:
    def test_signed_in_user_is_credited(self):
        uid = uuid4()
        db = FakeDb(actor=uid)
        activity.record(db, project_id=uuid4(), task_id=uuid4(), task_title="T", kind="created", summary="created the task")
        assert db.added[0].actor_id == uid and db.added[0].actor_label is None

    def test_automations_and_rollups_are_labelled(self):
        db = FakeDb(actor=uuid4())
        with activity.acting_as("Automation: Notify reviewers"):
            activity.record(db, project_id=uuid4(), task_id=None, task_title="T", kind="status_changed", summary="x")
        with activity.acting_as(activity.ROLLUP_LABEL):
            activity.record(db, project_id=uuid4(), task_id=None, task_title="T", kind="status_changed", summary="y")
        assert [(e.actor_id, e.actor_label) for e in db.added] == [
            (None, "Automation: Notify reviewers"), (None, "Automatic (from subtasks)")]
        assert activity.actor_label.get() is None  # labels never leak past their block

    def test_tasks_outside_projects_are_not_logged(self):
        db = FakeDb()
        activity.record(db, project_id=None, task_id=uuid4(), task_title="T", kind="created", summary="created")
        assert db.added == []

    def test_a_broken_line_never_breaks_the_change(self):
        class Boom(FakeDb):
            def add(self, obj):
                raise RuntimeError("db down")

        activity.record(Boom(), project_id=uuid4(), task_id=None, task_title="T", kind="created", summary="created")

    def test_set_actor_tolerates_odd_sessions(self):
        activity.set_actor(object(), uuid4())  # no .info: ignored


def test_record_diff_writes_one_row_per_line():
    db = FakeDb(actor=uuid4())
    t = task(status="Review", budget=5.0)
    activity.record_diff(db, t, activity.snapshot(task()), activity.snapshot(t))
    assert sorted(e.kind for e in db.added) == ["status_changed", "updated"]
    assert all(e.task_title == "Wave 1" and e.project_id == t.project_id for e in db.added)
