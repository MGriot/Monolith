"""Time tracking + custom fields live checks (run inside the backend container, against the proxy).
Needs a fresh DB (creates erin/frank/grace)."""
import os
import secrets
import sys
import time
from datetime import date, datetime, timedelta

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
for n in ("erin", "frank", "grace"):
    r = c.post("/api/v1/users/", headers=H(admin), json={"email": f"{n}@example.com", "password": pw, "full_name": n})
    uid[n] = r.json()["id"]
    tok[n] = c.post("/api/v1/login/access-token", data={"username": f"{n}@example.com", "password": pw}).json()["access_token"]
E, F, G, A = H(tok["erin"]), H(tok["frank"]), H(tok["grace"]), H(admin)

pid = c.post("/api/v1/projects/", headers=E, json={"name": "Time project", "member_ids": [uid["grace"]]}).json()["id"]
mk = lambda title, **kw: c.post("/api/v1/tasks/", headers=E, json={"title": title, "project_id": pid, **kw}).json()  # noqa: E731
t1 = mk("estimated", optimistic_days=1, normal_days=2, pessimistic_days=9)  # PERT 3.0 days = 24 h
t2 = mk("plain")
T = lambda t: f"/api/v1/time/tasks/{t['id']}"  # noqa: E731

# ---- timer: one running per user
check("no running timer at first", c.get("/api/v1/time/running", headers=E).json() is None)
r = c.post(f"{T(t1)}/start", headers=E, json={"note": "working"})
check("start timer", r.status_code == 200 and r.json()["ended_at"] is None, r.text[:150])
check("running timer is reported", (c.get("/api/v1/time/running", headers=E).json() or {}).get("task_id") == t1["id"])
r = c.post(f"{T(t2)}/start", headers=E, json={})
check("second timer is refused with 409", r.status_code == 409, f"{r.status_code} {r.text[:100]}")
time.sleep(1.2)
r = c.post("/api/v1/time/stop", headers=E)
check("stop timer", r.status_code == 200 and r.json()["ended_at"] and r.json()["duration_seconds"] >= 1, r.text[:150])
check("stop without a timer is 404", c.post("/api/v1/time/stop", headers=E).status_code == 404)
check("running is null again", c.get("/api/v1/time/running", headers=E).json() is None)

# ---- manual entries, totals, estimate vs actual
day = date.today() - timedelta(days=2)
start = datetime.combine(day, datetime.min.time()).replace(hour=9)
manual = {"started_at": start.isoformat(), "ended_at": (start + timedelta(hours=2)).isoformat(), "note": "manual"}
r = c.post(f"{T(t1)}/entries", headers=E, json=manual)
check("manual entry", r.status_code == 200 and r.json()["duration_seconds"] == 7200, r.text[:150])
entry_id = r.json()["id"]
r = c.post(f"{T(t1)}/entries", headers=E, json={**manual, "ended_at": (start - timedelta(hours=1)).isoformat()})
check("entry ending before it starts is rejected (422)", r.status_code == 422, r.status_code)
future = datetime.utcnow() + timedelta(days=3)
r = c.post(f"{T(t1)}/entries", headers=E, json={"started_at": future.isoformat(), "ended_at": (future + timedelta(hours=1)).isoformat()})
check("entry in the future is rejected (400)", r.status_code == 400, r.status_code)
body = c.get(T(t1), headers=E).json()
s = body["summary"]
check("task total includes both entries", 7200 < s["total_seconds"] <= 7210 and s["entry_count"] == 2, s)
check("estimate comes from PERT (24 h)", s["estimate_hours"] == 24.0 and s["percent_of_estimate"] is not None, s)
check("entries list carries the author", body["entries"][0]["user"]["email"] == "erin@example.com")
r = c.put(f"/api/v1/time/entries/{entry_id}", headers=E, json={"note": "edited"})
check("author can edit a note", r.status_code == 200 and r.json()["note"] == "edited", r.text[:150])
check("no-estimate task reports null percent", c.get(T(t2), headers=E).json()["summary"]["percent_of_estimate"] is None)

# ---- members may log time, outsiders may not (and cannot touch entries)
check("member grace can start a timer", c.post(f"{T(t2)}/start", headers=G, json={}).status_code == 200)
check("grace can stop it", c.post("/api/v1/time/stop", headers=G).status_code == 200)
for label, r in (
    ("read", c.get(T(t1), headers=F)),
    ("start", c.post(f"{T(t1)}/start", headers=F, json={})),
    ("manual", c.post(f"{T(t1)}/entries", headers=F, json=manual)),
):
    check(f"outsider frank gets 403 on {label}", r.status_code == 403, r.status_code)
check("grace cannot edit erin's entry", c.put(f"/api/v1/time/entries/{entry_id}", headers=G, json={"note": "x"}).status_code == 403)
check("grace cannot delete erin's entry", c.delete(f"/api/v1/time/entries/{entry_id}", headers=G).status_code == 403)

# ---- timesheet
rng = f"date_from={day}&date_to={day}"
r = c.get(f"/api/v1/time/timesheet?project_id={pid}&{rng}", headers=E)
rows = r.json().get("rows", []) if r.status_code == 200 else []
check("project timesheet for the manual day: erin 2h", r.status_code == 200 and len(rows) == 1 and rows[0]["total_seconds"] == 7200 and rows[0]["project_name"] == "Time project", r.text[:200])
r = c.get(f"/api/v1/time/timesheet?project_id={pid}", headers=G)
check("members see everyone in the project timesheet", {x["user_name"] for x in r.json()["rows"]} == {"erin", "grace"}, r.text[:200])
check("timesheet user filter", [x["user_name"] for x in c.get(f"/api/v1/time/timesheet?project_id={pid}&user_id={uid['grace']}", headers=E).json()["rows"]] == ["grace"])
check("timesheet outside the range is empty", c.get(f"/api/v1/time/timesheet?project_id={pid}&date_from={date.today() + timedelta(days=30)}", headers=E).json()["rows"] == [])
check("outsider gets 403 on project timesheet", c.get(f"/api/v1/time/timesheet?project_id={pid}", headers=F).status_code == 403)
check("own timesheet without project works", c.get("/api/v1/time/timesheet", headers=G).status_code == 200)
check("other user's timesheet without project is 403", c.get(f"/api/v1/time/timesheet?user_id={uid['erin']}", headers=G).status_code == 403)
check("superuser may query any user", c.get(f"/api/v1/time/timesheet?user_id={uid['erin']}", headers=A).status_code == 200)
check("inverted range is 400", c.get(f"/api/v1/time/timesheet?date_from=2026-02-01&date_to=2026-01-01", headers=E).status_code == 400)

# ---- deleting an entry
check("author deletes entry", c.delete(f"/api/v1/time/entries/{entry_id}", headers=E).status_code == 204)
check("deleted entry is gone from the total", c.get(T(t1), headers=E).json()["summary"]["entry_count"] == 1)

# ---- custom fields
CF = f"/api/v1/projects/{pid}/custom-fields"
mkf = lambda **kw: c.post(CF, headers=E, json=kw)  # noqa: E731
f_text, f_num = mkf(name="Client", field_type="text"), mkf(name="Points", field_type="number")
f_sel = mkf(name="Stage", field_type="select", options=["alpha", "beta"])
f_date, f_user = mkf(name="Review", field_type="date"), mkf(name="Reviewer", field_type="user")
check("five definitions created", all(f.status_code == 200 for f in (f_text, f_num, f_sel, f_date, f_user)), [f.text[:80] for f in (f_text, f_num, f_sel, f_date, f_user)])
fid = {k: f.json()["id"] for k, f in (("text", f_text), ("num", f_num), ("sel", f_sel), ("date", f_date), ("user", f_user))}
check("duplicate name is 409", mkf(name="Client", field_type="text").status_code == 409)
check("select without options is 400", mkf(name="Empty", field_type="select", options=[]).status_code == 400)
check("unknown type is 422", mkf(name="Odd", field_type="color").status_code == 422)
check("list returns them in order", [f["name"] for f in c.get(CF, headers=G).json()] == ["Client", "Points", "Stage", "Review", "Reviewer"])
check("outsider cannot list definitions", c.get(CF, headers=F).status_code == 403)
check("outsider cannot create definitions", c.post(CF, headers=F, json={"name": "Z", "field_type": "text"}).status_code == 403)
check("outsider cannot delete definitions", c.delete(f"{CF}/{fid['text']}", headers=F).status_code == 403)

good = {fid["text"]: "ACME", fid["num"]: 5, fid["sel"]: "beta", fid["date"]: "2026-05-01", fid["user"]: uid["grace"]}
r = c.put(f"/api/v1/tasks/{t2['id']}", headers=E, json={"custom_values": good})
check("valid values are saved and returned", r.status_code == 200 and r.json()["custom_values"] == good, r.text[:200])
check("values are returned by the project task list", any(t["id"] == t2["id"] and t["custom_values"] == good for t in c.get(f"/api/v1/tasks/?project_id={pid}", headers=E).json()))
for label, bad in (
    ("number as text", {fid["num"]: "five"}),
    ("select outside options", {fid["sel"]: "gamma"}),
    ("bad date", {fid["date"]: "tomorrow"}),
    ("unknown user", {fid["user"]: "00000000-0000-0000-0000-000000000000"}),
    ("unknown field id", {"00000000-0000-0000-0000-000000000000": "x"}),
):
    r = c.put(f"/api/v1/tasks/{t2['id']}", headers=E, json={"custom_values": bad})
    check(f"invalid value rejected: {label}", r.status_code == 400, f"{r.status_code} {r.text[:100]}")
r = c.post("/api/v1/tasks/", headers=E, json={"title": "with values", "project_id": pid, "custom_values": {fid["text"]: "created"}})
check("create task with custom values", r.status_code == 200 and r.json()["custom_values"] == {fid["text"]: "created"}, r.text[:200])
r = c.post("/api/v1/tasks/", headers=E, json={"title": "bad values", "project_id": pid, "custom_values": {fid["sel"]: "nope"}})
check("create task with invalid values is 400", r.status_code == 400, r.status_code)
r = c.post("/api/v1/tasks/", headers=E, json={"title": "no project", "custom_values": {fid["text"]: "x"}})
check("independent task cannot carry custom values", r.status_code == 400, r.status_code)
r = c.put(f"/api/v1/tasks/{t2['id']}", headers=E, json={"title": "renamed"})
check("an update without custom_values keeps them", r.json()["custom_values"] == good, r.text[:150])
r = c.put(f"/api/v1/tasks/{t2['id']}", headers=E, json={"custom_values": {**good, fid["num"]: None}})
check("null clears one value", r.status_code == 200 and fid["num"] not in r.json()["custom_values"], r.text[:150])

# shrinking select options clears the values that no longer fit; renaming keeps values (they are keyed by id)
r = c.put(f"{CF}/{fid['sel']}", headers=E, json={"options": ["alpha"], "name": "Phase"})
check("edit select options + rename", r.status_code == 200 and r.json()["options"] == ["alpha"] and r.json()["name"] == "Phase", r.text[:150])
vals = c.get(f"/api/v1/tasks/{t2['id']}", headers=E).json()["custom_values"]
check("value outside the new options was cleared", fid["sel"] not in vals and vals.get(fid["text"]) == "ACME", vals)
check("deleting a definition: 204", c.delete(f"{CF}/{fid['text']}", headers=E).status_code == 204)
vals = c.get(f"/api/v1/tasks/{t2['id']}", headers=E).json()["custom_values"]
check("its values were removed from tasks", fid["text"] not in vals and fid["user"] in vals, vals)

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
