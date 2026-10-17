"""Automation rules + project webhooks live checks (run inside the backend container, against the proxy).
Needs a fresh DB (creates ava/ben/cy/dan). Reads the queue tables directly through the app's own session."""
import asyncio
import os
import secrets
import sys
import time
import uuid
from datetime import datetime, timedelta

import httpx

sys.path.insert(0, "/app")

BASE = os.environ.get("BASE", "http://proxy")
ADMIN_EMAIL, ADMIN_PW = os.environ["FIRST_SUPERUSER_EMAIL"], os.environ["FIRST_SUPERUSER_PASSWORD"]
results = []
loop = asyncio.new_event_loop()


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  -> {detail}" if (detail and not cond) else ""), flush=True)


def sql(text_sql, **params):
    """Run one statement through the app's engine; returns rows (or [])."""
    from sqlalchemy import text

    from app.db.session import AsyncSessionLocal

    async def go():
        async with AsyncSessionLocal() as db:
            res = await db.execute(text(text_sql), params)
            rows = res.all() if res.returns_rows else []
            await db.commit()
            return rows

    return loop.run_until_complete(go())


c = httpx.Client(base_url=BASE, timeout=30)
H = lambda t: {"Authorization": f"Bearer {t}"}  # noqa: E731
admin = c.post("/api/v1/login/access-token", data={"username": ADMIN_EMAIL, "password": ADMIN_PW}).json()["access_token"]
pw = "Sup3r-" + secrets.token_hex(6)
tok, uid = {}, {}
for n in ("ava", "ben", "cy", "dan"):
    r = c.post("/api/v1/users/", headers=H(admin), json={"email": f"{n}@example.com", "password": pw, "full_name": n})
    uid[n] = r.json()["id"]
    tok[n] = c.post("/api/v1/login/access-token", data={"username": f"{n}@example.com", "password": pw}).json()["access_token"]
AVA, BEN, CY, DAN = (H(tok[n]) for n in ("ava", "ben", "cy", "dan"))

pid = c.post("/api/v1/projects/", headers=AVA, json={"name": "Auto project", "member_ids": [uid["ben"], uid["cy"]]}).json()["id"]
c.put(f"/api/v1/projects/{pid}/members/{uid['cy']}", headers=AVA, json={"role": "viewer"})
R = f"/api/v1/projects/{pid}/automations"
mk = lambda title, **kw: c.post("/api/v1/tasks/", headers=AVA, json={"title": title, "project_id": pid, **kw}).json()  # noqa: E731
upd = lambda t, **kw: c.put(f"/api/v1/tasks/{t['id']}", headers=AVA, json=kw)  # noqa: E731
get = lambda t: c.get(f"/api/v1/tasks/{t['id']}", headers=AVA).json()  # noqa: E731
rule = lambda **kw: c.post(R, headers=AVA, json=kw)  # noqa: E731
runs = lambda rid: c.get(f"{R}/{rid}/runs", headers=AVA).json()  # noqa: E731
notify_action = {"type": "notify", "to": "owner", "message": "{task_title} is now {status}", "email": True}

# ---- permissions
check("viewer can read the rules", c.get(R, headers=CY).status_code == 200)
check("non-member cannot read the rules (403)", c.get(R, headers=DAN).status_code == 403)
body = {"name": "x", "trigger": "task_created", "actions": [notify_action]}
check("viewer cannot create a rule (403)", c.post(R, headers=CY, json=body).status_code == 403)
check("editor cannot create a rule (403)", c.post(R, headers=BEN, json=body).status_code == 403)
check("non-member cannot create a rule (403)", c.post(R, headers=DAN, json=body).status_code == 403)
check("viewer cannot add a project webhook (403)", c.post("/api/v1/webhooks/", headers=CY, json={"name": "w", "url": "https://hooks.example.com/x", "project_id": pid}).status_code == 403)

# ---- validation
for label, bad in {
    "unknown trigger": {**body, "trigger": "nope"},
    "no actions": {**body, "actions": []},
    "bad condition": {**body, "conditions": [{"field": "status", "value": "Finished"}]},
    "assigning a non-member": {**body, "actions": [{"type": "assign_user", "user_id": uid["dan"]}]},
    "foreign webhook": {**body, "actions": [{"type": "call_webhook", "webhook_id": str(uuid.uuid4())}]},
}.items():
    check(f"invalid rule rejected: {label}", c.post(R, headers=AVA, json=bad).status_code == 400)

# ---- task_created: condition + set_field + notify (in-app and e-mail)
r = rule(name="Urgent first", trigger="task_created", conditions=[{"field": "title", "op": "contains", "value": "urgent"}],
         actions=[{"type": "set_field", "field": "priority", "value": "Critical"}, notify_action])
check("owner creates a rule", r.status_code == 200, r.text[:200])
urgent_rule = r.json()["id"]
t_plain = mk("plain task", priority="Low")
t_urgent = mk("URGENT fix", priority="Low")
check("non-matching task is untouched", get(t_plain)["priority"] == "Low")
check("matching task was changed by the rule", t_urgent["priority"] == "Critical" and get(t_urgent)["priority"] == "Critical", t_urgent.get("priority"))
rr = runs(urgent_rule)
check("exactly one run, ok, for the matching task", len(rr) == 1 and rr[0]["status"] == "ok" and rr[0]["task_id"] == t_urgent["id"], rr)
notes = c.get("/api/v1/notifications/", headers=AVA).json()
check("in-app notification created from the template", any(n["type"] == "automation" and "URGENT fix is now" in n["message"] for n in notes), [n["message"] for n in notes][:3])
mails = sql("SELECT kind FROM email_outbox WHERE kind = 'automation' AND to_email = 'ava@example.com'")
check("e-mail queued with the automation template", len(mails) >= 1, mails)

# ---- status_changed + assign_user; disabled rules do not run
r = rule(name="Pick up work", trigger="status_changed", conditions=[{"field": "status", "value": "In Progress"}, {"field": "old_status", "value": "Todo"}],
         actions=[{"type": "assign_user", "user_id": uid["ben"]}])
pick_rule = r.json()["id"]
check("rule with old_status condition is saved", r.status_code == 200, r.text[:200])
upd(t_plain, status="In Progress")
check("status change assigned the user", [a["id"] for a in get(t_plain)["assignees"]] == [uid["ben"]], get(t_plain)["assignees"])
check("the assignment notified the assignee as usual", any(n["type"] == "assignment" for n in c.get("/api/v1/notifications/", headers=BEN).json()))
c.put(f"{R}/{pick_rule}", headers=AVA, json={"enabled": False})
t_off = mk("off")
upd(t_off, status="In Progress")
check("disabled rule does not run", get(t_off)["assignees"] == [] and len(runs(pick_rule)) == 1)
check("viewer can read the run history", c.get(f"{R}/{pick_rule}/runs", headers=CY).status_code == 200)

# ---- loop safety: two rules that undo each other, in one request
a = rule(name="Review -> Todo", trigger="status_changed", conditions=[{"field": "status", "value": "Review"}], actions=[{"type": "set_field", "field": "status", "value": "Todo"}]).json()["id"]
b = rule(name="Todo -> Review", trigger="status_changed", conditions=[{"field": "status", "value": "Todo"}], actions=[{"type": "set_field", "field": "status", "value": "Review"}]).json()["id"]
t_loop = mk("loopy")
t0 = time.time()
r = upd(t_loop, status="Review")
check("ping-pong rules terminate and the request succeeds", r.status_code == 200 and time.time() - t0 < 15, f"{r.status_code} {time.time() - t0:.1f}s")
ra, rb = runs(a), runs(b)
check("the number of runs is bounded", 1 <= len(ra) + len(rb) <= 8, (len(ra), len(rb)))
check("the loop guard recorded why it stopped", any(("loop guard" in (x["message"] or "") or "levels deep" in (x["message"] or "")) for x in ra + rb), (ra, rb))
check("the task ends in a valid status", get(t_loop)["status"] in ("Todo", "Review"))
for rid in (a, b):
    c.delete(f"{R}/{rid}", headers=AVA)

# ---- failure isolation: a rule whose webhook was deleted fails; the edit and the other rules are unaffected
hook_id = str(uuid.uuid4())
sql("INSERT INTO webhooks (id, name, url, provider, is_active, owner_id, project_id, created_at, updated_at) "
    "VALUES (:i, 'hook', 'https://hooks.example.com/slack', 'slack', true, :o, :p, now(), now())", i=hook_id, o=uid["ava"], p=pid)
bad = rule(name="Broken hook", trigger="task_completed", actions=[{"type": "set_field", "field": "priority", "value": "Low"}, {"type": "call_webhook", "webhook_id": hook_id}]).json()["id"]
good = rule(name="Completed note", trigger="task_completed", actions=[notify_action]).json()["id"]
sql("DELETE FROM webhooks WHERE id = :i", i=hook_id)
hook_id = str(uuid.uuid4())
sql("INSERT INTO webhooks (id, name, url, provider, is_active, owner_id, project_id, created_at, updated_at) "
    "VALUES (:i, 'hook', 'https://hooks.example.com/slack', 'slack', true, :o, :p, now(), now())", i=hook_id, o=uid["ava"], p=pid)
t_done = mk("finish me", priority="High")
r = upd(t_done, status="Done")
check("completing a task succeeds although a rule fails", r.status_code == 200 and get(t_done)["status"] == "Done", r.text[:200])
rb_, rg_ = runs(bad), runs(good)
check("the failing rule is recorded as an error", len(rb_) == 1 and rb_[0]["status"] == "error" and "webhook" in rb_[0]["message"], rb_)
check("its earlier action was rolled back with it (SAVEPOINT)", get(t_done)["priority"] == "High", get(t_done)["priority"])
check("the next rule still ran", len(rg_) == 1 and rg_[0]["status"] == "ok", rg_)

# ---- project webhooks: queued, one message per event, per-provider format
sql("DELETE FROM webhook_deliveries")
t_w = mk("webhook task")
upd(t_w, status="In Progress")
upd(t_w, status="Done")
time.sleep(0.5)
rows = sql("SELECT event, provider, payload FROM webhook_deliveries ORDER BY created_at")
events = [x[0] for x in rows]
check("created, status_changed and completed were queued (completed not duplicated as status_changed)",
      events.count("task.created") == 1 and events.count("task.completed") == 1 and events.count("task.status_changed") == 1, events)
check("slack payload has text and a link", all("text" in x[2] and "task_id=" in x[2]["text"] for x in rows), rows[:1])
t_as = mk("assign me")
c.put(f"/api/v1/tasks/{t_as['id']}", headers=AVA, json={"assignee_ids": [uid["ben"]]})
check("assignment queued a task.assigned delivery", "task.assigned" in [x[0] for x in sql("SELECT event FROM webhook_deliveries")])
sql("UPDATE webhooks SET provider = 'generic' WHERE id = :i", i=hook_id)
sql("DELETE FROM webhook_deliveries")
mk("generic hook")
rows = sql("SELECT payload FROM webhook_deliveries")
check("generic payload is structured JSON", rows and rows[0][0]["event"] == "task.created" and rows[0][0]["project"]["id"] == pid, rows)
# the worker eventually tries (and the SSRF/DNS guard or the network decides); the request never waited for it
time.sleep(4)
st = sql("SELECT status, attempts FROM webhook_deliveries")
check("the worker picked the delivery up", st and st[0][1] >= 1, st)
# a rule can call a project webhook explicitly
w = rule(name="Ping", trigger="task_created", actions=[{"type": "call_webhook", "webhook_id": hook_id}])
check("rule referencing a project webhook is accepted", w.status_code == 200, w.text[:200])
sql("DELETE FROM webhook_deliveries")
mk("ping")
events = [x[0] for x in sql("SELECT event FROM webhook_deliveries")]
check("call_webhook queued an automation delivery next to the built-in event", "automation" in events and "task.created" in events, events)

# ---- due_soon (the daily job calls run_due_soon; fired directly here)
d = rule(name="Due soon", trigger="due_soon", actions=[{"type": "notify", "to": "owner", "message": "{task_title} is due soon", "email": False}]).json()["id"]
soon = mk("due tomorrow", due_date=(datetime.utcnow() + timedelta(hours=20)).isoformat())
mk("due next month", due_date=(datetime.utcnow() + timedelta(days=30)).isoformat())


def sweep():
    from app.core.automations import run_due_soon
    from app.db.session import AsyncSessionLocal

    async def go():
        async with AsyncSessionLocal() as db:
            return await run_due_soon(db)

    return loop.run_until_complete(go())


first = sweep()
rr = runs(d)
check("due_soon sweep ran the rule for the task due within 48 h only", first == 1 and len(rr) == 1 and rr[0]["task_id"] == soon["id"], (first, rr))
check("a second sweep does not repeat it", sweep() == 0 and len(runs(d)) == 1)

# ---- deleting
check("deleting a rule removes it and its history", c.delete(f"{R}/{d}", headers=AVA).status_code == 204 and c.get(f"{R}/{d}/runs", headers=AVA).status_code == 404)
check("editor cannot delete a rule (403)", c.delete(f"{R}/{urgent_rule}", headers=BEN).status_code == 403)
check("rule of another project is not reachable through this one", c.get(f"/api/v1/projects/{uuid.uuid4()}/automations/{urgent_rule}/runs", headers=AVA).status_code == 404)

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
