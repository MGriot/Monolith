# E-mail: password reset, verification, notifications, digests

Everything that sends mail goes through one queue. Requests only **insert a row** into `email_outbox`; a background worker delivers it over
authenticated STARTTLS (the bundled docker-mailserver, see [run-with-podman](run-with-podman.md)) with retries. A slow or stopped mail server therefore
never slows down or fails an API call, and nothing is lost while it is down.

## What is sent

| Mail | Trigger | Recipient rule |
|---|---|---|
| Password reset | `POST /api/v1/auth/forgot-password` (login page, "Forgot your password?") | active accounts; the answer is identical for unknown addresses |
| E-mail verification | `POST /api/v1/auth/request-email-verification` (Settings > Notifications) | the signed-in user; also required again after changing the address |
| Assignment | a user is assigned to a task | active users with *Assignments and deadline reminders* on |
| Deadline reminder | daily 07:00 UTC, tasks due within 48 h | assignees with that preference on |
| Weekly digest | Monday 08:00 UTC: personal summary, team and project reports | users / owners with *Weekly digest* on |

In-app notifications are unaffected by the e-mail preferences.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `EMAIL_ENABLED` | `true` | master switch: nothing is queued or sent when `false` |
| `EMAIL_RETRY_BASE_SECONDS` | `60` | delay after the first failure, doubled each time (cap 12 h) |
| `EMAIL_MAX_ATTEMPTS` | `6` | after this many failures the message is marked `failed` |
| `SCHEDULER_ENABLED` | `true` | weekly digest + daily reminders |
| `PASSWORD_RESET_MINUTES` / `EMAIL_VERIFY_HOURS` | `30` / `48` | link lifetimes |
| `APP_BASE_URL` | `http://localhost:8080` | origin used in links inside the mails |
| `SMTP_*`, `EMAILS_FROM_EMAIL` | see `.env.example` | transport |

## Security properties

* Reset and verification links carry a **single-purpose signed token**. A reset token stops working the moment the password changes (it embeds a fingerprint of the
  current hash), expires after 30 minutes, and cannot be used as a login token (`get_current_user` and the notification socket reject any token with a `purpose` claim).
* Verification links are bound to the address they were issued for; changing the address clears the verified flag.
* `forgot-password`, `reset-password` and `verify-email` are throttled (per client address and per mailbox); responses never reveal whether an account exists.
* HTML mail templates are auto-escaped (task titles, names, project names are user input); digests escape too.

## Operating it

```bash
# queue overview (superuser token); bodies, which contain links, only with include_body=true
curl -H "Authorization: Bearer $TOKEN" "$URL/api/v1/outbox/?status=failed"
curl -X POST -H "Authorization: Bearer $TOKEN" "$URL/api/v1/outbox/<id>/retry"      # requeue a failed message
```

* `pending` = waiting (first try or backoff), `sent` = accepted by the mail server, `failed` = gave up after `EMAIL_MAX_ATTEMPTS` (`last_error` says why).
* Several backend processes can run: the worker uses `SELECT ... FOR UPDATE SKIP LOCKED` (no double sends) and the scheduler claims each slot with one atomic `UPDATE`
  on `job_runs` (at-most-once per slot; a job that crashes after claiming is skipped until the next slot and logged).
* The first time a scheduled job is ever seen its current slot is recorded as done, so installing on a Wednesday does not fire Monday's digest.
* Templates live in `backend/app/templates/email/` (`<name>.txt.j2` defines `{% set subject = ... %}`, `<name>.html.j2` is the HTML part).

## Tests

* `backend/tests/test_email_flows.py` - tokens, flows, rate limits, templates, backoff, scheduler slots, preferences, app start/stop (no database).
* `backend/tests/live/smoke_mail.py` (run by `scripts/live-smoke.sh`) - real round trip against Postgres and the mail server: reset link delivered and usable once,
  verification, assignment mail and opt-out, 8 concurrent schedulers -> exactly one wins a slot, 3 concurrent workers deliver each message once.
