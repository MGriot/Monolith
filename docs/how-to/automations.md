# Automation rules and project webhooks

Project settings → **Rules & automation** (project admins; everybody with a project role can read the rules and their history).

A rule is *when* a trigger happens, *only if* all its conditions hold, *then* its actions run in order.

| | Options |
|---|---|
| Triggers | `task_created`, `status_changed`, `assigned`, `task_completed`, `due_soon` (open tasks due within 48 h; checked by the daily 07:00 UTC job, once per rule and task) |
| Conditions (AND) | status, previous status (`status_changed` only), priority, assignee, title (contains), tags (contains), milestone, due date (set / empty); operators is / is not / any of / none of / contains / is set / is empty |
| Actions | change status, priority or assignee; assign a user; notify (in-app, optionally e-mail, text may use `{task_title} {status} {priority} {project}`); call one of the project's webhooks |

Limits: 50 rules per project, 10 conditions and 10 actions per rule. People an action refers to must be members of the project, webhooks must belong to it.

## How it runs

`crud_task.create / update / update_assignees` call `app.core.automations.fire_task_events()` after the task change is written, inside the request's unit of work ([transactions](transactions.md)).

* **Failure-isolated.** The actions of one rule run in a SAVEPOINT: a failing rule undoes only itself, is recorded in `automation_runs` with the error, and never fails the user's request. `dispatch()` swallows everything except cancellation.
* **Loop-safe.** An action that changes the task fires the hooks again. A context variable carries the chain: depth is limited to 3 levels and a (rule, task) pair runs at most once per chain. Skips are recorded in the run history ("loop guard" / "levels deep").
* **Audit.** A run row is written each time a rule's conditions matched (status `ok` or `error`); 90 days are kept (pruned by the daily job).
* Changes made to a parent by the automatic status roll-up from its subtasks do not fire events.

## Project webhooks

Webhooks with a `project_id` (added in the same settings card; only project admins may attach one) receive the events `task.created`, `task.status_changed`, `task.assigned`, `task.completed`. Moving a task to Done sends only `task.completed`. Formats: Slack `{"text"}`, Discord `{"content"}`, generic structured JSON (`event`, `task`, `project`, `changes`, `url`, `timestamp`).

Deliveries are **queued, not sent by the request**: the engine inserts a `webhook_deliveries` row in the same transaction (so nothing is sent for a rolled-back change) and a background worker (`run_webhook_worker`, started with the app, `SKIP LOCKED`, safe with several processes) POSTs it after the commit with a 10 s timeout, the SSRF guard (re-checked at send time, no redirects), and up to 5 attempts with exponential backoff. Blocked URLs and 4xx answers (except 408/425/429) fail immediately.

## API

| | |
|---|---|
| `GET /projects/{id}/automations` | list (any project role) |
| `POST /projects/{id}/automations` | create (admin) |
| `PUT /projects/{id}/automations/{rule}` | edit / enable / disable (admin) |
| `DELETE /projects/{id}/automations/{rule}` | delete with history (admin) |
| `GET /projects/{id}/automations/{rule}/runs` | run history, newest first (any project role) |
| `GET /webhooks/?project_id=` | the project's webhooks (admin) |

## Verified

`backend/tests/test_automations.py` (database-free: validation, matching, event building, payload formats, loop guard, depth limit, savepoint isolation, never-raises, retry classification), the route/role matrix in `test_project_roles.py`, `frontend/src/lib/automations.test.ts`, and `backend/tests/live/smoke_automations.py` against Postgres.
