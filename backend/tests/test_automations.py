"""Automation rules + webhooks: validation, condition matching, event building, payload formats, and the engine's
safety properties (loop guard, depth limit, per-rule SAVEPOINT isolation, never failing the caller).
Database-free; the real thing runs in backend/tests/live/smoke_automations.py."""
import asyncio
import inspect
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core import automations as au
from app.core import webhooks as wh
from app.core.automations import TaskEvent


def run(coro):
    return asyncio.run(coro)


A, B = str(uuid4()), str(uuid4())


def snap(**kw):
    base = dict(id=str(uuid4()), title="Fix login bug", status="Todo", priority="High", project_id=str(uuid4()),
                project_name="Apollo", owner_id=A, is_milestone=False, due_date=None, tags=["backend", "Urgent"],
                assignee=[A], old_status=None)
    base.update(kw)
    return base


# ---------------------------------------------------------------------------------------------------- matching
class TestMatching:
    @pytest.mark.parametrize("cond,expected", [
        ({"field": "status", "op": "eq", "value": "Todo"}, True),
        ({"field": "status", "op": "eq", "value": "Done"}, False),
        ({"field": "status", "op": "neq", "value": "Done"}, True),
        ({"field": "status", "op": "in", "value": ["Done", "Todo"]}, True),
        ({"field": "status", "op": "not_in", "value": ["Done", "Todo"]}, False),
        ({"field": "priority", "op": "eq", "value": "High"}, True),
        ({"field": "assignee", "op": "eq", "value": A}, True),
        ({"field": "assignee", "op": "eq", "value": B}, False),
        ({"field": "assignee", "op": "in", "value": [B, A]}, True),
        ({"field": "assignee", "op": "neq", "value": B}, True),
        ({"field": "assignee", "op": "is_set"}, True),
        ({"field": "assignee", "op": "is_empty"}, False),
        ({"field": "title", "op": "contains", "value": "LOGIN"}, True),
        ({"field": "title", "op": "contains", "value": "signup"}, False),
        ({"field": "tags", "op": "contains", "value": "urgent"}, True),
        ({"field": "tags", "op": "contains", "value": "front"}, False),   # whole-tag match, not substring
        ({"field": "is_milestone", "op": "eq", "value": False}, True),
        ({"field": "due_date", "op": "is_empty"}, True),
        ({"field": "due_date", "op": "is_set"}, False),
        ({"field": "old_status", "op": "eq", "value": "Todo"}, False),   # no change in this snapshot
    ])
    def test_single_predicate(self, cond, expected):
        assert au.condition_holds(cond, snap()) is expected

    def test_empty_assignee_list(self):
        s = snap(assignee=[])
        assert au.condition_holds({"field": "assignee", "op": "is_empty"}, s)
        assert not au.condition_holds({"field": "assignee", "op": "eq", "value": A}, s)

    def test_and_semantics(self):
        s = snap()
        ok = {"field": "status", "op": "eq", "value": "Todo"}
        no = {"field": "priority", "op": "eq", "value": "Low"}
        assert au.matches([ok, ok], s)
        assert not au.matches([ok, no], s)
        assert au.matches([], s) and au.matches(None, s)

    def test_uuid_objects_compare_as_strings(self):
        from uuid import UUID

        assert au.condition_holds({"field": "assignee", "op": "eq", "value": A}, snap(assignee=[UUID(A)]))

    def test_render_text(self):
        out = au.render_text("{task_title} is {status}/{priority} in {project} {unknown} {__class__}", snap())
        assert out == "Fix login bug is Todo/High in Apollo {unknown} {__class__}"


# ---------------------------------------------------------------------------------------------------- validation
class TestValidation:
    def test_valid_rule_is_normalised(self):
        conds, actions = au.validate_rule(
            "status_changed",
            [{"field": "status", "value": "Done"}, {"field": "assignee", "op": "in", "value": [A]}, {"field": "due_date", "op": "is_set", "junk": 1}],
            [{"type": "notify", "message": " hi ", "junk": 1}, {"type": "set_field", "field": "assignee", "value": ""}],
        )
        assert conds[0] == {"field": "status", "op": "eq", "value": "Done"}
        assert conds[2] == {"field": "due_date", "op": "is_set"}
        assert actions[0] == {"type": "notify", "to": "assignees", "message": "hi", "email": True}
        assert actions[1] == {"type": "set_field", "field": "assignee", "value": None}

    @pytest.mark.parametrize("trigger,conds,actions", [
        ("bogus", [], [{"type": "notify", "message": "x"}]),
        ("task_created", [], []),
        ("task_created", [{"field": "nope", "value": 1}], [{"type": "notify", "message": "x"}]),
        ("task_created", [{"field": "status", "op": "like", "value": "x"}], [{"type": "notify", "message": "x"}]),
        ("task_created", [{"field": "status", "value": "Finished"}], [{"type": "notify", "message": "x"}]),
        ("task_created", [{"field": "priority", "op": "in", "value": []}], [{"type": "notify", "message": "x"}]),
        ("task_created", [{"field": "assignee", "value": "not-a-uuid"}], [{"type": "notify", "message": "x"}]),
        ("task_created", [{"field": "status", "op": "contains", "value": "T"}], [{"type": "notify", "message": "x"}]),
        ("task_created", [{"field": "is_milestone", "value": "yes"}], [{"type": "notify", "message": "x"}]),
        ("task_created", [{"field": "due_date", "op": "eq", "value": "2025-01-01"}], [{"type": "notify", "message": "x"}]),
        ("task_created", [{"field": "old_status", "value": "Todo"}], [{"type": "notify", "message": "x"}]),
        ("task_created", [], [{"type": "delete_everything"}]),
        ("task_created", [], [{"type": "set_field", "field": "title", "value": "x"}]),
        ("task_created", [], [{"type": "set_field", "field": "status", "value": "Finished"}]),
        ("task_created", [], [{"type": "assign_user", "user_id": "nope"}]),
        ("task_created", [], [{"type": "notify", "message": ""}]),
        ("task_created", [], [{"type": "notify", "to": "everyone", "message": "x"}]),
        ("task_created", [], [{"type": "notify", "to": "user", "message": "x"}]),
        ("task_created", [], [{"type": "call_webhook", "webhook_id": "x"}]),
        ("task_created", [], ["not an object"]),
        ("task_created", [{"field": "status", "value": "Todo"}] * 11, [{"type": "notify", "message": "x"}]),
        ("task_created", [], [{"type": "notify", "message": "x"}] * 11),
    ])
    def test_rejects(self, trigger, conds, actions):
        with pytest.raises(ValueError):
            au.validate_rule(trigger, conds, actions)

    def test_old_status_only_on_status_changed(self):
        au.validate_rule("status_changed", [{"field": "old_status", "value": "Todo"}], [{"type": "notify", "message": "x"}])

    def test_references_are_collected(self):
        w = str(uuid4())
        actions = [
            {"type": "assign_user", "user_id": A},
            {"type": "notify", "to": "user", "user_id": B, "message": "x", "email": False},
            {"type": "set_field", "field": "assignee", "value": A},
            {"type": "set_field", "field": "status", "value": "Done"},
            {"type": "call_webhook", "webhook_id": w},
        ]
        assert au.referenced_user_ids(actions) == [A, B, A]
        assert au.referenced_webhook_ids(actions) == [w]


# ---------------------------------------------------------------------------------------------------- events
class TestBuildEvents:
    t, p = uuid4(), uuid4()

    def triggers(self, **kw):
        return [e.trigger for e in au.build_events(task_id=self.t, project_id=self.p, **kw)]

    def test_created(self):
        assert self.triggers(created=True, new_status="Todo") == ["task_created"]
        assert self.triggers(created=True, new_status="Done") == ["task_created", "task_completed"]
        assert self.triggers(created=True, new_status="Todo", added_assignees=[A]) == ["task_created", "assigned"]

    def test_status_change_and_completion(self):
        assert self.triggers(old_status="Todo", new_status="Todo") == []
        assert self.triggers(old_status="Todo", new_status="In Progress") == ["status_changed"]
        assert self.triggers(old_status="Todo", new_status="Done") == ["status_changed", "task_completed"]
        assert self.triggers(old_status="Done", new_status="Done") == []
        assert self.triggers(old_status="Done", new_status="Todo") == ["status_changed"]

    def test_assignment_only(self):
        ev = au.build_events(task_id=self.t, project_id=self.p, added_assignees=[uuid4()])
        assert [e.trigger for e in ev] == ["assigned"] and len(ev[0].added_assignees) == 1

    def test_status_change_carries_old_and_new(self):
        ev = au.build_events(task_id=self.t, project_id=self.p, old_status="Todo", new_status="Review")[0]
        assert ev.changes == {"status": ("Todo", "Review")}


# ---------------------------------------------------------------------------------------------------- engine
class FakeSavepoint:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        self.db.opened += 1
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if exc_type:
            self.db.rolled_back += 1
        else:
            self.db.released += 1
        return False


class FakeDB:
    def __init__(self):
        self.opened = self.rolled_back = self.released = 0

    def begin_nested(self):
        return FakeSavepoint(self)


def make_rule(**kw):
    base = dict(id=uuid4(), name="r", conditions=[], actions=[{"type": "notify", "message": "x"}])
    base.update(kw)
    return SimpleNamespace(**base)


@pytest.fixture
def engine(monkeypatch):
    """Patch the engine's database edges; returns a recorder."""
    rec = SimpleNamespace(runs=[], executed=[], rules=[], snapshot=snap(), hooks=0, execute=None)

    async def load_snapshot(db, event):
        return rec.snapshot

    async def load_rules(db, project_id, trigger):
        return list(rec.rules)

    async def record_run(db, rule_id, task_id, status, message):
        rec.runs.append((rule_id, task_id, status, message))

    async def queue_hooks(db, event, s):
        rec.hooks += 1
        return 0

    async def execute_action(db, action, rule, s, event):
        rec.executed.append((rule.id, event.task_id, action))
        if rec.execute:
            return await rec.execute(db, action, rule, s, event)
        return "done"

    monkeypatch.setattr(au, "load_snapshot", load_snapshot)
    monkeypatch.setattr(au, "load_rules", load_rules)
    monkeypatch.setattr(au, "record_run", record_run)
    monkeypatch.setattr(au, "queue_project_webhooks", queue_hooks)
    monkeypatch.setattr(au, "execute_action", execute_action)
    return rec


def event(trigger="task_created", task_id=None, project_id=None):
    return TaskEvent(trigger, task_id or uuid4(), project_id or uuid4())


class TestDispatch:
    def test_matching_rule_runs_and_is_logged(self, engine):
        rule = make_rule(conditions=[{"field": "status", "op": "eq", "value": "Todo"}])
        engine.rules = [rule]
        db, ev = FakeDB(), event()
        run(au.dispatch(db, ev))
        assert engine.hooks == 1
        assert len(engine.executed) == 1
        assert engine.runs == [(rule.id, ev.task_id, "ok", "done")]
        assert (db.opened, db.released, db.rolled_back) == (1, 1, 0)

    def test_non_matching_rule_is_silent(self, engine):
        engine.rules = [make_rule(conditions=[{"field": "status", "op": "eq", "value": "Done"}])]
        run(au.dispatch(FakeDB(), event()))
        assert engine.executed == [] and engine.runs == []

    def test_no_project_means_nothing_happens(self, engine):
        engine.rules = [make_rule()]
        run(au.dispatch(FakeDB(), TaskEvent("task_created", uuid4(), None)))
        assert engine.executed == [] and engine.hooks == 0

    def test_deleted_task_is_ignored(self, engine, monkeypatch):
        async def gone(db, event):
            return None

        monkeypatch.setattr(au, "load_snapshot", gone)
        engine.rules = [make_rule()]
        run(au.dispatch(FakeDB(), event()))
        assert engine.executed == []

    def test_explicit_rules_skip_webhooks_and_rule_lookup(self, engine):
        engine.rules = [make_rule()]  # would run if looked up
        mine = make_rule()
        run(au.dispatch(FakeDB(), event("due_soon"), rules=[mine]))
        assert [e[0] for e in engine.executed] == [mine.id] and engine.hooks == 0

    def test_failing_rule_is_isolated_in_its_savepoint_and_logged(self, engine):
        bad, good = make_rule(name="bad"), make_rule(name="good")
        engine.rules = [bad, good]

        async def execute(db, action, rule, s, ev):
            if rule is bad:
                raise ValueError("Task is blocked by unfinished items")
            return "fine"

        engine.execute = execute
        db = FakeDB()
        run(au.dispatch(db, event()))  # must not raise
        assert [r[2] for r in engine.runs] == ["error", "ok"]
        assert "ValueError: Task is blocked" in engine.runs[0][3]
        assert (db.opened, db.rolled_back, db.released) == (2, 1, 1)

    def test_all_actions_of_a_rule_share_one_savepoint(self, engine):
        rule = make_rule(actions=[{"type": "notify", "message": "1"}, {"type": "notify", "message": "2"}])
        engine.rules = [rule]

        async def execute(db, action, rule, s, ev):
            if action["message"] == "2":
                raise RuntimeError("boom")
            return "ok"

        engine.execute = execute
        db = FakeDB()
        run(au.dispatch(db, event()))
        assert db.opened == 1 and db.rolled_back == 1  # the first action is undone with the second
        assert engine.runs[0][2] == "error"

    def test_dispatch_never_raises_even_when_the_engine_itself_breaks(self, engine, monkeypatch):
        async def broken(db, ev):
            raise RuntimeError("db down")

        monkeypatch.setattr(au, "load_snapshot", broken)
        run(au.dispatch(FakeDB(), event()))

    def test_cancellation_is_not_swallowed(self, engine, monkeypatch):
        async def cancelled(db, ev):
            raise asyncio.CancelledError()

        monkeypatch.setattr(au, "load_snapshot", cancelled)
        with pytest.raises(asyncio.CancelledError):
            run(au.dispatch(FakeDB(), event()))

    def test_chain_is_reset_afterwards_even_after_a_failure(self, engine):
        engine.rules = [make_rule()]

        async def execute(db, action, rule, s, ev):
            raise RuntimeError("x")

        engine.execute = execute
        run(au.dispatch(FakeDB(), event()))
        assert au._chain.get() is None

    def test_loop_guard_same_rule_same_task_runs_once(self, engine):
        """The action changes the task, which fires the same event again (what crud_task.update does)."""
        rule = make_rule()
        engine.rules = [rule]
        ev = event()

        async def execute(db, action, rule_, s, e):
            await au.dispatch(db, ev)  # nested: same rule, same task
            return "changed"

        engine.execute = execute
        run(au.dispatch(FakeDB(), ev))
        assert len(engine.executed) == 1
        statuses = [(r[2], r[3]) for r in engine.runs]
        assert statuses[0][0] == "error" and "loop guard" in statuses[0][1]  # nested attempt, recorded first
        assert statuses[1] == ("ok", "changed")

    def test_two_rules_ping_ponging_each_run_once(self, engine):
        """Rule 1 reacts to X by causing Y, rule 2 reacts to Y by causing X."""
        r1, r2 = make_rule(name="r1"), make_rule(name="r2")
        engine.rules = [r1, r2]
        ev = event()

        async def execute(db, action, rule_, s, e):
            await au.dispatch(db, ev)
            return "ok"

        engine.execute = execute
        run(au.dispatch(FakeDB(), ev))
        assert sorted(str(x[0]) for x in engine.executed) == sorted([str(r1.id), str(r2.id)])

    def test_depth_limit_stops_a_cascade_across_different_tasks(self, engine, monkeypatch):
        """Each run touches another task whose rule is a new one (e.g. parent/child cascades)."""
        depth_seen = []

        async def load_rules(db, project_id, trigger):
            return [make_rule()]

        monkeypatch.setattr(au, "load_rules", load_rules)

        async def execute(db, action, rule_, s, e):
            depth_seen.append(au._chain.get().depth)
            await au.dispatch(db, event())  # another task, another rule
            return "ok"

        engine.execute = execute
        run(au.dispatch(FakeDB(), event()))
        assert depth_seen == [1, 2, 3]  # MAX_DEPTH executions, then refusal
        skipped = [r for r in engine.runs if r[2] == "error"]
        assert len(skipped) == 1 and "levels deep" in skipped[0][3]

    def test_chains_of_separate_requests_do_not_share_state(self, engine):
        rule = make_rule()
        engine.rules = [rule]
        ev = event()
        run(au.dispatch(FakeDB(), ev))
        run(au.dispatch(FakeDB(), ev))  # a second, independent request for the same task may run the rule again
        assert len(engine.executed) == 2

    def test_later_rules_see_the_changes_of_earlier_ones(self, engine, monkeypatch):
        state = {"priority": "Low"}
        first = make_rule(name="first")
        second = make_rule(name="second", conditions=[{"field": "priority", "op": "eq", "value": "High"}])
        engine.rules = [first, second]

        async def load_snapshot(db, ev):
            return snap(priority=state["priority"])

        async def execute(db, action, rule_, s, ev):
            state["priority"] = "High"
            return "bumped"

        monkeypatch.setattr(au, "load_snapshot", load_snapshot)
        engine.execute = execute
        run(au.dispatch(FakeDB(), event()))
        assert len(engine.executed) == 2


# ---------------------------------------------------------------------------------------------------- hooks
def test_crud_task_dispatches_from_every_write_path():
    from app.crud import crud_task

    for name in ("create", "update", "update_assignees"):
        src = inspect.getsource(getattr(crud_task.CRUDTask, name))
        assert "fire_task_events" in src, f"crud_task.{name} must fire automations"
    # rules run on the already-written task: the call comes after the write and before the final refetch
    src = inspect.getsource(crud_task.CRUDTask.update)
    assert src.index("fire_task_events") > src.index("sync_project_from_tasks")


def test_due_soon_rides_on_the_daily_deadline_job():
    from app.core import scheduler

    assert "run_due_soon" in inspect.getsource(scheduler._deadline_reminders)
    job = next(j for j in scheduler.JOBS if j.name == "deadline_reminders")
    assert (job.hour, job.weekday) == (7, None)


def test_migration_chain():
    import importlib.util
    import os

    path = os.path.join(os.path.dirname(__file__), "..", "migrations", "versions", "0006_automations.py")
    spec = importlib.util.spec_from_file_location("m0006", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert (mod.revision, mod.down_revision) == ("0006", "0005")


def test_models_are_registered():
    from app.db.session import Base
    import app.models  # noqa: F401

    assert {"automation_rules", "automation_runs", "webhook_deliveries"} <= set(Base.metadata.tables)


# ---------------------------------------------------------------------------------------------------- webhooks
CTX = {
    "task": {"id": "t1", "title": "Ship it", "status": "Done", "priority": "High", "assignees": []},
    "project": {"id": "p1", "name": "Apollo"},
    "changes": {"status": ["Review", "Done"]},
    "url": "https://app.example.com/projects/p1?task_id=t1",
}


class TestPayloads:
    def test_slack(self):
        p = wh.format_event_payload("slack", "task.completed", CTX)
        assert set(p) == {"text"} and "Task completed: Ship it" in p["text"] and "<https://app.example.com" in p["text"]
        assert "Review → Done" in p["text"]

    def test_discord(self):
        p = wh.format_event_payload("discord", "task.status_changed", CTX)
        assert set(p) == {"content"} and p["content"].startswith("Status changed: Ship it in Apollo")

    def test_generic_is_structured(self):
        p = wh.format_event_payload("generic", "task.created", {**CTX, "changes": {}})
        assert p["event"] == "task.created" and p["task"]["id"] == "t1" and p["project"]["name"] == "Apollo"
        assert p["url"] == CTX["url"] and p["timestamp"].endswith("Z")

    def test_unknown_provider_falls_back_to_generic(self):
        assert "event" in wh.format_event_payload("teams", "task.created", CTX)

    def test_automation_message_is_appended(self):
        p = wh.format_event_payload("slack", "automation", {**CTX, "message": "Rule 'Escalate'"})
        assert "Rule 'Escalate'" in p["text"]


class TestDelivery:
    def test_blocked_url_is_permanent_and_never_sent(self):
        ok, err, permanent = run(wh.webhook_service.deliver("http://169.254.169.254/latest", {"a": 1}))
        assert (ok, permanent) == (False, True) and "blocked" in err

    def test_retry_backoff_grows_and_is_capped(self):
        delays = [wh.retry_delay(n).total_seconds() for n in (1, 2, 3, 20)]
        assert delays[0] == wh.RETRY_BASE_SECONDS and delays[1] == 2 * delays[0] and delays[2] == 4 * delays[0]
        assert delays[3] == 3600

    def test_http_errors_classify_retryable_vs_permanent(self, monkeypatch):
        import httpx

        def client_for(status):
            class C:
                def __init__(self, *a, **k): pass
                async def __aenter__(self): return self
                async def __aexit__(self, *a): return False
                async def post(self, url, json):
                    return httpx.Response(status, request=httpx.Request("POST", url))
            return C

        async def safe(url):
            return None

        monkeypatch.setattr(wh, "assert_safe_url", safe)
        for status, expect in ((200, (True, None, False)), (404, (False, "HTTP 404", True)), (429, (False, "HTTP 429", False)), (503, (False, "HTTP 503", False))):
            monkeypatch.setattr(wh.httpx, "AsyncClient", client_for(status))
            assert run(wh.webhook_service.deliver("https://hooks.example.com/x", {})) == expect

    def test_request_never_posts_itself(self):
        """Project webhooks are queued by the engine, not sent inline."""
        assert "webhook_service" not in inspect.getsource(au.queue_project_webhooks)
        assert "enqueue_delivery" in inspect.getsource(au.queue_project_webhooks)


class TestWebhookQueueing:
    def test_done_via_status_change_does_not_double_notify(self, monkeypatch):
        called = []
        ev = TaskEvent("status_changed", uuid4(), uuid4(), {"status": ("Review", "Done")})
        db = FakeDB()
        monkeypatch.setattr(au, "webhook_context", lambda *a, **k: called.append(1) or {})
        assert run(au.queue_project_webhooks(db, ev, snap())) == 0 and not called and db.opened == 0

    def test_due_soon_has_no_builtin_webhook(self):
        assert run(au.queue_project_webhooks(FakeDB(), TaskEvent("due_soon", uuid4(), uuid4()), snap())) == 0
