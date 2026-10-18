#!/usr/bin/env python3
"""Build the "Helios" sample project in Monolith, entirely through the MCP server.

Every record (project, scoped taxonomy, custom fields, ~25 nested tasks with PERT estimates, dependencies,
checklists, assignees and custom values, time entries, threaded comments, an idea, an Excalidraw sketch and a
File Hub runbook) is created with MCP tool calls, as the owner of the token. It never creates user accounts:
assignees and members are existing, active users.

    pip install "mcp<2"
    export MONOLITH_MCP_TOKEN=mono_mcp_...            # Settings > MCP access, or app.scripts.mint_mcp_token
    python scripts/mcp_sample_project.py --replace     # SSE at http://localhost:8080/mcp/sse
    python scripts/mcp_sample_project.py --stdio       # podman exec -i ... python mcp_server.py
    python scripts/mcp_sample_project.py --member ana@example.com:editor --member bo@example.com:viewer

Payload: scripts/sample_project.json (edit it to build a different project).
"""
import argparse
import asyncio
import json
import math
import os
import sys
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List

from mcp import ClientSession, StdioServerParameters
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client

HERE = Path(__file__).resolve().parent


class Monolith:
    """Thin wrapper: call a tool, raise on isError, return its JSON."""

    def __init__(self, session: ClientSession, verbose: bool):
        self.session = session
        self.verbose = verbose
        self.calls = 0

    async def __call__(self, _tool: str, /, **args: Any) -> Any:
        args = {k: v for k, v in args.items() if v is not None}
        result = await self.session.call_tool(_tool, args)
        self.calls += 1
        text = "".join(getattr(c, "text", "") for c in result.content)
        if result.isError:
            raise RuntimeError(f"{_tool} failed: {text}")
        if self.verbose:
            print(f"  · {_tool}", file=sys.stderr)
        sc = result.structuredContent
        if sc is not None:
            return sc["result"] if set(sc) == {"result"} else sc
        return json.loads(text) if text else None


def pert_days(o: int, n: int, p: int) -> int:
    return max(0, math.ceil((o + 4 * n + p) / 6))


def d(value: str) -> date:
    return date.fromisoformat(value[:10])


async def build(mono: Monolith, payload: Dict[str, Any], members: List[str], replace: bool) -> None:
    me = await mono("whoami")
    spec = payload["project"]
    print(f"Acting as {me.get('full_name') or me['email']}")

    if replace:
        for p in await mono("list_projects", include_archived=True, limit=500):
            if p["name"] == spec["name"]:
                await mono("delete_project", project_id=p["id"])
                print(f"Deleted the previous '{p['name']}'")

    # --- people: existing users only ----------------------------------------------------------------------
    users = [u for u in await mono("list_users", limit=500) if u.get("is_active", True)]
    by_email = {u["email"].lower(): u for u in users}
    roles: Dict[str, str] = {}
    for item in members:
        email, _, role = item.partition(":")
        user = by_email.get(email.lower())
        if not user:
            raise SystemExit(f"No active user {email!r}; invite them first (this script never creates accounts)")
        roles[user["id"]] = role or "editor"
    if not members:  # default: up to three teammates as editors, a fourth as viewer
        others = [u for u in users if u["id"] != me["id"]]
        for i, user in enumerate(others[:4]):
            roles[user["id"]] = "viewer" if i == 3 else "editor"
    team = [me["id"]] + [uid for uid, r in roles.items() if r in ("editor", "admin")]
    slot = {"lead": me["id"]}
    for i, key in enumerate(("m1", "m2", "m3")):
        slot[key] = team[(i + 1) % len(team)] if len(team) > 1 else me["id"]

    # --- project ------------------------------------------------------------------------------------------
    project = await mono("create_project", project={**spec, "member_ids": list(roles)})
    pid = project["id"]
    print(f"Created project {project['name']}  ({pid})")
    for uid, role in roles.items():
        await mono("set_project_member_role", project_id=pid, user_id=uid, role=role)

    topic_ids = {t["name"]: (await mono("create_topic", topic={**t, "project_id": pid}))["id"] for t in payload["topics"]}
    type_ids = {t["name"]: (await mono("create_work_type", work_type={**t, "project_id": pid}))["id"]
                for t in payload["work_types"]}
    await mono("update_project", project_id=pid, changes={"topic_ids": list(topic_ids.values()),
                                                          "type_ids": list(type_ids.values())})

    fields: Dict[str, str] = {}
    for f in payload["custom_fields"]:
        body = {"name": f["name"], "field_type": f["field_type"], "options": f.get("options", [])}
        fields[f["key"]] = (await mono("create_custom_field", project_id=pid, field=body))["id"]

    # --- tasks: forward schedule from PERT estimates and dependencies -------------------------------------
    ids: Dict[str, str] = {}
    begin: Dict[str, date] = {}
    finish: Dict[str, date] = {}
    links = []
    for phase in payload["phases"]:
        phase_task = await mono("create_task", task={
            "project_id": pid, "title": phase["title"], "status": phase["status"], "priority": phase["priority"],
            "start_date": phase["start_date"], "due_date": phase["due_date"], "budget": phase["budget"],
            "real_cost": phase["real_cost"], "topic_ids": [topic_ids[t] for t in phase.get("topics", [])],
            "custom_values": {fields["work_package"]: phase["work_package"], fields["cost_centre"]: "CC-4410-CDP"},
            "description": f"Phase of {spec['name']}. Work package {phase['work_package']}.",
        })
        ids[phase["key"]] = phase_task["id"]
        cursor = d(phase["start_date"])
        for t in phase["tasks"]:
            o, n, p = t.get("pert", [0, 0, 0])
            preds = t.get("after", [])
            lag = t.get("lag_days", 0)
            if t.get("dependency_type") == "SS":  # start-to-start: begins `lag` days after the predecessors begin
                start = max([cursor] + [begin[k] + timedelta(days=lag) for k in preds if k in begin])
            else:  # finish-to-start
                start = max([cursor] + [finish[k] + timedelta(days=1 + lag) for k in preds if k in finish])
            length = 0 if t.get("milestone") else max(1, pert_days(o, n, p))
            start = d(t["start_date"]) if t.get("start_date") else start
            due = d(t["due_date"]) if t.get("due_date") else start + timedelta(days=max(0, length - 1))
            checklist = [{"id": uuid.uuid4().hex, "text": c, "is_done": i < t.get("done_checks", 0)}
                         for i, c in enumerate(t.get("checklist", []))]
            risk = t.get("risk", [1, 1])
            body = {
                "project_id": pid, "parent_id": ids[phase["key"]], "title": t["title"], "status": t["status"],
                "priority": t.get("priority", phase["priority"]), "is_milestone": bool(t.get("milestone")),
                "start_date": start.isoformat(), "due_date": due.isoformat(), "deadline_at": t.get("deadline_at"),
                "optimistic_days": o, "normal_days": n, "pessimistic_days": p,
                "budget": t.get("budget", 0), "real_cost": t.get("real_cost", 0),
                "risk_probability": risk[0], "risk_impact": risk[1],
                "assignee_ids": [slot[t["assignee"]]] if t.get("assignee") else [],
                "topic_ids": [topic_ids[x] for x in t.get("topics", phase.get("topics", []))],
                "type_ids": [type_ids[t["work_type"]]] if t.get("work_type") else [],
                "checklist": checklist, "recurrence_rule": t.get("recurrence_rule"),
                "tags": [phase["work_package"].split()[0].lower()],
                "custom_values": {k: v for k, v in {
                    fields["allocation"]: t.get("allocation"),
                    fields["work_package"]: phase["work_package"],
                    fields["cost_centre"]: "CC-4410-CDP",
                }.items() if v is not None},
            }
            if t["status"] == "Done":
                body["completed_at"] = due.isoformat()
            created = await mono("create_task", task=body)
            ids[t["key"]] = created["id"]
            begin[t["key"]] = start
            finish[t["key"]] = due
            for pred in preds:
                links.append((t["key"], pred, t.get("dependency_type", "FS"), t.get("lag_days", 0)))
    # A phase spans exactly its scheduled children, so the critical path runs through the work, not the summaries.
    for phase in payload["phases"]:
        keys = [t["key"] for t in phase["tasks"] if t["key"] in begin]
        await mono("update_task", task_id=ids[phase["key"]], changes={
            "start_date": min(begin[k] for k in keys).isoformat(), "due_date": max(finish[k] for k in keys).isoformat()})
    for succ, pred, kind, lag in links:
        await mono("add_dependency", successor_id=ids[succ], predecessor_id=ids[pred], type=kind, lag_days=lag)
    print(f"Created {len(ids)} tasks and {len(links)} dependencies")

    # --- collaboration ------------------------------------------------------------------------------------
    for e in payload["time_entries"]:
        start = datetime.fromisoformat(e["start"])
        await mono("log_time", task_id=ids[e["task"]], started_at=start.isoformat(),
                   ended_at=(start + timedelta(hours=e["hours"])).isoformat(), note=e["note"])
    for c in payload["comments"]:
        target = {"project_id": pid} if c["on"] == "project" else {"task_id": ids[c["on"]]}
        parent = await mono("add_comment", content=c["content"], **target)
        if c.get("reply"):
            await mono("add_comment", content=c["reply"], parent_id=parent["id"], **target)
    idea = await mono("propose_idea", project_id=pid, **payload["idea"])
    await mono("vote_idea", idea_id=idea["id"], direction="up")
    sketch = await mono("create_whiteboard", project_id=pid, title=payload["whiteboard"]["title"],
                        description=payload["whiteboard"]["description"], elements=payload["whiteboard"]["elements"])
    folder = await mono("create_folder", project_id=pid, name=payload["runbook"]["folder"], type="notes")
    await mono("create_note", folder_id=folder["id"], name=payload["runbook"]["name"], content=payload["runbook"]["content"])

    # --- report -------------------------------------------------------------------------------------------
    cpm = await mono("get_critical_path", project_id=pid)
    stats = await mono("get_project_statistics", project_id=pid)
    health = next((h for h in (await mono("get_portfolio_health"))["projects"] if h["id"] == pid), None)
    full = await mono("get_project", project_id=pid, include_tasks=False)

    print("\n=== Helios built via MCP ===")
    window = f"{(full.get('start_date') or '')[:10]} → {(full.get('due_date') or '')[:10]}"
    print(f"Window       {window}  (follows the tasks; hard deadline {(full.get('deadline_at') or '')[:10]})")
    print(f"Budget       {spec['budget']:,.0f} planned / {spec['real_cost']:,.0f} actual")
    print(f"Members      {len(full.get('members', []))} + owner; roles: {', '.join(sorted(set(roles.values()))) or 'owner only'}")
    print(f"Progress     {full.get('progress_percent', 0):.0f}%")
    done_days = len(stats) if isinstance(stats, list) else 0
    print(f"Completions  {sum(d.get('count', 0) for d in stats) if done_days else 0} tasks done on {done_days} days")
    print(f"Critical path ({len(cpm['critical_tasks'])} tasks):")
    for t in cpm["critical_tasks"]:
        print(f"  {t['wbs_code'] or '-':>6}  {t['title']}")
    if health:
        print(f"Health       score {health['health_score']:.0f}, risk {health['risk_level']}, deadline {health.get('deadline_status')}")
    print(f"Sketch       {sketch.get('preview_image')}")
    print(f"Done in {mono.calls} MCP calls.")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Create the Helios sample project through Monolith's MCP server.")
    parser.add_argument("--url", default=os.environ.get("MONOLITH_MCP_URL", "http://localhost:8080/mcp/sse"))
    parser.add_argument("--stdio", action="store_true", help="spawn the server with podman exec instead of SSE")
    parser.add_argument("--container", default="monolith_backend")
    parser.add_argument("--engine", default="podman", help="podman or docker (with --stdio)")
    parser.add_argument("--payload", default=str(HERE / "sample_project.json"))
    parser.add_argument("--member", action="append", default=[], help="email:role (viewer|editor|admin); repeatable")
    parser.add_argument("--replace", action="store_true", help="delete an existing project with the same name first")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    token = os.environ.get("MONOLITH_MCP_TOKEN", "").strip()
    if not token:
        raise SystemExit("Set MONOLITH_MCP_TOKEN to a personal MCP token (Settings > MCP access).")
    payload = json.loads(Path(args.payload).read_text(encoding="utf-8"))

    if args.stdio:
        params = StdioServerParameters(
            command=args.engine,
            args=["exec", "-i", "-e", "MONOLITH_MCP_TOKEN", args.container, "python", "mcp_server.py"],
            env={**os.environ, "MONOLITH_MCP_TOKEN": token},
        )
        transport = stdio_client(params)
    else:
        transport = sse_client(args.url, headers={"Authorization": f"Bearer {token}"}, timeout=30, sse_read_timeout=300)

    async with transport as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            await build(Monolith(session, args.verbose), payload, args.member, args.replace)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except BaseExceptionGroup as group:  # surface the real error instead of anyio's task-group wrapper
        while isinstance(group, BaseExceptionGroup) and len(group.exceptions) == 1:
            group = group.exceptions[0]
        raise SystemExit(f"Error: {group}")
