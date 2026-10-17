"""Live checks: bulk task actions (POST /tasks/bulk) and the notification-centre endpoints. Needs a fresh database."""
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


c = httpx.Client(base_url=BASE, timeout=60)
H = lambda t: {"Authorization": f"Bearer {t}"}  # noqa: E731


def login(email, pw):
    return c.post("/api/v1/login/access-token", data={"username": email, "password": pw}).json()["access_token"]


root = login(ADMIN_EMAIL, ADMIN_PW)
pw = "Bulk-" + secrets.token_hex(6)
who, uid, tok = ("owner", "editor", "viewer", "stranger"), {}, {}
sfx = secrets.token_hex(3)
for n in who:
    r = c.post("/api/v1/users/", headers=H(root), json={"email": f"bulk-{n}-{sfx}@example.com", "password": pw, "full_name": n.title()})
    uid[n] = r.json()["id"]
    tok[n] = login(f"bulk-{n}-{sfx}@example.com", pw)
T = {n: H(tok[n]) for n in who}


def bulk(who_, ids, **body):
    return c.post("/api/v1/tasks/bulk", headers=T[who_], json={"ids": ids, **body})


pid = c.post("/api/v1/projects/", headers=T["owner"], json={"name": "Bulk project"}).json()["id"]
c.put(f"/api/v1/projects/{pid}", headers=T["owner"], json={"member_ids": [uid["editor"], uid["viewer"]]})
c.put(f"/api/v1/projects/{pid}/members/{uid['viewer']}", headers=T["owner"], json={"role": "viewer"})


def mk(title, project=pid, who_="owner"):
    r = c.post("/api/v1/tasks/", headers=T[who_], json={"title": title, "project_id": project})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def get(tid, who_="owner"):
    return c.get(f"/api/v1/tasks/{tid}", headers=T[who_]).json()


# ---- happy path: patch
ids = [mk(f"bulk {i}") for i in range(5)]
r = bulk("editor", ids, patch={"status": "In Progress", "priority": "High"})
check("editor bulk-patches 5 tasks", r.status_code == 200 and r.json()["succeeded"] == 5 and r.json()["failed"] == 0, r.text[:200])
check("results come back in request order", [x["id"] for x in r.json()["results"]] == ids)
check("status and priority really changed", all(get(i)["status"] == "In Progress" and get(i)["priority"] == "High" for i in ids))

r = bulk("owner", ids[:2], patch={"assignee_ids": [uid["editor"]]})
check("bulk assign", r.status_code == 200 and r.json()["succeeded"] == 2, r.text[:200])
check("assignee applied", all(uid["editor"] in get(i)["assignee_ids"] for i in ids[:2]))

# ---- authorization is checked per id
r = bulk("stranger", ids, patch={"status": "Done"})
body = r.json()
check("stranger: 200 envelope, 403 for every id", r.status_code == 200 and body["failed"] == 5 and all(x["status_code"] == 403 for x in body["results"]), r.text[:200])
check("stranger changed nothing", all(get(i)["status"] == "In Progress" for i in ids))
r = bulk("viewer", ids, action="delete")
check("viewer cannot delete (403 per id)", r.json()["failed"] == 5 and all(x["status_code"] == 403 for x in r.json()["results"]))
check("tasks still exist after the viewer's attempt", all(c.get(f"/api/v1/tasks/{i}", headers=T["owner"]).status_code == 200 for i in ids))

other_pid = c.post("/api/v1/projects/", headers=T["stranger"], json={"name": "Other project"}).json()["id"]
foreign = mk("foreign task", other_pid, "stranger")
r = bulk("editor", [ids[0], foreign, ids[1]], patch={"priority": "Low"})
res = r.json()["results"]
check("mixed request: own tasks ok, foreign one 403", [(x["ok"], x["status_code"]) for x in res] == [(True, 200), (False, 403), (True, 200)], r.text[:300])
check("foreign task untouched", get(foreign, "stranger")["priority"] != "Low")
missing = "00000000-0000-4000-8000-000000000000"
r = bulk("editor", [missing], patch={"priority": "Low"})
check("unknown id reported as 404", r.status_code == 200 and r.json()["results"][0]["status_code"] == 404, r.text[:200])

# ---- validation
check("empty ids -> 422", bulk("owner", [], action="archive").status_code == 422)
check("no patch and no action -> 422", bulk("owner", ids).status_code == 422)
check("non-editable field -> 422", bulk("owner", ids, patch={"title": "x"}).status_code == 422)
check("more than 200 ids -> 422", bulk("owner", [missing] * 201, action="archive").status_code == 422)
check("anonymous -> 401", c.post("/api/v1/tasks/bulk", json={"ids": ids, "action": "archive"}).status_code == 401)

# ---- archive / restore / delete
r = bulk("editor", ids[:3], action="archive")
check("bulk archive", r.json()["succeeded"] == 3 and all(get(i)["is_archived"] for i in ids[:3]), r.text[:200])
r = bulk("editor", ids[:3], action="restore")
check("bulk restore", r.json()["succeeded"] == 3 and not any(get(i)["is_archived"] for i in ids[:3]), r.text[:200])
r = bulk("editor", ids, action="delete")
check("bulk delete", r.json()["succeeded"] == 5 and all(c.get(f"/api/v1/tasks/{i}", headers=T["owner"]).status_code == 404 for i in ids), r.text[:200])

# ---- notification centre endpoints (assignments above created notifications for the editor)
ed = T["editor"]
check("unread-count requires login", c.get("/api/v1/notifications/unread-count").status_code == 401)
cnt = c.get("/api/v1/notifications/unread-count", headers=ed).json()["count"]
unread = c.get("/api/v1/notifications/?is_read=false", headers=ed).json()
check("unread-count matches the unread list", cnt == len(unread) and cnt >= 1, (cnt, len(unread)))
nid = unread[0]["id"]
r = c.put(f"/api/v1/notifications/{nid}", headers=ed, json={"is_read": True})
check("mark one read", r.status_code == 200 and r.json()["is_read"] is True)
check("count dropped by one", c.get("/api/v1/notifications/unread-count", headers=ed).json()["count"] == cnt - 1)
r = c.put(f"/api/v1/notifications/{nid}", headers=ed, json={"is_read": False})
check("mark unread again (PUT is_read=false)", r.status_code == 200 and r.json()["is_read"] is False)
check("count restored", c.get("/api/v1/notifications/unread-count", headers=ed).json()["count"] == cnt)
check("is_read=true filter excludes it", nid not in [n["id"] for n in c.get("/api/v1/notifications/?is_read=true", headers=ed).json()])
t = unread[0]["type"]
by_type = c.get(f"/api/v1/notifications/?type={t}", headers=ed).json()
check("type filter", by_type and all(n["type"] == t for n in by_type))
check("nobody else can touch it", c.put(f"/api/v1/notifications/{nid}", headers=T["stranger"], json={"is_read": True}).status_code in (400, 403))
check("limit cap (501 -> 422)", c.get("/api/v1/notifications/?limit=501", headers=ed).status_code == 422)
r = c.post("/api/v1/notifications/mark-all-as-read", headers=ed)
check("mark all read", r.status_code == 200 and c.get("/api/v1/notifications/unread-count", headers=ed).json()["count"] == 0)

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
