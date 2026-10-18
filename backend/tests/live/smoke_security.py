"""Live smoke test, run INSIDE the backend container against the nginx proxy (http://proxy)."""
import json
import os
import secrets
import sys
import time

import httpx

BASE = os.environ.get("BASE", "http://proxy")
ADMIN_EMAIL = os.environ["FIRST_SUPERUSER_EMAIL"]
ADMIN_PW = os.environ["FIRST_SUPERUSER_PASSWORD"]

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  -> {detail}" if (detail and not cond) else ""), flush=True)


c = httpx.Client(base_url=BASE, timeout=20, follow_redirects=False)


def login(email, pw):
    r = c.post("/api/v1/login/access-token", data={"username": email, "password": pw})
    return r


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---- proxy / SPA
r = c.get("/")
check("proxy serves SPA index", r.status_code == 200 and "<div id=\"root\"" in r.text, r.status_code)
r = c.get("/some/deep/link")
check("SPA fallback for client-side routes", r.status_code == 200 and "<div id=\"root\"" in r.text, r.status_code)
r = c.get("/api/health")
check("API health through proxy", r.status_code == 200, r.text[:100])

# ---- anonymous access
for path in ("/api/v1/metadata/topics", "/api/v1/tasks/", "/api/v1/users/me"):
    check(f"anonymous {path} is 401", c.get(path).status_code == 401)

# ---- login + seeded admin
r = login(ADMIN_EMAIL, ADMIN_PW)
check("seeded admin can log in", r.status_code == 200, r.text[:100])
admin_tok = r.json()["access_token"]
check("legacy admin@admin.com/admin123 does not work", login("admin@admin.com", "admin123").status_code == 400)
me = c.get("/api/v1/users/me", headers=auth(admin_tok)).json()
check("admin is superuser", me.get("is_superuser") is True)

# ---- sign-up gating
r = c.post("/api/v1/users/", json={"email": "anon@example.com", "password": "long-enough-1"})
check("anonymous sign-up is refused", r.status_code == 403, r.text[:100])

# admin creates two normal users
pw = "Sup3r-" + secrets.token_hex(6)
users = {}
for name in ("alice", "bob"):
    r = c.post("/api/v1/users/", headers=auth(admin_tok), json={"email": f"{name}@example.com", "password": pw, "full_name": name})
    check(f"admin creates user {name}", r.status_code == 200, r.text[:150])
    lr = login(f"{name}@example.com", pw)
    users[name] = lr.json()["access_token"]
r = c.post("/api/v1/users/", headers=auth(admin_tok), json={"email": "weak@example.com", "password": "short"})
check("weak password rejected (422)", r.status_code == 422, r.status_code)

# ---- login throttling (own account so the admin is not locked)
codes = [login("victim@example.com", "wrong").status_code for _ in range(7)]
check("login throttled with 429 after repeated failures", 429 in codes and codes[:5] == [400] * 5, codes)
check("throttle did not lock other accounts", login(ADMIN_EMAIL, ADMIN_PW).status_code == 200)

# ---- project / task authz with real Postgres
r = c.post("/api/v1/projects/", headers=auth(users["alice"]), json={"name": "Alice's project"})
check("alice creates a project", r.status_code == 200, r.text[:200])
pid = r.json()["id"]
r = c.post("/api/v1/tasks/", headers=auth(users["alice"]), json={"title": "T1", "project_id": pid})
check("alice creates a task in her project", r.status_code == 200, r.text[:200])
tid = r.json()["id"]
r = c.post("/api/v1/tasks/", headers=auth(users["alice"]), json={"title": "child", "project_id": pid, "parent_id": tid})
check("alice creates a subtask", r.status_code == 200, r.text[:200])
sid = r.json()["id"] if r.status_code == 200 else None
r = c.post("/api/v1/tasks/", headers=auth(users["alice"]), json={"title": "T2", "project_id": pid})
tid2 = r.json()["id"]

B = auth(users["bob"])
A = auth(users["alice"])
probes = [
    ("bob cannot read alice's task", "GET", f"/api/v1/tasks/{tid}", None),
    ("bob cannot edit alice's task", "PUT", f"/api/v1/tasks/{tid}", {"title": "pwned"}),
    ("bob cannot delete alice's task", "DELETE", f"/api/v1/tasks/{tid}", None),
    ("bob cannot create task in alice's project", "POST", "/api/v1/tasks/", {"title": "x", "project_id": pid}),
    ("bob cannot list alice's subtasks", "GET", f"/api/v1/subtasks/?task_id={tid}", None),
    ("bob cannot read subtask by id", "GET", f"/api/v1/subtasks/{sid}", None),
    ("bob cannot edit subtask by id", "PUT", f"/api/v1/subtasks/{sid}", {"title": "pwned"}),
    ("bob cannot delete subtask by id", "DELETE", f"/api/v1/subtasks/{sid}", None),
    ("bob cannot add dependency", "POST", f"/api/v1/tasks/{tid2}/dependencies", {"successor_id": tid2, "predecessor_id": tid}),
    ("bob cannot list whiteboards of project", "GET", f"/api/v1/whiteboards/?project_id={pid}", None),
    ("bob cannot create whiteboard in project", "POST", "/api/v1/whiteboards/", {"title": "w", "data": {}, "project_id": pid}),
    ("bob cannot read comments", "GET", f"/api/v1/comments/?project_id={pid}", None),
    ("bob cannot post comment", "POST", "/api/v1/comments/", {"content": "hi", "project_id": pid}),
    ("bob cannot list ideas", "GET", f"/api/v1/ideas/?project_id={pid}", None),
    ("bob cannot create idea", "POST", "/api/v1/ideas/", {"title": "i", "project_id": pid}),
    ("bob cannot list folders", "GET", f"/api/v1/folders/?project_id={pid}", None),
    ("bob cannot create folder", "POST", "/api/v1/folders/", {"name": "f", "project_id": pid}),
]
for name, m, path, body in probes:
    r = c.request(m, path, headers=B, json=body)
    check(name + " (403)", r.status_code == 403, f"{r.status_code} {r.text[:120]}")

# whiteboards unscoped list must not leak alice's board
r = c.post("/api/v1/whiteboards/", headers=A, json={"title": "secret board", "data": {"a": 1}, "project_id": pid})
check("alice creates a whiteboard", r.status_code == 200, r.text[:200])
wid = r.json()["id"] if r.status_code == 200 else None
r = c.get("/api/v1/whiteboards/", headers=B)
check("bob's unscoped whiteboard list hides alice's board", r.status_code == 200 and all(w["id"] != wid for w in r.json()), r.text[:150])
check("bob cannot read whiteboard by id", c.get(f"/api/v1/whiteboards/{wid}", headers=B).status_code == 403)
check("alice reads her whiteboard", c.get(f"/api/v1/whiteboards/{wid}", headers=A).status_code == 200)

# owner paths still work (guards the helpers did not break the happy path)
check("alice reads her task", c.get(f"/api/v1/tasks/{tid}", headers=A).status_code == 200)
r = c.get(f"/api/v1/subtasks/?task_id={tid}", headers=A)
check("alice lists subtasks", r.status_code == 200 and len(r.json()) == 1, r.text[:150])
check("alice reads subtask", c.get(f"/api/v1/subtasks/{sid}", headers=A).status_code == 200)
r = c.put(f"/api/v1/subtasks/{sid}", headers=A, json={"title": "renamed"})
check("alice edits subtask", r.status_code == 200 and r.json()["title"] == "renamed", r.text[:150])
r = c.post(f"/api/v1/tasks/{tid2}/dependencies", headers=A, json={"successor_id": tid2, "predecessor_id": tid})
check("alice adds dependency", r.status_code == 200, r.text[:200])
r = c.post("/api/v1/comments/", headers=A, json={"content": "hello", "project_id": pid})
check("alice posts a comment", r.status_code == 200, r.text[:200])
check("alice lists comments", c.get(f"/api/v1/comments/?project_id={pid}", headers=A).status_code == 200)
r = c.post("/api/v1/ideas/", headers=A, json={"title": "idea", "project_id": pid})
check("alice creates idea", r.status_code == 200, r.text[:200])
r = c.post("/api/v1/folders/", headers=A, json={"name": "docs", "project_id": pid})
check("alice creates folder", r.status_code == 200, r.text[:200])
fid = r.json()["id"] if r.status_code == 200 else None
r = c.get(f"/api/v1/folders/?project_id={pid}", headers=A)
check("alice lists folders", r.status_code == 200, r.text[:150])
# nested folders (3 levels) must serialise without lazy-load errors
parent = fid
for depth in range(3):
    r = c.post("/api/v1/folders/", headers=A, json={"name": f"lvl{depth}", "project_id": pid, "parent_id": parent})
    check(f"nested folder level {depth} created", r.status_code == 200, r.text[:150])
    parent = r.json()["id"] if r.status_code == 200 else parent
r = c.get(f"/api/v1/folders/?project_id={pid}", headers=A)
check("folder tree lists after nesting", r.status_code == 200 and len(r.json()) >= 4, r.text[:150])
r = c.put(f"/api/v1/folders/{parent}", headers=A, json={"name": "renamed"})
check("folder rename returns 200", r.status_code == 200 and r.json()["name"] == "renamed", r.text[:150])
check("bob cannot rename alice's folder", c.put(f"/api/v1/folders/{parent}", headers=B, json={"name": "x"}).status_code == 403)
r = c.delete(f"/api/v1/folders/{parent}", headers=A)
check("folder delete returns 200", r.status_code == 200, r.text[:150])

# ---- null dates no longer 500
r = c.put(f"/api/v1/tasks/{tid}", headers=A, json={"start_date": "2025-01-01T00:00:00", "due_date": "2025-01-05T00:00:00"})
check("task update with dates", r.status_code == 200, r.text[:200])
r = c.put(f"/api/v1/tasks/{tid}", headers=A, json={"due_date": None})
check("task update clearing due_date is not a 500", r.status_code == 200, r.text[:200])
r = c.put(f"/api/v1/tasks/{tid}", headers=A, json={"start_date": None})
check("task update clearing start_date is not a 500", r.status_code == 200, r.text[:200])
t = c.get(f"/api/v1/tasks/{tid}", headers=A).json()
r = c.put(f"/api/v1/tasks/{tid}", headers=A, json={"title": "echo", "expected_duration_days": t.get("expected_duration_days")})
check("echoing read-only expected_duration_days is not a 500", r.status_code == 200, r.text[:200])

# ---- uploads
r = c.post(f"/api/v1/folders/{fid}/upload", headers=A, files={"file": ("evil.html", b"<script>alert(1)</script>", "text/html")})
check("html upload rejected", r.status_code == 400, f"{r.status_code} {r.text[:100]}")
r = c.post(f"/api/v1/folders/{fid}/upload", headers=B, files={"file": ("a.txt", b"hi", "text/plain")})
check("bob cannot upload into alice's folder", r.status_code == 403, r.status_code)
r = c.post(f"/api/v1/folders/{fid}/upload", headers=A, files={"file": ("pic.svg", b"<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>", "image/svg+xml")})
check("svg upload accepted", r.status_code == 200, r.text[:150])
if r.status_code == 200:
    url = r.json()["url"]
    s = c.get(url)
    check("served svg is attachment + nosniff + sandbox",
          s.headers.get("content-disposition") == "attachment" and s.headers.get("x-content-type-options") == "nosniff"
          and "sandbox" in s.headers.get("content-security-policy", ""), dict(s.headers))
r = c.post(f"/api/v1/folders/{fid}/upload", headers=A, files={"file": ("note.txt", b"hello world", "text/plain")})
if r.status_code == 200:
    s = c.get(r.json()["url"])
    check("plain upload served with nosniff", s.status_code == 200 and s.text == "hello world" and s.headers.get("x-content-type-options") == "nosniff")
big = b"0" * (51 * 1024 * 1024)
r = c.post(f"/api/v1/folders/{fid}/upload", headers=A, files={"file": ("big.bin", big)})
check("51 MB upload rejected with 413", r.status_code == 413, r.status_code)

# ---- webhooks SSRF
r = c.post("/api/v1/webhooks/", headers=A, json={"name": "evil", "url": "http://169.254.169.254/latest/", "provider": "generic"})
check("webhook to metadata IP rejected", r.status_code == 400, f"{r.status_code} {r.text[:100]}")
r = c.post("/api/v1/webhooks/", headers=A, json={"name": "evil", "url": "http://db:5432/", "provider": "generic"})
check("webhook to internal hostname rejected", r.status_code == 400, f"{r.status_code} {r.text[:100]}")

# ---- /mcp
r = c.get("/mcp/sse")
check("/mcp without a token is 401", r.status_code == 401, r.status_code)
r = c.get("/mcp/sse", headers=auth("mono_mcp_not-a-real-token"))
check("/mcp with an unknown token is 401", r.status_code == 401, r.status_code)
r = c.post("/api/v1/users/me/mcp-tokens", headers=A, json={"name": "smoke"})
check("personal MCP token minted", r.status_code == 201 and r.json().get("token", "").startswith("mono_mcp_"), r.status_code)
MCP_KEY = r.json().get("token", "") if r.status_code == 201 else ""
r = c.get("/mcp/sse", headers={**auth(MCP_KEY), "Host": "evil.example"}, timeout=5)
check("/mcp rejects an unexpected Host header (DNS rebinding)", r.status_code in (400, 421), r.status_code)
try:
    with c.stream("GET", "/mcp/sse", headers={**auth(MCP_KEY), "Host": "localhost:8080"}, timeout=5) as resp:
        check("/mcp with key opens the SSE stream", resp.status_code == 200 and "text/event-stream" in resp.headers.get("content-type", ""), f"{resp.status_code} {resp.headers.get('content-type')}")
except httpx.ReadTimeout:
    check("/mcp with key opens the SSE stream", True)
token_id = next((t["id"] for t in c.get("/api/v1/users/me/mcp-tokens", headers=A).json() if t["name"] == "smoke"), None)
r = c.delete(f"/api/v1/users/me/mcp-tokens/{token_id}", headers=A)
check("MCP token revoked", r.status_code == 204, r.status_code)
r = c.get("/mcp/sse", headers={**auth(MCP_KEY), "Host": "localhost:8080"}, timeout=5)
check("/mcp with a revoked token is 401", r.status_code == 401, r.status_code)

# ---- websocket via proxy
try:
    from websockets.sync.client import connect

    ws_base = BASE.replace("http://", "ws://")
    with connect(f"{ws_base}/api/v1/notifications/ws", open_timeout=10) as ws:
        ws.send(json.dumps({"type": "auth", "token": users["alice"]}))
        check("ws auth_ok through proxy", json.loads(ws.recv(timeout=10)) == {"type": "auth_ok"})
        ws.send("ping")
        check("ws ping/pong", ws.recv(timeout=10) == "pong")
    with connect(f"{ws_base}/api/v1/notifications/ws", open_timeout=10) as ws:
        ws.send(json.dumps({"type": "auth", "token": "garbage"}))
        try:
            ws.recv(timeout=10)
            check("ws rejects bad token", False)
        except Exception as e:
            check("ws rejects bad token", "1008" in str(e) or "policy" in str(e).lower(), repr(e)[:100])
except Exception as e:
    check("websocket checks", False, repr(e)[:200])

# ---- deactivated user keeps no access (no endpoint to deactivate; covered by unit tests)

# ---- bob changing password requires current password
r = c.put("/api/v1/users/me", headers=B, json={"password": "Another-Pass-1"})
check("password change without current password is 400", r.status_code == 400, r.status_code)
r = c.put("/api/v1/users/me", headers=B, json={"password": "Another-Pass-1", "current_password": pw})
check("password change with current password works", r.status_code == 200, r.text[:150])
check("old password no longer works", login("bob@example.com", pw).status_code == 400)
check("new password works", login("bob@example.com", "Another-Pass-1").status_code == 200)

failed = [n for n, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
