import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.core.cpm import calculate_cpm
from app.core.enums import DependencyType
from app.schemas.task import Dependency, Task

BASE = datetime(2026, 10, 1, 9, 0)
PROJECT_ID = uuid.uuid4()


def make_task(title, start_day, end_day, **kwargs):
    return Task(
        id=uuid.uuid4(),
        title=title,
        project_id=PROJECT_ID,
        start_date=BASE + timedelta(days=start_day),
        due_date=BASE + timedelta(days=end_day),
        created_at=BASE,
        updated_at=BASE,
        **kwargs,
    )


def link(pred, succ, dep_type=DependencyType.FS, lag=0):
    succ.blocked_by.append(
        Dependency(
            id=uuid.uuid4(),
            predecessor_id=pred.id,
            successor_id=succ.id,
            type=dep_type,
            lag_days=lag,
        )
    )


def test_longest_chain_is_critical_and_short_branch_has_slack():
    a = make_task("A", 0, 5)
    b = make_task("B", 5, 15)
    c = make_task("C", 15, 20)
    side = make_task("Side", 5, 7)
    link(a, b)
    link(b, c)
    link(a, side)

    calculate_cpm([a, b, c, side])

    assert [a.is_critical, b.is_critical, c.is_critical] == [True, True, True]
    assert side.is_critical is False
    assert side.slack_days == 13


def test_gaps_in_the_plan_do_not_break_the_chain():
    a = make_task("A", 0, 5)
    # Planned to start 10 days after A finishes: still driven by A logically
    b = make_task("B", 15, 20)
    other = make_task("Other", 0, 3)
    link(a, b)

    calculate_cpm([a, b, other])

    assert a.is_critical and b.is_critical
    assert other.is_critical is False


def test_project_due_date_after_last_finish_still_yields_critical_chain():
    project = SimpleNamespace(due_date=BASE + timedelta(days=90))
    a = make_task("A", 0, 5)
    b = make_task("B", 5, 10)
    link(a, b)
    # The anchor is the computed finish, not the (much later) project deadline
    a.project = project
    b.project = project

    calculate_cpm([a, b])

    assert a.is_critical and b.is_critical
    assert a.slack_days == 0 and b.slack_days == 0


def test_lag_and_start_to_start_links():
    a = make_task("A", 0, 10)
    b = make_task("B", 2, 6)  # SS +2 on A, 4 days long
    c = make_task("C", 0, 1)  # FS on B
    link(a, b, DependencyType.SS, lag=2)
    link(b, c)

    calculate_cpm([a, b, c])

    # A (10d) is the longest path; B+C finish on day 7
    assert a.is_critical
    assert b.is_critical is False
    assert b.slack_days == 3
    assert c.slack_days == 3


def test_finish_to_finish_link():
    a = make_task("A", 0, 10)
    b = make_task("B", 0, 4)
    link(a, b, DependencyType.FF)

    calculate_cpm([a, b])

    # B must finish with A: both critical
    assert a.is_critical and b.is_critical


def test_blocked_by_ids_are_treated_as_finish_to_start():
    a = make_task("A", 0, 5)
    b = make_task("B", 20, 25)
    b.blocked_by_ids = [a.id]
    other = make_task("Other", 0, 3)

    calculate_cpm([a, b, other])

    assert a.is_critical and b.is_critical
    assert other.is_critical is False


def test_hard_deadline_makes_task_critical_with_negative_slack():
    a = make_task("A", 0, 10, deadline_at=BASE + timedelta(days=8))
    other = make_task("Other", 0, 20)

    calculate_cpm([a, other])

    assert a.is_critical
    assert a.slack_days < 0


def test_subtasks_take_part_in_the_analysis():
    parent = make_task("Parent", 0, 10)
    s1 = make_task("S1", 0, 4)
    s2 = make_task("S2", 4, 10)
    link(s1, s2)
    parent.subtasks = [s1, s2]

    calculate_cpm([parent])

    assert s1.is_critical and s2.is_critical and parent.is_critical


def test_cycles_do_not_hang():
    a = make_task("A", 0, 5)
    b = make_task("B", 5, 10)
    link(a, b)
    link(b, a)

    calculate_cpm([a, b])

    assert a.slack_days is not None and b.slack_days is not None


def test_schema_default_slack_is_unset():
    assert make_task("Fresh", 0, 1).slack_days is None
