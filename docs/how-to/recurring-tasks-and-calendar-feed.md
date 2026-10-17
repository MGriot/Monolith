# Recurring tasks and the calendar feed

## Recurring tasks

Open a task, set **Repeat** (daily, weekly, monthly, yearly, with interval, weekdays, day of month or "last Friday",
and an optional end date). When the task is marked **Done**, Monolith creates the next copy:

- Dates move by the distance between the old and the next occurrence (start, due and deadline keep their spacing).
- The copy starts as To Do, with the checklist reset. Assignees, topics, types, tags, estimates and custom values carry over. Subtasks are not copied.
- Finishing late never produces overdue copies: the next occurrence is always after both the task's date and the completion time.
- Past the end date the series stops quietly. Clearing the rule on the open copy ends the series.
- Re-saving a task that is already Done does not create another copy.

The rule is stored as an RFC 5545 subset in `tasks.recurrence_rule`: `FREQ` (required), `INTERVAL` (1-365), `BYDAY`,
`BYMONTHDAY` (monthly, 1-31 or -1) and `UNTIL`. Anything else (`COUNT`, `BYSETPOS`, ...) is rejected with a 422.
As in the RFC, "monthly on day 31" skips months without a 31st; use "last day" to always hit month end.

```
FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE
FREQ=MONTHLY;BYMONTHDAY=-1
FREQ=MONTHLY;BYDAY=1MO;UNTIL=20271231
```

## Calendar feed

**Settings -> Calendar feed -> Create calendar link** gives a private URL to subscribe to from Google Calendar,
Outlook or Apple Calendar ("add calendar from URL"). It lists tasks assigned to you (plus your own tasks outside projects)
that have a start or due date, as all-day events with a link back to the task. Completed tasks are hidden; add
`?include_done=true` to the URL to show them. Calendar apps refresh it on their own schedule (often hourly or slower).

The URL is the credential (256-bit random token), because calendar apps cannot send a login header:

- **New link** replaces the token; the old link returns 404 at once. **Revoke** removes it.
- Deactivated users' links stop working. Wrong tokens are throttled per client (30 per hour, then 429).
- Responses are `Cache-Control: private` and `X-Robots-Tag: noindex`. The token is never returned by `/users/me`.
- Behind a reverse proxy, the URL uses `APP_BASE_URL`; set it to the address your calendar app can reach.

API: `GET/POST/DELETE /api/v1/users/me/calendar-feed`, `GET /api/v1/calendar/feed/{token}.ics`. Migration `0007`.
