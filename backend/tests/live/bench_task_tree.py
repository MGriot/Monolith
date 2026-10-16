"""Query-count / equivalence benchmark for task tree loading. Runs inside the backend container."""
import asyncio
import hashlib
import json
import sys
import time
import uuid
from datetime import datetime, timedelta

from sqlalchemy import event, select
from sqlalchemy.orm import selectinload

from app.crud import crud_task
from app.db.session import AsyncSessionLocal, engine
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.schemas.task import Task as TaskSchema


def legacy_options():
    def level(inner):
        base = [
            selectinload(Task.owner), selectinload(Task.assignees), selectinload(Task.blocked_by),
            selectinload(Task.blocking), selectinload(Task.topic_ref), selectinload(Task.type_ref),
            selectinload(Task.topics), selectinload(Task.types),
        ]
        return selectinload(Task.subtasks).options(*base, *( [inner] if inner is not None else [] ))

    inner = selectinload(Task.subtasks)
    for _ in range(3):
        inner = level(inner)
    return [
        selectinload(Task.owner), selectinload(Task.assignees), selectinload(Task.blocked_by),
        selectinload(Task.blocking), selectinload(Task.topic_ref), selectinload(Task.type_ref),
        selectinload(Task.topics), selectinload(Task.types), selectinload(Task.project), inner,
    ]


async def legacy_get_multi(db, project_id, limit=100):
    q = (select(Task).filter(Task.project_id == project_id, Task.is_archived == False, Task.parent_id == None)  # noqa: E712
         .order_by(Task.sort_index.asc(), Task.created_at.asc()).options(*legacy_options()).offset(0).limit(limit))
    tasks = (await db.execute(q)).scalars().all()

    def srt(t):
        if t.subtasks:
            t.subtasks.sort(key=lambda x: (x.sort_index or 0, x.created_at))
            for s in t.subtasks:
                srt(s)
    for t in tasks:
        srt(t)
    return tasks


class Counter:
    def __init__(self):
        self.n = 0

    def __enter__(self):
        event.listen(engine.sync_engine, "before_cursor_execute", self._cb)
        return self

    def __exit__(self, *a):
        event.remove(engine.sync_engine, "before_cursor_execute", self._cb)

    def _cb(self, *a, **k):
        self.n += 1


def dump(tasks):
    out = [TaskSchema.model_validate(t).model_dump(mode="json") for t in tasks]
    return hashlib.sha256(json.dumps(out, sort_keys=True, default=str).encode()).hexdigest()[:12], len(json.dumps(out))


async def build_tree(db, project_id, owner_id, depth, fanout):
    """roots (fanout[0]) -> children (fanout[1]) -> ... ; returns total task count."""
    total = 0
    now = datetime(2025, 1, 1)

    async def rec(parent_id, level):
        nonlocal total
        if level >= depth:
            return
        for i in range(fanout[level]):
            t = Task(id=uuid.uuid4(), project_id=project_id, parent_id=parent_id, owner_id=owner_id,
                     title=f"L{level}-{i}", sort_index=i * 10, created_at=now + timedelta(seconds=total),
                     start_date=now, due_date=now + timedelta(days=3), checklist=[])
            db.add(t)
            total += 1
            await db.flush()
            await rec(t.id, level + 1)

    await rec(None, 0)
    return total


async def purge_old():
    async with AsyncSessionLocal() as db:
        for p in (await db.execute(select(Project).where(Project.name.like("bench-%")))).scalars().all():
            for t in (await db.execute(select(Task).where(Task.project_id == p.id, Task.parent_id == None))).scalars().all():  # noqa: E711
                await db.delete(t)
            await db.commit()
            await db.delete(await db.get(Project, p.id))
            await db.commit()


async def main():
    await purge_old()
    shape = [int(x) for x in (sys.argv[1] if len(sys.argv) > 1 else "5,3,3,2").split(",")]
    async with AsyncSessionLocal() as db:
        owner = (await db.execute(select(User).limit(1))).scalars().first()
        project = Project(id=uuid.uuid4(), name="bench-" + uuid.uuid4().hex[:6], owner_id=owner.id)
        db.add(project)
        await db.flush()
        total = await build_tree(db, project.id, owner.id, len(shape), shape)
        await db.commit()
        pid = project.id
    print(f"tree shape {shape}: {total} tasks")

    results = {}
    for name, fn in (
        ("legacy", lambda s: legacy_get_multi(s, pid)),
        ("current", lambda s: crud_task.task.get_multi_by_project(s, project_id=pid)),
    ):
        async with AsyncSessionLocal() as db:
            try:
                with Counter() as c:
                    t0 = time.perf_counter()
                    tasks = await fn(db)
                    t1 = time.perf_counter()
                    digest, size = dump(tasks)
            except Exception as e:  # noqa: BLE001
                results[name] = (None, None, "FAILED", 0)
                print(f"{name:8s} FAILED: {type(e).__name__}")
                continue
            results[name] = (c.n, round((t1 - t0) * 1000), digest, size)
            print(f"{name:8s} queries={c.n:3d}  load={round((t1 - t0) * 1000):5d} ms  json={size} bytes  digest={digest}")

    # single task with full subtree
    async with AsyncSessionLocal() as db:
        root_id = (await db.execute(select(Task.id).where(Task.project_id == pid, Task.parent_id == None).limit(1))).scalar()  # noqa: E711
    async with AsyncSessionLocal() as db:
        with Counter() as c:
            t = await crud_task.task.get(db, root_id)
            digest, size = dump([t])
        print(f"get()    queries={c.n:3d}  json={size} bytes  digest={digest}")

    if results["legacy"][2] == "FAILED":
        print("legacy cannot load this tree; current OK" if results["current"][2] != "FAILED" else "BOTH FAILED")
    else:
        print("EQUIVALENT" if results["legacy"][2] == results["current"][2] else "DIFFERENT OUTPUT")

    async with AsyncSessionLocal() as db:   # cleanup
        for t in (await db.execute(select(Task).where(Task.project_id == pid, Task.parent_id == None))).scalars().all():  # noqa: E711
            await db.delete(t)
        await db.commit()
        p = await db.get(Project, pid)
        await db.delete(p)
        await db.commit()


asyncio.run(main())
