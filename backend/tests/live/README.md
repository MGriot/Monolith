# Live checks (run against a running stack)

These need the real stack (Postgres + nginx + backend) and a **fresh database**: they create users and projects.
They run *inside* the backend container against the proxy, so nothing has to be reachable from the host.

```bash
scripts/live-smoke.sh            # uses .env; add ENV_FILE=... COMPOSE=docker for other setups
```

| File | Checks |
|---|---|
| `smoke_security.py` | proxy/SPA, auth, sign-up gating, login throttling, cross-user 403 matrix, uploads, SSRF, /mcp, websocket auth, password change |
| `smoke_tasks_search.py` | pagination caps, 8-level task trees, dependency cycles, search scoping/escaping, dashboard summary, notifications |
| `smoke_time_fields.py` | timers (one per user), manual entries, task totals + PERT estimate-vs-actual, timesheet scoping, 403s for non-members, custom-field definitions and value validation/cleanup |
| `smoke_bulk.py` | bulk task actions (per-id authorization, partial failures, validation, 200-id cap) and the notification unread-count / filters / mark-unread |
| `bench_task_tree.py` | query count / time / output equivalence of the task tree loader against the old nested-selectinload version |
