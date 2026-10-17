# Time tracking and custom fields (API)

All routes need a bearer token and go through `app/api/access.py`; non-members get 403.

## Time tracking (`/api/v1/time`)

| Route | Notes |
|---|---|
| `GET /running` | The caller's running timer or `null`. |
| `POST /tasks/{id}/start` | Body `{note?}`. 409 if the caller already has a running timer (also enforced by a partial unique index). |
| `POST /stop` | Stops the caller's timer (404 if none). |
| `POST /tasks/{id}/entries` | Manual entry `{started_at, ended_at, note?}`; not in the future. |
| `PUT/DELETE /entries/{id}` | Author or superuser only. |
| `GET /tasks/{id}` | Entries, total, and estimate-vs-actual. The estimate is the task's PERT expected duration (falling back to `duration_days`) at 8 working hours/day. |
| `GET /timesheet?project_id&user_id&date_from&date_to` | Seconds per user and project (by entry start date, both dates inclusive). With `project_id`, members see everyone; without it you see only your own time (superusers: anyone). |

Any user who can read a task may log their own time on it. Timestamps are naive UTC, like the rest of the schema.

## Custom fields

`GET/POST /projects/{id}/custom-fields`, `PUT/DELETE /projects/{id}/custom-fields/{field_id}` (project members).
Types: `text`, `number`, `select` (needs `options`), `date`, `user`. Names are unique per project.

Values live in `tasks.custom_values` (JSONB, GIN-indexed), keyed by field id, and are validated on task create/update (400 on any invalid value, unknown field or non-project task). `null` clears a value; omitting `custom_values` on update leaves them untouched. Deleting a field strips its values from the project's tasks; removing a select option clears tasks still using it.
