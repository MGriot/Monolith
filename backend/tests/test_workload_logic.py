import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timedelta

from app.api.api_v1.endpoints.dashboard import get_team_workload
from app.models.user import User
from app.models.task import Task
from app.core.enums import Status

@pytest.mark.asyncio
async def test_workload_logic():
    print("Testing Resource Workload Leveling Logic...")
    
    db = AsyncMock()
    user_id = uuid4()
    current_user = User(id=user_id, is_superuser=True)
    
    # 1. Mock Users
    mock_users_res = MagicMock()
    mock_users_res.scalars.return_value.all.return_value = [
        User(id=user_id, full_name="Test User", is_active=True)
    ]
    
    # 2. Mock Tasks
    now = datetime.utcnow()
    task = Task(
        id=uuid4(),
        title="Test Task",
        start_date=now,
        due_date=now + timedelta(days=1), # 2 days duration
        status=Status.TODO,
        is_archived=False
    )
    task.assignees = [User(id=user_id)]
    
    mock_tasks_res = MagicMock()
    mock_tasks_res.scalars.return_value.all.return_value = [task]
    
    # Configure db.execute to return different results based on the query
    # This is simplified: first call users, second call tasks
    db.execute.side_effect = [mock_users_res, mock_tasks_res]
    
    response = await get_team_workload(db=db, current_user=current_user, days=7)
    
    assert len(response.users) == 1
    user_data = response.users[0]
    assert user_data.user_id == str(user_id)
    
    # Task is 2 days, 8h total -> 4h per day
    # Day 0 should have 4h
    assert user_data.workload[0].hours == 4.0
    assert user_data.workload[0].task_count == 1
    print("PASS: Workload calculation correct (4h/day for 2 days)")


def _reference_workload(users, tasks, start_date, days):
    """The original O(users x tasks x task-span) algorithm, kept as the oracle for the optimised endpoint."""
    out = []
    for user in users:
        user_tasks = [t for t in tasks if any(u.id == user.id for u in t.assignees)]
        day_map = {(start_date + timedelta(days=i)).isoformat(): {"hours": 0.0, "count": 0} for i in range(days)}
        is_over = False
        for task in user_tasks:
            t_start, t_due = task.start_date.date(), task.due_date.date()
            t_dur = (t_due - t_start).days + 1
            if t_dur <= 0:
                continue
            curr = t_start
            while curr <= t_due:
                d = curr.isoformat()
                if d in day_map:
                    day_map[d]["hours"] += 8.0 / t_dur
                    day_map[d]["count"] += 1
                    if day_map[d]["hours"] > 8.0:
                        is_over = True
                curr += timedelta(days=1)
        out.append((str(user.id), [(d, round(v["hours"], 1), v["count"]) for d, v in day_map.items()], is_over))
    return out


@pytest.mark.asyncio
async def test_workload_matches_the_reference_on_random_plans():
    import random

    rng = random.Random(7)
    users = [User(id=uuid4(), full_name=f"U{i}", is_active=True) for i in range(6)]
    today = datetime.utcnow().replace(hour=9)
    tasks = []
    for _ in range(300):
        start = today + timedelta(days=rng.randint(-60, 60), hours=rng.randint(0, 12))
        task = Task(id=uuid4(), title="t", status=Status.TODO, is_archived=False,
                    start_date=start, due_date=start + timedelta(days=rng.randint(-2, 40)))
        task.assignees = rng.sample(users, rng.randint(0, 3))
        tasks.append(task)

    for days in (1, 14, 90):
        start_date = datetime.utcnow().date()
        window_end = start_date + timedelta(days=days - 1)
        # the endpoint asks SQL only for tasks that overlap the window; give it exactly those
        overlapping = [t for t in tasks if t.due_date.date() >= start_date and t.start_date.date() <= window_end]
        users_res, tasks_res = MagicMock(), MagicMock()
        users_res.scalars.return_value.all.return_value = users
        tasks_res.scalars.return_value.all.return_value = overlapping
        db = AsyncMock()
        db.execute.side_effect = [users_res, tasks_res]

        response = await get_team_workload(db=db, current_user=users[0], days=days)
        got = [(u.user_id, [(w.date, w.hours, w.task_count) for w in u.workload], u.is_overallocated)
               for u in response.users]
        assert got == _reference_workload(users, tasks, start_date, days)
