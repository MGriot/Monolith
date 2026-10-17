"""Live checks for project roles (viewer / editor / admin) against the real stack. Needs a fresh database."""
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


def login(email, pw):
    return c.post("/api/v1/login/access-token", data={"username": email, "password": pw}).json()["access_token"]


root = login(ADMIN_EMAIL, ADMIN_PW)
pw = "Roles-" + secrets.token_hex(6)
who, uid, tok = ("owner", "padmin", "editor", "viewer", "stranger"), {}, {}
for n in who:
    r = c.post("/api/v1/users/", headers=H(root), json={"email": f"{n}@example.com", "password": pw, "full_name": n.title()})
    uid[n] = r.json()["id"]
    tok[n] = login(f"{n}@example.com", pw)
T = {n: H(tok[n]) for n in who}


def status(method, path, who_, **kw):
    return c.request(method, path, headers=T[who_], **kw).status_code


# ---- the owner creates a project; members come in the legacy way (member_ids) and must get the editor role
pid = c.post("/api/v1/projects/", headers=T["owner"], json={"name": "Roles project"}).json()["id"]
r = c.put(f"/api/v1/projects/{pid}", headers=T["owner"], json={"member_ids": [uid["padmin"], uid["editor"], uid["viewer"]]})
check("owner adds members the old way (member_ids)", r.status_code == 200, r.text[:150])
members = {m["email"].split("@")[0]: m for m in c.get(f"/api/v1/projects/{pid}/members", headers=T["owner"]).json()}
check("members list shows the owner first as admin", list(members)[0] == "owner" and members["owner"]["role"] == "admin" and members["owner"]["is_owner"])
check("legacy members all became editors (nobody lost rights)", all(members[n]["role"] == "editor" for n in ("padmin", "editor", "viewer")), members)

# ---- assign roles
for n, role in (("padmin", "admin"), ("viewer", "viewer")):
    r = c.put(f"/api/v1/projects/{pid}/members/{uid[n]}", headers=T["owner"], json={"role": role})
    check(f"owner sets {n} -> {role}", r.status_code == 200 and r.json()["role"] == role, r.text[:150])
check("invalid role is rejected (422)", status("PUT", f"/api/v1/projects/{pid}/members/{uid['editor']}", "owner", json={"role": "god"}) == 422)
check("the owner's role cannot be changed (400)", status("PUT", f"/api/v1/projects/{pid}/members/{uid['owner']}", "padmin", json={"role": "viewer"}) == 400)
check("the owner cannot be removed (400)", status("DELETE", f"/api/v1/projects/{pid}/members/{uid['owner']}", "padmin") == 400)

for n, role in (("owner", "admin"), ("padmin", "admin"), ("editor", "editor"), ("viewer", "viewer")):
    got = c.get(f"/api/v1/projects/{pid}", headers=T[n]).json().get("my_role")
    check(f"GET /projects/id reports my_role={role} for {n}", got == role, got)
check("a stranger gets 403 on the project", status("GET", f"/api/v1/projects/{pid}", "stranger") == 403)
check("a viewer sees the project in their list", any(p["id"] == pid for p in c.get("/api/v1/projects/", headers=T["viewer"]).json()))

# ---- content: editor works, viewer reads
r = c.post("/api/v1/tasks/", headers=T["editor"], json={"title": "Editor task", "project_id": pid})
check("editor creates a task", r.status_code == 200, r.text[:150])
tid = r.json()["id"]
check("viewer cannot create a task", status("POST", "/api/v1/tasks/", "viewer", json={"title": "nope", "project_id": pid}) == 403)
check("viewer reads the task", status("GET", f"/api/v1/tasks/{tid}", "viewer") == 200)
check("viewer lists the project's tasks", status("GET", f"/api/v1/tasks/?project_id={pid}", "viewer") == 200)
check("viewer cannot edit the task", status("PUT", f"/api/v1/tasks/{tid}", "viewer", json={"title": "hacked"}) == 403)
check("viewer cannot delete the task", status("DELETE", f"/api/v1/tasks/{tid}", "viewer") == 403)
check("viewer cannot add a subtask", status("POST", "/api/v1/subtasks/", "viewer", json={"title": "s", "project_id": pid, "parent_id": tid}) == 403)
check("editor edits the task", status("PUT", f"/api/v1/tasks/{tid}", "editor", json={"title": "Renamed"}) == 200)
check("viewer reads comments", status("GET", f"/api/v1/comments/?project_id={pid}", "viewer") == 200)
check("viewer cannot comment", status("POST", "/api/v1/comments/", "viewer", json={"content": "x", "project_id": pid}) == 403)
check("editor comments", status("POST", "/api/v1/comments/", "editor", json={"content": "hello", "project_id": pid}) == 200)
check("viewer cannot propose an idea", status("POST", "/api/v1/ideas/", "viewer", json={"title": "i", "project_id": pid}) == 403)
r = c.post("/api/v1/ideas/", headers=T["editor"], json={"title": "Editor idea", "project_id": pid})
check("editor proposes an idea", r.status_code == 200, r.text[:120])
iid = r.json()["id"]
check("viewer cannot vote", status("POST", f"/api/v1/ideas/{iid}/vote", "viewer") == 403)
check("editor votes", status("POST", f"/api/v1/ideas/{iid}/vote", "editor") == 200)
check("editor cannot promote an idea (admin only)", status("POST", f"/api/v1/ideas/{iid}/promote", "editor") == 403)
check("viewer cannot create a folder", status("POST", "/api/v1/folders/", "viewer", json={"name": "f", "project_id": pid}) == 403)
fr = c.post("/api/v1/folders/", headers=T["editor"], json={"name": "Docs", "project_id": pid})
check("editor creates a folder", fr.status_code == 200, fr.text[:120])
fid = fr.json()["id"]
check("viewer sees the folder", any(f["id"] == fid for f in c.get(f"/api/v1/folders/?project_id={pid}", headers=T["viewer"]).json()))
check("viewer cannot upload into it", status("POST", f"/api/v1/folders/{fid}/upload", "viewer", files={"file": ("a.txt", b"x")}) == 403)
check("viewer cannot rename it", status("PUT", f"/api/v1/folders/{fid}", "viewer", json={"name": "x"}) == 403)
check("viewer cannot create a whiteboard", status("POST", "/api/v1/whiteboards/", "viewer", json={"title": "w", "data": {}, "project_id": pid}) == 403)
wr = c.post("/api/v1/whiteboards/", headers=T["editor"], json={"title": "Board", "data": {}, "project_id": pid})
check("editor creates a whiteboard", wr.status_code == 200, wr.text[:120])
wid = wr.json()["id"]
check("viewer reads the whiteboard", status("GET", f"/api/v1/whiteboards/{wid}", "viewer") == 200)
check("viewer cannot edit or delete it", status("PUT", f"/api/v1/whiteboards/{wid}", "viewer", json={"title": "x"}) == 403 and status("DELETE", f"/api/v1/whiteboards/{wid}", "viewer") == 403)

# ---- a viewer who is ASSIGNED can log time on the task but not change it
r = c.put(f"/api/v1/tasks/{tid}", headers=T["editor"], json={"assignee_ids": [uid["viewer"]]})
check("editor assigns the viewer to the task", r.status_code == 200, r.text[:150])
check("assigned viewer can start a timer on it", status("POST", f"/api/v1/time/tasks/{tid}/start", "viewer", json={}) == 200)
check("assigned viewer can stop it", status("POST", "/api/v1/time/stop", "viewer") == 200)
check("... but still cannot change the task", status("PUT", f"/api/v1/tasks/{tid}", "viewer", json={"title": "x"}) == 403)
tid2 = c.post("/api/v1/tasks/", headers=T["editor"], json={"title": "Not assigned to viewer", "project_id": pid}).json()["id"]
check("a viewer cannot log time on tasks they are not assigned to", status("POST", f"/api/v1/time/tasks/{tid2}/start", "viewer", json={}) == 403)

# ---- admin vs editor: configuration and people
check("editor cannot change project settings", status("PUT", f"/api/v1/projects/{pid}", "editor", json={"description": "x"}) == 403)
check("project admin changes settings", status("PUT", f"/api/v1/projects/{pid}", "padmin", json={"description": "by the admin"}) == 200)
check("editor cannot manage members", status("PUT", f"/api/v1/projects/{pid}/members/{uid['stranger']}", "editor", json={"role": "viewer"}) == 403)
check("editor cannot define custom fields", status("POST", f"/api/v1/projects/{pid}/custom-fields", "editor", json={"name": "Risk", "field_type": "text"}) == 403)
r = c.post(f"/api/v1/projects/{pid}/custom-fields", headers=T["padmin"], json={"name": "Risk", "field_type": "text"})
check("project admin defines a custom field", r.status_code == 200, r.text[:120])
check("viewer can list the fields", status("GET", f"/api/v1/projects/{pid}/custom-fields", "viewer") == 200)
check("editor cannot archive", status("POST", f"/api/v1/projects/{pid}/archive", "editor") == 403)
check("project admin archives and restores",
      status("POST", f"/api/v1/projects/{pid}/archive", "padmin") == 200 and status("POST", f"/api/v1/projects/{pid}/restore", "padmin") == 200)
check("project admin cannot delete the project (owner/superuser only)", status("DELETE", f"/api/v1/projects/{pid}", "padmin") == 403)
check("project admin promotes the idea", status("POST", f"/api/v1/ideas/{iid}/promote", "padmin") == 200)

# ---- admin manages people; roles survive a member_ids update; changes apply immediately
r = c.put(f"/api/v1/projects/{pid}/members/{uid['stranger']}", headers=T["padmin"], json={"role": "viewer"})
check("project admin adds a stranger as viewer", r.status_code == 200, r.text[:120])
check("the new member can read", status("GET", f"/api/v1/projects/{pid}", "stranger") == 200)
r = c.put(f"/api/v1/projects/{pid}", headers=T["owner"], json={"member_ids": [uid["padmin"], uid["editor"], uid["viewer"], uid["stranger"]]})
roles = {m["email"].split("@")[0]: m["role"] for m in c.get(f"/api/v1/projects/{pid}/members", headers=T["owner"]).json()}
check("a member_ids update keeps everybody's role (viewer stays viewer)", roles.get("viewer") == "viewer" and roles.get("padmin") == "admin" and roles.get("stranger") == "viewer", roles)
check("demoting the editor to viewer applies immediately",
      c.put(f"/api/v1/projects/{pid}/members/{uid['editor']}", headers=T["padmin"], json={"role": "viewer"}).status_code == 200
      and status("PUT", f"/api/v1/tasks/{tid}", "editor", json={"title": "again"}) == 403)
check("promoting them back applies immediately",
      c.put(f"/api/v1/projects/{pid}/members/{uid['editor']}", headers=T["padmin"], json={"role": "editor"}).status_code == 200
      and status("PUT", f"/api/v1/tasks/{tid}", "editor", json={"title": "again"}) == 200)
check("removing a member takes their access away",
      status("DELETE", f"/api/v1/projects/{pid}/members/{uid['stranger']}", "padmin") == 204
      and status("GET", f"/api/v1/projects/{pid}", "stranger") == 403)

# ---- superuser and database level
check("the superuser is admin everywhere", c.get(f"/api/v1/projects/{pid}", headers=H(root)).json().get("my_role") == "admin")
from sqlalchemy import text  # noqa: E402
import asyncio  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402


async def db_checks():
    async with AsyncSessionLocal() as db:
        try:
            await db.execute(text("UPDATE project_members SET role='emperor' WHERE project_id = :p"), {"p": pid})
            await db.commit()
            return False
        except Exception:
            await db.rollback()
            return True


check("the database itself rejects unknown roles (check constraint)", asyncio.run(db_checks()))

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
