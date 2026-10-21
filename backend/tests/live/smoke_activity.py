"""Live change-log checks (run INSIDE the backend container against the nginx proxy, fresh database).

An editor changes a task through REST and through MCP; both land in the project's activity with the right actor
and a readable summary; a subtask roll-up and an automation are labelled as automatic; viewers can read it,
outsiders cannot; deleting a task keeps its line.
"""
import asyncio
import json
import os
import secrets
import sys

import httpx

BASE = os.environ.get("BASE", "http://proxy")
ADMIN_EMAIL = os.environ["FIRST_SUPERUSER_EMAIL"]
ADMIN_PW = os.environ["FIRST_SUPERUSER_PASSWORD"]
HOST = {"Host": "localhost:8080"}
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  -> {detail}" if (detail and not cond) else ""), flush=True)


c = httpx.Client(base_url=BASE, timeout=30)


def login(email, pw):
    return c.post("/api/v1/login/access-token", data={"username": email, "password": pw}).json()["access_token"]


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


admin = auth(login(ADMIN_EMAIL, ADMIN_PW))
run = secrets.token_hex(3)
pw = "Act-" + secrets.token_hex(8)
ids, toks = {}, {}
for name in ("editor", "viewer", "outsider"):
    email = f"act-{name}-{run}@example.com"
    r = c.post("/api/v1/users/", headers=admin, json={"email": email, "password": pw, "full_name": f"Act {name.title()}"})
    ids[name] = r.json()["id"]
    toks[name] = login(email, pw)
E, V, O = auth(toks["editor"]), auth(toks["viewer"]), auth(toks["outsider"])

pid = c.post("/api/v1/projects/", headers=E, json={"name": f"Activity {run}"}).json()["id"]
c.put(f"/api/v1/projects/{pid}/members/{ids['viewer']}", headers=E, json={"role": "viewer"})
parent = c.post("/api/v1/tasks/", headers=E, json={"title": "Phase", "project_id": pid}).json()
child = c.post("/api/v1/tasks/", headers=E, json={"title": "Build", "project_id": pid, "parent_id": parent["id"],
                                                     "start_date": "2026-11-02", "due_date": "2026-11-04"}).json()
r = c.put(f"/api/v1/tasks/{child['id']}", headers=E, json={"status": "In Progress", "due_date": "2026-11-10", "budget": 1200})
check("editor updates a task", r.status_code == 200, r.text[:200])

# the same editor through MCP
tok = c.post("/api/v1/users/me/mcp-tokens", headers=E, json={"name": "act", "expires_in_days": 1}).json()["token"]


async def via_mcp():
    from mcp import ClientSession
    from mcp.client.sse import sse_client

    async with sse_client(f"{BASE}/mcp/sse", headers={**auth(tok), **HOST}, timeout=20) as (read, write):
        async with ClientSession(read, write) as s:
            await s.initialize()
            await s.call_tool("update_task", {"task_id": child["id"], "changes": {"priority": "High"}})
            res = await s.call_tool("get_task_activity", {"task_id": child["id"]})
            sc = res.structuredContent
            return sc["result"] if sc and set(sc) == {"result"} else json.loads(res.content[0].text)


mcp_rows = asyncio.run(via_mcp())
check("MCP reads the task's change log", isinstance(mcp_rows, list) and len(mcp_rows) >= 3, mcp_rows)

rows = c.get(f"/api/v1/projects/{pid}/activity", headers=V).json()
summaries = [(r["kind"], r["summary"], (r.get("actor") or {}).get("full_name"), r.get("actor_label")) for r in rows]
check("viewer can read the project's activity", isinstance(rows, list) and rows, rows)
check("creation is logged with its author", any(k == "created" and a == "Act Editor" for k, _, a, _ in summaries), summaries)
check("status change is its own line, credited to the editor",
      any(k == "status_changed" and "Todo → In Progress" in s and a == "Act Editor" for k, s, a, _ in summaries), summaries)
check("field edits are summarised", any(k == "updated" and "due date" in s and "budget" in s for k, s, _, _ in summaries), summaries)
check("MCP edits are credited to the token owner", any(k == "updated" and "priority Medium → High" in s and a == "Act Editor"
                                                      for k, s, a, _ in summaries), summaries)
check("the parent's roll-up is labelled automatic",
      any(r["task_id"] == parent["id"] and r["kind"] == "status_changed" and r.get("actor_label") == "Automatic (from subtasks)"
          for r in rows), summaries)

# dependency lines
other = c.post("/api/v1/tasks/", headers=E, json={"title": "Test", "project_id": pid}).json()
c.post(f"/api/v1/tasks/{other['id']}/dependencies", headers=E,
       json={"successor_id": other["id"], "predecessor_id": child["id"], "type": "FS", "lag_days": 2})
c.delete(f"/api/v1/tasks/{other['id']}/dependencies/{child['id']}", headers=E)
kinds = [r["kind"] for r in c.get(f"/api/v1/tasks/{other['id']}/activity", headers=E).json()]
check("dependency added and removed are logged", "dependency_added" in kinds and "dependency_removed" in kinds, kinds)

# an automation rule acting on a task is labelled with the rule's name
rule = c.post(f"/api/v1/projects/{pid}/automations", headers=E, json={
    "name": "Bump priority on review", "trigger": "status_changed",
    "conditions": [{"field": "status", "op": "eq", "value": "Review"}],
    "actions": [{"type": "set_field", "field": "priority", "value": "Critical"}]})
check("automation rule created", rule.status_code in (200, 201), rule.text[:200])
c.put(f"/api/v1/tasks/{other['id']}", headers=E, json={"status": "Review"})
rows = c.get(f"/api/v1/tasks/{other['id']}/activity", headers=E).json()
check("automation changes are labelled with the rule",
      any(r.get("actor_label") == "Automation: Bump priority on review" and "Critical" in r["summary"] for r in rows), rows)

# deletion keeps the line; outsiders see nothing
c.delete(f"/api/v1/tasks/{other['id']}", headers=E)
rows = c.get(f"/api/v1/projects/{pid}/activity", headers=E).json()
check("deleting a task keeps a line with its title", any(r["kind"] == "deleted" and r["task_title"] == "Test" for r in rows), rows[:3])
check("outsiders cannot read the activity", c.get(f"/api/v1/projects/{pid}/activity", headers=O).status_code == 403)

failed = [n for n, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
