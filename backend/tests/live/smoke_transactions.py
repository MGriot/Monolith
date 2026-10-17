"""Live checks for the unit of work and the idea promotion fix (run inside the backend container).

Uses the real Postgres: failures injected half-way through compound CRUD operations must leave NOTHING behind.
"""
import asyncio
import os
import secrets
import sys

import httpx
from sqlalchemy import func, select

BASE = os.environ.get("BASE", "http://proxy")
ADMIN_EMAIL, ADMIN_PW = os.environ["FIRST_SUPERUSER_EMAIL"], os.environ["FIRST_SUPERUSER_PASSWORD"]
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  -> {detail}" if (detail and not cond) else ""), flush=True)


c = httpx.Client(base_url=BASE, timeout=30)
token = c.post("/api/v1/login/access-token", data={"username": ADMIN_EMAIL, "password": ADMIN_PW}).json()["access_token"]
H = {"Authorization": f"Bearer {token}"}
pid = c.post("/api/v1/projects/", headers=H, json={"name": "tx-" + secrets.token_hex(3)}).json()["id"]

# ---- the idea -> task promotion endpoint used to fail with AttributeError (method did not exist)
idea = c.post("/api/v1/ideas/", headers=H, json={"title": "Promote me", "description": "from an idea", "project_id": pid})
check("idea created", idea.status_code == 200, idea.text[:150])
iid = idea.json()["id"]
r = c.post(f"/api/v1/ideas/{iid}/promote", headers=H)
check("promoting an idea to a task works", r.status_code == 200 and r.json()["title"] == "Promote me", f"{r.status_code} {r.text[:200]}")
if r.status_code == 200:
    check("the new task belongs to the idea's project", r.json()["project_id"] == pid)
    check("the new task is fetchable", c.get(f"/api/v1/tasks/{r.json()['id']}", headers=H).status_code == 200)
ideas = c.get(f"/api/v1/ideas/?project_id={pid}", headers=H).json()
check("the idea is marked converted and points at the task", any(i["id"] == iid and i["status"] == "Converted" for i in ideas), ideas)
r2 = c.post(f"/api/v1/ideas/{iid}/promote", headers=H)
check("promoting twice is refused (400), not duplicated", r2.status_code == 400, r2.status_code)
n_tasks = len([t for t in c.get(f"/api/v1/tasks/?project_id={pid}", headers=H).json() if t["title"] == "Promote me"])
check("exactly one task exists for the idea", n_tasks == 1, n_tasks)

# ---- an idea attached to a task becomes a subtask of it
parent = c.post("/api/v1/tasks/", headers=H, json={"title": "Parent", "project_id": pid}).json()
idea2 = c.post("/api/v1/ideas/", headers=H, json={"title": "Child idea", "project_id": pid, "task_id": parent["id"]}).json()
sub = c.post(f"/api/v1/ideas/{idea2['id']}/promote", headers=H)
check("an idea hanging off a task is promoted to a subtask", sub.status_code == 200 and sub.json()["parent_id"] == parent["id"], sub.text[:200])

# ---- unit of work against the real database
from app.crud import crud_task as crud_task_module  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.db.transaction import transaction  # noqa: E402
from app.models.task import Task  # noqa: E402
from app.schemas.task import TaskCreate  # noqa: E402

crud = crud_task_module.task


async def count(prefix):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(func.count()).select_from(Task).where(Task.title.like(prefix + "%")))).scalar()


async def title_of(task_id):
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Task.title).where(Task.id == task_id))).scalar()


async def main():
    import uuid

    project_id = uuid.UUID(pid)

    # explicit block: two creates, then a failure -> both gone
    async with AsyncSessionLocal() as db:
        try:
            async with transaction(db):
                await crud.create(db, obj_in=TaskCreate(title="tx-block-a", project_id=project_id))
                await crud.create(db, obj_in=TaskCreate(title="tx-block-b", project_id=project_id))
                raise RuntimeError("boom")
        except RuntimeError:
            pass
    check("a failure after two creates rolls both back", await count("tx-block-") == 0, await count("tx-block-"))

    async with AsyncSessionLocal() as db:
        async with transaction(db):
            await crud.create(db, obj_in=TaskCreate(title="tx-ok-a", project_id=project_id))
            await crud.create(db, obj_in=TaskCreate(title="tx-ok-b", project_id=project_id))
    check("a successful block persists everything", await count("tx-ok-") == 2)

    # no block: a single create commits immediately, as before
    async with AsyncSessionLocal() as db:
        await crud.create(db, obj_in=TaskCreate(title="tx-plain", project_id=project_id))
    check("outside a block a create is committed right away", await count("tx-plain") == 1)

    # a failure in the LAST step of create (project sync) must not leave the half-created task
    orig_sync = crud.sync_project_from_tasks

    async def failing_sync(db, project_id):
        raise RuntimeError("injected failure in sync_project_from_tasks")

    crud.sync_project_from_tasks = failing_sync
    try:
        async with AsyncSessionLocal() as db:
            try:
                await crud.create(db, obj_in=TaskCreate(title="tx-halfway", project_id=project_id))
                raised = False
            except RuntimeError:
                raised = True
        check("create propagates the injected failure", raised)
        check("... and leaves no half-created task behind (used to be committed already)", await count("tx-halfway") == 0, await count("tx-halfway"))

        # same for update: the title change was committed by the first step before
        async with AsyncSessionLocal() as db:
            tid = (await db.execute(select(Task.id).where(Task.title == "tx-plain"))).scalar()
        async with AsyncSessionLocal() as db:
            obj = await crud.get(db, tid)
            try:
                await crud.update(db, db_obj=obj, obj_in={"title": "tx-renamed"})
            except RuntimeError:
                pass
        check("update rolls back its first step when a later step fails", await title_of(tid) == "tx-plain", await title_of(tid))
    finally:
        crud.sync_project_from_tasks = orig_sync

    async with AsyncSessionLocal() as db:
        obj = await crud.get(db, tid)
        await crud.update(db, db_obj=obj, obj_in={"title": "tx-renamed"})
    check("the same update succeeds when nothing fails", await title_of(tid) == "tx-renamed")

    # remove: failure after the delete rolls the delete back
    orig_parent = crud.update_parent_status_recursive

    async def failing_parent(db, parent_id):
        raise RuntimeError("injected failure in update_parent_status_recursive")

    async with AsyncSessionLocal() as db:
        parent_obj = await crud.create(db, obj_in=TaskCreate(title="tx-parent", project_id=project_id))
        child_obj = await crud.create(db, obj_in=TaskCreate(title="tx-child", project_id=project_id, parent_id=parent_obj.id))
    crud.update_parent_status_recursive = failing_parent
    try:
        async with AsyncSessionLocal() as db:
            try:
                await crud.remove(db, id=child_obj.id)
            except RuntimeError:
                pass
        check("a failed remove leaves the task in place", await title_of(child_obj.id) == "tx-child")
    finally:
        crud.update_parent_status_recursive = orig_parent
    async with AsyncSessionLocal() as db:
        await crud.remove(db, id=child_obj.id)
    check("remove works when nothing fails", await title_of(child_obj.id) is None)

    # many concurrent atomic operations on separate sessions: no deadlock, no lost writes
    async def worker(i):
        async with AsyncSessionLocal() as db:
            await crud.create(db, obj_in=TaskCreate(title=f"tx-par-{i}", project_id=project_id))

    await asyncio.gather(*[worker(i) for i in range(12)])
    check("12 concurrent creates all land", await count("tx-par-") == 12, await count("tx-par-"))


asyncio.run(main())

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
