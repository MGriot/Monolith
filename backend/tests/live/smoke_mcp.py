"""Live MCP + whiteboard-room checks (run INSIDE the backend container against the nginx proxy, fresh database).

Covers: personal tokens over real SSE, tools acting as the token owner with their project role, structured
results, isError on refused writes, sketch previews rendered for MCP-made boards, and two live websocket peers
editing one whiteboard.
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
HOST = {"Host": "localhost:8080"}  # what the bundled proxy forwards; other Host values are refused (DNS rebinding)

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
pw = "Mcp-" + secrets.token_hex(8)
run_id = secrets.token_hex(3)  # unique accounts, so the file can run again on the same database
ids, toks, emails = {}, {}, {}
for name in ("mcp-editor", "mcp-viewer"):
    emails[name] = f"{name}-{run_id}@example.com"
    r = c.post("/api/v1/users/", headers=admin, json={"email": emails[name], "password": pw, "full_name": name})
    ids[name] = r.json()["id"]
    toks[name] = login(emails[name], pw)


def mint(tok, label):
    r = c.post("/api/v1/users/me/mcp-tokens", headers=auth(tok), json={"name": label, "expires_in_days": 1})
    return r.json()["token"]


editor_mcp = mint(toks["mcp-editor"], "smoke editor")
viewer_mcp = mint(toks["mcp-viewer"], "smoke viewer")


async def session_calls(token, fn):
    from mcp import ClientSession
    from mcp.client.sse import sse_client

    async with sse_client(f"{BASE}/mcp/sse", headers={**auth(token), **HOST}, timeout=20) as (read, write):
        async with ClientSession(read, write) as s:
            await s.initialize()
            return await fn(s)


def data(res):
    sc = res.structuredContent
    if sc is not None:
        return sc["result"] if set(sc) == {"result"} else sc
    return json.loads("".join(getattr(x, "text", "") for x in res.content) or "null")


async def as_editor(s):
    out = {}
    tools = await s.list_tools()
    out["tool_count"] = len(tools.tools)
    out["me"] = data(await s.call_tool("whoami", {}))
    proj = data(await s.call_tool("create_project", {"project": {
        "name": "MCP smoke", "start_date": "2026-11-02", "due_date": "2026-11-30", "deadline_at": "2026-12-04",
        "budget": 1000, "real_cost": 250, "tags": ["smoke"], "priority": "High"}}))
    out["project"] = proj
    pid = proj["id"]
    a = data(await s.call_tool("create_task", {"task": {"project_id": pid, "title": "A", "normal_days": 3,
                                                         "start_date": "2026-11-02", "due_date": "2026-11-04"}}))
    b = data(await s.call_tool("create_task", {"task": {"project_id": pid, "title": "B", "parent_id": a["id"]}}))
    out["dep"] = await s.call_tool("add_dependency", {"successor_id": b["id"], "predecessor_id": a["id"]})
    out["status"] = data(await s.call_tool("update_task_status", {"task_id": b["id"], "status": "Review"}))
    out["update"] = data(await s.call_tool("update_task", {"task_id": a["id"], "changes": {"budget": 77.5}}))
    out["cpm"] = data(await s.call_tool("get_critical_path", {"project_id": pid}))
    out["wb"] = data(await s.call_tool("create_whiteboard", {"project_id": pid, "title": "Smoke sketch", "elements": [
        {"type": "rectangle", "x": 0, "y": 0, "width": 120, "height": 60, "label": "Hello"}]}))
    out["bad"] = await s.call_tool("get_project", {"project_id": "00000000-0000-0000-0000-000000000000"})
    out["search"] = data(await s.call_tool("search", {"query": "MCP smoke"}))
    return out


ed = asyncio.run(session_calls(editor_mcp, as_editor))
pid = ed["project"]["id"]
check("MCP lists 100+ tools", ed["tool_count"] >= 100, ed["tool_count"])
check("whoami is the token owner", ed["me"]["email"] == emails["mcp-editor"], ed["me"])
check("create_project stores deadline and budget", ed["project"].get("deadline_at", "").startswith("2026-12-04")
      and ed["project"]["budget"] == 1000 and ed["project"]["owner_id"] == ids["mcp-editor"], ed["project"])
check("add_dependency succeeds", not ed["dep"].isError, ed["dep"].content)
check("update_task_status changes only the status", ed["status"]["status"] == "Review", ed["status"])
check("update_task applies partial changes", ed["update"]["budget"] == 77.5 and ed["update"]["title"] == "A", ed["update"])
check("critical path returns tasks", isinstance(ed["cpm"].get("critical_tasks"), list), ed["cpm"])
check("unknown project is a tool error", ed["bad"].isError, ed["bad"].content)
check("search finds the new project", any(h.get("id") == pid or "MCP smoke" in json.dumps(h) for h in ed["search"]), ed["search"])
preview = ed["wb"].get("preview_image") or ""
check("MCP sketch gets a server-rendered preview", preview.startswith("/uploads/previews/") and preview.endswith(".svg"), preview)
r = c.get(preview)
check("preview file is served", r.status_code == 200 and b"<svg" in r.content[:200], r.status_code)
lst = c.get(f"/api/v1/whiteboards/?project_id={pid}", headers=auth(toks["mcp-editor"])).json()
check("whiteboard list omits scene data", lst and "data" not in lst[0] and lst[0]["preview_image"] == preview, lst)

# viewer: can read, cannot write
r = c.put(f"/api/v1/projects/{pid}/members/{ids['mcp-viewer']}", headers=auth(toks["mcp-editor"]), json={"role": "viewer"})
check("owner adds a viewer", r.status_code == 200, r.text[:200])


async def as_viewer(s):
    read = await s.call_tool("get_project", {"project_id": pid, "include_tasks": False})
    write = await s.call_tool("create_task", {"task": {"project_id": pid, "title": "nope"}})
    return read, write


read, write = asyncio.run(session_calls(viewer_mcp, as_viewer))
check("viewer token can read the project", not read.isError and data(read)["my_role"] == "viewer", read.content)
check("viewer token cannot create tasks (isError)", write.isError and "Permission denied" in write.content[0].text, write.content)

# revoked token stops working at once
tid = next(t["id"] for t in c.get("/api/v1/users/me/mcp-tokens", headers=auth(toks["mcp-viewer"])).json())
c.delete(f"/api/v1/users/me/mcp-tokens/{tid}", headers=auth(toks["mcp-viewer"]))
r = c.get("/mcp/sse", headers={**auth(viewer_mcp), **HOST}, timeout=5)
check("revoked MCP token is refused", r.status_code == 401, r.status_code)

# ---- live whiteboard room: editor and viewer on the same board
from websockets.sync.client import connect  # noqa: E402

wid = ed["wb"]["id"]
ws_url = BASE.replace("http://", "ws://") + f"/api/v1/whiteboards/{wid}/ws"


def recv_type(ws, kind, limit=10):
    for _ in range(limit):
        msg = json.loads(ws.recv(timeout=5))
        if msg["type"] == kind:
            return msg
    return None


with connect(ws_url, open_timeout=10) as e_ws, connect(ws_url, open_timeout=10) as v_ws:
    e_ws.send(json.dumps({"type": "auth", "token": toks["mcp-editor"]}))
    e_init = recv_type(e_ws, "init")
    v_ws.send(json.dumps({"type": "auth", "token": toks["mcp-viewer"]}))
    v_init = recv_type(v_ws, "init")
    check("room init carries the saved scene", e_init and any(el["type"] == "rectangle" for el in e_init["elements"]), e_init)
    check("room knows roles", e_init["role"] == "admin" and v_init["role"] == "viewer", (e_init["role"], v_init["role"]))
    peers = None
    for _ in range(5):  # the first presence message may predate the viewer's arrival
        peers = recv_type(e_ws, "peers")
        if peers and len(peers["peers"]) == 2:
            break
    check("presence lists both real users", peers and {p["name"] for p in peers["peers"]} == {"mcp-editor", "mcp-viewer"}, peers)
    rect = next(el for el in e_init["elements"] if el["type"] == "rectangle")
    moved = {**rect, "x": rect["x"] + 50, "version": rect["version"] + 1}
    e_ws.send(json.dumps({"type": "scene_update", "elements": [moved]}))
    got = recv_type(v_ws, "scene_update")
    check("viewer receives the editor's change live", got and got["elements"][0]["x"] == moved["x"], got)
    v_ws.send(json.dumps({"type": "scene_update", "elements": [{**moved, "version": moved["version"] + 1}]}))
    err = recv_type(v_ws, "error")
    check("viewer edits are refused", err is not None, err)

with connect(ws_url, open_timeout=10) as bad:
    bad.send(json.dumps({"type": "auth", "token": toks["mcp-editor"] + "x"}))
    try:
        bad.recv(timeout=5)
        closed = False
    except Exception:
        closed = True
check("room refuses a bad token", closed)

# saved on leave
import time  # noqa: E402

time.sleep(1)
board = c.get(f"/api/v1/whiteboards/{wid}", headers=auth(toks["mcp-editor"])).json()
x = next(el["x"] for el in board["data"]["elements"] if el["id"] == rect["id"])
check("room saved the live edit when everyone left", x == moved["x"], x)

failed = [n for n, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
