"""Recurring tasks + personal calendar feed live checks (run inside the backend container, against the proxy).
Creates its own users (heidi/ivan) so it can run next to the other smoke suites on one database."""
import os
import secrets
import sys
from datetime import datetime, timedelta

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
for n in ("heidi", "ivan"):
    r = c.post("/api/v1/users/", headers=H(admin), json={"email": f"{n}@example.com", "password": pw, "full_name": n})
    uid[n] = r.json()["id"]
    tok[n] = c.post("/api/v1/login/access-token", data={"username": f"{n}@example.com", "password": pw}).json()["access_token"]
HE, IV = H(tok["heidi"]), H(tok["ivan"])

pid = c.post("/api/v1/projects/", headers=HE, json={"name": "Recurring project"}).json()["id"]
today = datetime.utcnow().replace(hour=9, minute=0, second=0, microsecond=0)
iso = lambda d: d.isoformat()  # noqa: E731
mk = lambda title, **kw: c.post("/api/v1/tasks/", headers=HE, json={"title": title, "project_id": pid, **kw})  # noqa: E731
tasks_in_project = lambda: c.get(f"/api/v1/tasks/?project_id={pid}&limit=200", headers=HE).json()  # noqa: E731

# ---- rule validation at the API
r = mk("bad rule", recurrence_rule="FREQ=DAILY;COUNT=3")
check("unsupported rule part is rejected (422)", r.status_code == 422, f"{r.status_code} {r.text[:120]}")
r = mk("bad freq", recurrence_rule="EVERY WEEK")
check("garbage rule is rejected (422)", r.status_code == 422, r.status_code)

# ---- completing a recurring task creates the next one
r = mk("Weekly report", recurrence_rule="freq=weekly", start_date=iso(today - timedelta(days=2)), due_date=iso(today),
       assignee_ids=[uid["heidi"]], checklist=[{"id": "1", "text": "step", "is_done": True}])
check("recurring task created with canonical rule", r.status_code == 200 and r.json()["recurrence_rule"] == "FREQ=WEEKLY", r.text[:150])
t = r.json()
before = len(tasks_in_project())
r = c.put(f"/api/v1/tasks/{t['id']}", headers=HE, json={"status": "Done"})
check("completing it works", r.status_code == 200 and r.json()["status"] == "Done", r.text[:150])
after = tasks_in_project()
check("exactly one new task appeared", len(after) == before + 1, f"{before} -> {len(after)}")
nxt = next((x for x in after if x["title"] == "Weekly report" and x["id"] != t["id"]), None)
check("next occurrence exists and is To Do", nxt is not None and nxt["status"] in ("To Do", "Todo", "TODO"), nxt and nxt["status"])
if nxt:
    due = datetime.fromisoformat(nxt["due_date"].replace("Z", ""))
    check("next due date is a week later", abs((due - today).days - 7) <= 1, nxt["due_date"])
    check("rule carries over", nxt["recurrence_rule"] == "FREQ=WEEKLY")
    check("assignee carries over", [a["id"] for a in nxt.get("assignees", [])] == [uid["heidi"]], nxt.get("assignees"))
    check("checklist is reset", all(not i["is_done"] for i in nxt.get("checklist", [])), nxt.get("checklist"))

# ---- re-saving a Done task does not spawn again; reopening and finishing again does
c.put(f"/api/v1/tasks/{t['id']}", headers=HE, json={"title": "Weekly report"})
check("editing a finished task does not spawn another", len(tasks_in_project()) == before + 1)

# ---- series that ran out
r = mk("Ends soon", recurrence_rule=f"FREQ=DAILY;UNTIL={today:%Y%m%d}", due_date=iso(today))
c.put(f"/api/v1/tasks/{r.json()['id']}", headers=HE, json={"status": "Done"})
check("an expired series creates nothing", len([x for x in tasks_in_project() if x["title"] == "Ends soon"]) == 1)

# ---- a non recurring task never spawns
r = mk("One off", due_date=iso(today))
c.put(f"/api/v1/tasks/{r.json()['id']}", headers=HE, json={"status": "Done"})
check("non recurring task does not repeat", len([x for x in tasks_in_project() if x["title"] == "One off"]) == 1)

# ---- clearing a rule
r = c.put(f"/api/v1/tasks/{nxt['id']}", headers=HE, json={"recurrence_rule": None}) if nxt else None
check("rule can be cleared", r is not None and r.status_code == 200 and r.json()["recurrence_rule"] is None, r and r.text[:120])

# ---- calendar feed
check("feed is off by default", c.get("/api/v1/users/me/calendar-feed", headers=HE).json() == {"enabled": False, "url": None})
r = c.post("/api/v1/users/me/calendar-feed", headers=HE)
url = r.json().get("url", "")
check("feed link is created", r.status_code == 200 and url.endswith(".ics") and "/api/v1/calendar/feed/" in url, r.text[:150])
path = "/api/v1/calendar/feed/" + url.rsplit("/api/v1/calendar/feed/", 1)[-1]
anon = httpx.Client(base_url=BASE, timeout=30)  # no Authorization header, like a calendar app
r = anon.get(path)
check("feed needs no login", r.status_code == 200 and r.headers["content-type"].startswith("text/calendar"), f"{r.status_code} {r.headers.get('content-type')}")
body = r.text
check("feed is a valid calendar", body.startswith("BEGIN:VCALENDAR") and body.rstrip().endswith("END:VCALENDAR"))
check("assigned dated task is in the feed", "SUMMARY:Weekly report" in body.replace("\r\n ", ""))
check("done tasks are hidden by default", "SUMMARY:✓" not in body)
check("done tasks can be included", "SUMMARY:✓ Weekly report" in anon.get(path + "?include_done=true").text.replace("\r\n ", ""))
check("another user's feed does not leak these tasks", "Weekly report" not in anon.get(
    "/api/v1/calendar/feed/" + c.post("/api/v1/users/me/calendar-feed", headers=IV).json()["url"].rsplit("/", 1)[-1]).text)
check("token is not exposed by the profile", path.split("/")[-1][:-4] not in c.get("/api/v1/users/me", headers=HE).text)

# ---- bad tokens, rotation, revocation
check("unknown token is 404", anon.get("/api/v1/calendar/feed/not-a-real-token.ics").status_code == 404)
r = c.post("/api/v1/users/me/calendar-feed", headers=HE)
new_url = r.json()["url"]
check("rotating gives a new link", new_url != url)
check("old link stops working at once", anon.get(path).status_code == 404)
new_path = "/api/v1/calendar/feed/" + new_url.rsplit("/api/v1/calendar/feed/", 1)[-1]
check("new link works", anon.get(new_path).status_code == 200)
check("revoke", c.delete("/api/v1/users/me/calendar-feed", headers=HE).status_code == 204)
check("revoked link is 404", anon.get(new_path).status_code == 404)
check("feed endpoints need a login", c.get("/api/v1/users/me/calendar-feed").status_code == 401)

# ---- deactivated users lose their feed
tk = c.post("/api/v1/users/me/calendar-feed", headers=IV).json()["url"].rsplit("/api/v1/calendar/feed/", 1)[-1]
check("ivan's feed works", anon.get("/api/v1/calendar/feed/" + tk).status_code == 200)
import asyncio

from sqlalchemy import text

from app.db.session import AsyncSessionLocal


async def _deactivate():
    async with AsyncSessionLocal() as db:
        await db.execute(text("UPDATE users SET is_active = false WHERE id = :i"), {"i": uid["ivan"]})
        await db.commit()


asyncio.run(_deactivate())
check("deactivated user's feed is 404", anon.get("/api/v1/calendar/feed/" + tk).status_code == 404)

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
