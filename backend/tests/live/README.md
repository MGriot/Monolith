# Live checks (run against a running stack)

These need the real stack (Postgres + nginx + backend) and a **fresh database**: they create users and projects.
They run *inside* the backend container against the proxy, so nothing has to be reachable from the host.

```bash
scripts/live-smoke.sh            # runs every smoke_*.py; ENGINE=docker and/or CONTAINER=<name> for other setups
```

| File | Checks |
|---|---|
| `smoke_security.py` | proxy/SPA, auth, sign-up gating, login throttling, cross-user 403 matrix, uploads, SSRF, /mcp, websocket auth, password change |
| `smoke_tasks_search.py` | pagination caps, 8-level task trees, dependency cycles, search scoping/escaping, dashboard summary, notifications |
| `smoke_time_fields.py` | timers (one per user), manual entries, task totals + PERT estimate-vs-actual, timesheet scoping, 403s for non-members, custom-field definitions and value validation/cleanup |
| `smoke_bulk.py` | bulk task actions (per-id authorization, partial failures, validation, 200-id cap) and the notification unread-count / filters / mark-unread |
| `smoke_automations.py` | rule CRUD + role gates, validation, set_field / assign / notify (in-app + e-mail queue), status triggers, ping-pong loop termination, failure isolation, project webhook queueing and formats, the `due_soon` sweep |
| `smoke_mcp.py` | personal MCP tokens over real SSE, tools acting with the owner's project role, isError on refused writes, revocation, server-rendered sketch previews, two live websocket peers on one whiteboard (presence, relay, viewer refusal, save on leave) |
| `smoke_activity.py` | task change log through REST and MCP (actor, summary), roll-ups and automations labelled as automatic, viewer/outsider access, lines kept after a delete |
| `smoke_mail.py` | delivery through the outbox to the real mail server over authenticated STARTTLS |
| `smoke_recurrence_ics.py` | recurring tasks and the personal calendar feed |
| `smoke_roles.py` | project roles (viewer / editor / admin) |
| `smoke_transactions.py` | the unit of work: failures injected half-way through compound CRUD operations leave nothing behind |

`bench_task_tree.py` is not part of `live-smoke.sh` (only `smoke_*.py` are). It measures query count, time and output
equivalence of the task tree loader; copy it into the backend container and run it there by hand.
