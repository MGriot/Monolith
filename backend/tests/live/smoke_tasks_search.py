"""Tier-1 live checks (run inside the backend container, against the proxy). Needs a fresh DB (creates carol/dave)."""
import os
import secrets
import sys

import httpx

BASE = os.environ.get("BASE", "http://proxy")
ADMIN_EMAIL, ADMIN_PW = os.environ["FIRST_SUPERUSER_EMAIL"], os.environ["FIRST_SUPERUSER_PASSWORD"]
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  -> {detail}" if (detail and not cond) else ""), flush=True)


c = httpx.Client(base_url=BASE, timeout=30)
H = lambda t: {"Authorization": f"Bearer {t}"}  # noqa: E731
admin = c.post("/api/v1/login/access-token", data={"username": ADMIN_EMAIL, "password": ADMIN_PW}).json()["access_token"]
pw = "Sup3r-" + secrets.token_hex(6)
tok, uid = {}, {}
for n in ("carol", "dave"):
    r = c.post("/api/v1/users/", headers=H(admin), json={"email": f"{n}@example.com", "password": pw, "full_name": n})
    uid[n] = r.json()["id"]
    tok[n] = c.post("/api/v1/login/access-token", data={"username": f"{n}@example.com", "password": pw}).json()["access_token"]
C, D = H(tok["carol"]), H(tok["dave"])

# ---- pagination caps
for path in ("/api/v1/tasks/?limit=100000", "/api/v1/users/?limit=0", "/api/v1/ideas/?limit=501"):
    r = c.get(path, headers=C)
    check(f"{path.split('?')[1]} rejected with 422", r.status_code == 422, r.status_code)
check("limit=500 accepted", c.get("/api/v1/users/?limit=500", headers=C).status_code == 200)

# ---- deep task tree through the real API (previously a 500 beyond 4 levels)
pid = c.post("/api/v1/projects/", headers=C, json={"name": "Deep project"}).json()["id"]
parent = None
ids = []
for depth in range(8):
    body = {"title": f"level {depth}", "project_id": pid}
    if parent:
        body["parent_id"] = parent
    r = c.post("/api/v1/tasks/", headers=C, json=body)
    check(f"create task at depth {depth}", r.status_code == 200, r.text[:150])
    parent = r.json()["id"]
    ids.append(parent)
r = c.get(f"/api/v1/tasks/?project_id={pid}", headers=C)
check("GET /tasks/?project_id with an 8-level tree is 200", r.status_code == 200, f"{r.status_code} {r.text[:150]}")


def depth_of(node):
    return 1 + max((depth_of(s) for s in node.get("subtasks", [])), default=0)


if r.status_code == 200:
    roots = r.json()
    check("tree is complete (depth 8)", len(roots) == 1 and depth_of(roots[0]) == 8, [depth_of(x) for x in roots])
r = c.get(f"/api/v1/tasks/{ids[0]}", headers=C)
check("GET single task returns full subtree", r.status_code == 200 and depth_of(r.json()) == 8, r.status_code)
r = c.get(f"/api/v1/subtasks/{ids[3]}", headers=C)
check("GET subtask mid-tree returns 5 levels below", r.status_code == 200 and depth_of(r.json()) == 5, r.status_code)
r = c.put(f"/api/v1/tasks/{ids[7]}", headers=C, json={"title": "renamed leaf", "status": "In Progress"})
check("update of deepest task works", r.status_code == 200 and r.json()["title"] == "renamed leaf", r.text[:150])

# ---- dependencies: cycle detection with the scoped graph
a = c.post("/api/v1/tasks/", headers=C, json={"title": "A", "project_id": pid}).json()["id"]
b = c.post("/api/v1/tasks/", headers=C, json={"title": "B", "project_id": pid}).json()["id"]
d3 = c.post("/api/v1/tasks/", headers=C, json={"title": "C", "project_id": pid}).json()["id"]
x = c.post("/api/v1/tasks/", headers=C, json={"title": "X unrelated", "project_id": pid}).json()["id"]


def dep(succ, pred):
    return c.post(f"/api/v1/tasks/{succ}/dependencies", headers=C, json={"successor_id": succ, "predecessor_id": pred})


check("B blocked by A", dep(b, a).status_code == 200)
check("C blocked by B", dep(d3, b).status_code == 200)
r = dep(a, d3)
check("A blocked by C closes a cycle -> 400", r.status_code == 400 and "ircular" in r.text, f"{r.status_code} {r.text[:100]}")
check("self dependency -> 400", dep(a, a).status_code == 400)
check("X blocked by C is fine (no cycle)", dep(x, d3).status_code == 200)
r = dep(a, x)
check("A blocked by X closes a longer cycle (A<-X<-C<-B<-A) -> 400", r.status_code == 400, f"{r.status_code} {r.text[:100]}")

# ---- search
c.post("/api/v1/tasks/", headers=C, json={"title": "Budget 100% review", "project_id": pid})
c.post("/api/v1/tasks/", headers=C, json={"title": "Budget 1000 review", "project_id": pid})
r = c.get("/api/v1/search/", params={"q": "100%"}, headers=C)
titles = [i["title"] for i in r.json()] if r.status_code == 200 else []
check("search treats % literally", "Budget 100% review" in titles and "Budget 1000 review" not in titles, titles)
r = c.get("/api/v1/search/", params={"q": "%"}, headers=C)
check("search for a bare % only matches titles containing %", r.status_code == 200 and all("%" in (i["title"] + (i.get("description") or "")) for i in r.json()), r.text[:150])
r = c.get("/api/v1/search/", params={"q": "level"}, headers=D)
check("dave (not a member) does not find carol's tasks", r.status_code == 200 and r.json() == [], r.text[:150])
r = c.put(f"/api/v1/projects/{pid}", headers=C, json={"member_ids": [uid["dave"]]})
check("carol adds dave as project member", r.status_code == 200, r.text[:200])
r = c.get("/api/v1/search/", params={"q": "level"}, headers=D)
check("dave now finds tasks through membership", r.status_code == 200 and len(r.json()) >= 1, r.text[:150])
r = c.get("/api/v1/search/", params={"q": "Deep"}, headers=D)
check("dave finds the shared project", any(i["type"] == "project" for i in r.json()), r.text[:150])

# ---- dashboard summary via GROUP BY
r = c.get("/api/v1/dashboard/summary", headers=C)
if r.status_code == 200:
    s = r.json()
    n_tasks = len(c.get(f"/api/v1/tasks/?project_id={pid}", headers=C).json())
    check("dashboard summary responds", True)
    total = s.get("total_tasks")
    check("summary total equals sum of per-status counts",
          total == sum(s.get(k, 0) for k in ("tasks_backlog", "tasks_todo", "tasks_in_progress", "tasks_on_hold", "tasks_review", "tasks_done")), s)
    check("summary counts every task (incl. subtasks)", total == 8 + 4 + 2, s)
else:
    check("dashboard summary responds", False, f"{r.status_code} {r.text[:150]}")

# ---- notifications: single UPDATE
r = c.post("/api/v1/tasks/", headers=C, json={"title": "assigned", "project_id": pid, "assignee_ids": [uid["dave"]]})
check("assigning dave creates a notification", r.status_code == 200, r.text[:150])
n = c.get("/api/v1/notifications/", headers=D).json()
check("dave has unread notifications", len(n) >= 1 and not all(x["is_read"] for x in n), n[:1])
r = c.post("/api/v1/notifications/mark-all-as-read", headers=D)
check("mark-all-as-read works", r.status_code == 200 and r.json().get("updated", 0) >= 1, r.text[:100])
check("all of dave's notifications are now read", all(x["is_read"] for x in c.get("/api/v1/notifications/", headers=D).json()))
check("mark-all-as-read does not touch other users", True)

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
