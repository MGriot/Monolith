"""Live e-mail checks (run inside the backend container, against the proxy and the real mail server).

Needs a fresh database (creates users). Delivery is proven through the outbox: a row only becomes `sent` after the mail
server accepted the message over authenticated STARTTLS.
"""
import asyncio
import os
import re
import secrets
import sys
import time
from datetime import datetime, timedelta

import httpx

BASE = os.environ.get("BASE", "http://proxy")
ADMIN_EMAIL, ADMIN_PW = os.environ["FIRST_SUPERUSER_EMAIL"], os.environ["FIRST_SUPERUSER_PASSWORD"]
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  -> {detail}" if (detail and not cond) else ""), flush=True)


c = httpx.Client(base_url=BASE, timeout=30)
H = lambda t: {"Authorization": f"Bearer {t}"}  # noqa: E731


def login(email, pw):
    r = c.post("/api/v1/login/access-token", data={"username": email, "password": pw})
    return r.json().get("access_token") if r.status_code == 200 else None


def outbox(admin, **params):
    r = c.get("/api/v1/outbox/", headers=H(admin), params={"include_body": "true", "limit": 50, **params})
    return r.json() if r.status_code == 200 else []


def wait_sent(admin, timeout=60, **params):
    """Poll until the newest matching message is `sent` (or give up). Returns the item or None."""
    deadline = time.time() + timeout
    item = None
    while time.time() < deadline:
        items = outbox(admin, **params)
        if items:
            item = items[0]
            if item["status"] == "sent":
                return item
        time.sleep(1)
    return item


admin = login(ADMIN_EMAIL, ADMIN_PW)
check("admin signs in", admin)

pw = "Start-" + secrets.token_hex(6)
r = c.post("/api/v1/users/", headers=H(admin), json={"email": "mailuser@example.com", "password": pw, "full_name": "Mail <User>"})
check("admin creates the test user", r.status_code == 200, r.text[:150])
uid = r.json()["id"]
user = login("mailuser@example.com", pw)

# ---- non-admins cannot see the queue
check("outbox is admin only", c.get("/api/v1/outbox/", headers=H(user)).status_code == 403)
check("outbox needs a login", c.get("/api/v1/outbox/").status_code == 401)

# ---- forgot password: same answer for known and unknown addresses
known = c.post("/api/v1/auth/forgot-password", json={"email": "mailuser@example.com"})
unknown = c.post("/api/v1/auth/forgot-password", json={"email": "nobody-here@example.com"})
check("forgot-password answers 200 for a known address", known.status_code == 200, known.text)
check("... and with the identical body for an unknown one", unknown.status_code == 200 and unknown.json() == known.json(), unknown.text)
check("no mail was queued for the unknown address", outbox(admin, to_email="nobody-here@example.com") == [])

item = wait_sent(admin, kind="password_reset", to_email="mailuser@example.com")
check("reset mail is delivered by the worker (status sent)", item and item["status"] == "sent", item)
body = (item or {}).get("body_text") or ""
m = re.search(r"token=([A-Za-z0-9_\-\.]+)", body)
check("the mail contains a reset link", bool(m), body[:200])
check("greeting keeps the raw name in the plain-text part", "Mail <User>" in body)
token = m.group(1) if m else ""

# ---- a reset token is not a login token
r = c.get("/api/v1/users/me", headers=H(token))
check("reset token is refused as a bearer token", r.status_code == 401, r.status_code)
ws_probe = c.post("/api/v1/auth/verify-email", json={"token": token})
check("reset token is refused by the verification endpoint", ws_probe.status_code == 400, ws_probe.status_code)

# ---- reset
r = c.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "short"})
check("weak new password is refused", r.status_code == 422, r.status_code)
new_pw = "Reset-" + secrets.token_hex(6)
r = c.post("/api/v1/auth/reset-password", json={"token": token, "new_password": new_pw})
check("reset with the emailed token works", r.status_code == 200, r.text)
check("old password no longer works", login("mailuser@example.com", pw) is None)
user = login("mailuser@example.com", new_pw)
check("new password works", user)
r = c.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Another-" + secrets.token_hex(4)})
check("the same link cannot be used twice", r.status_code == 400, r.status_code)
me = c.get("/api/v1/users/me", headers=H(user)).json()
check("resetting through the mailbox marks the address verified", me.get("email_verified_at"), me)

# ---- verification flow after an address change
r = c.put("/api/v1/users/me", headers=H(user), json={"email": "mailuser2@example.com", "current_password": new_pw})
check("changing the address works", r.status_code == 200 and r.json()["email_verified_at"] is None, r.text[:200])
r = c.post("/api/v1/auth/request-email-verification", headers=H(user))
check("verification mail requested", r.status_code == 200, r.text)
item = wait_sent(admin, kind="email_verification", to_email="mailuser2@example.com")
check("verification mail is delivered", item and item["status"] == "sent", item)
m = re.search(r"token=([A-Za-z0-9_\-\.]+)", (item or {}).get("body_text") or "")
check("verification mail contains a link", bool(m))
r = c.post("/api/v1/auth/verify-email", json={"token": m.group(1) if m else "x"})
check("verification link works", r.status_code == 200, r.text)
check("profile shows the address as verified", c.get("/api/v1/users/me", headers=H(user)).json()["email_verified_at"])

# ---- assignment mail and the opt-out
pid = c.post("/api/v1/projects/", headers=H(admin), json={"name": "Mail <project>"}).json()["id"]
r = c.post("/api/v1/tasks/", headers=H(admin), json={"title": "Review <b>this</b>", "project_id": pid, "assignee_ids": [uid]})
check("assigning a task works", r.status_code == 200, r.text[:150])
item = wait_sent(admin, kind="assignment", to_email="mailuser2@example.com")
check("assignment mail is delivered", item and item["status"] == "sent", item)
check("assignment mail names the task and links to it", item and "Review <b>this</b>" in item["body_text"] and f"/projects/{pid}" in item["body_text"], (item or {}).get("body_text"))
before = len(outbox(admin, kind="assignment", to_email="mailuser2@example.com"))
r = c.put("/api/v1/users/me", headers=H(user), json={"notify_email_assignments": False})
check("user opts out of assignment mails", r.status_code == 200 and r.json()["notify_email_assignments"] is False, r.text[:150])
c.post("/api/v1/tasks/", headers=H(admin), json={"title": "Second", "project_id": pid, "assignee_ids": [uid]})
time.sleep(3)
after = len(outbox(admin, kind="assignment", to_email="mailuser2@example.com"))
check("no assignment mail after opting out", after == before, (before, after))
n = c.get("/api/v1/notifications/", headers=H(user)).json()
check("in-app notifications continue after opting out of e-mail", len([x for x in n if x["type"] == "assignment"]) >= 2, n)

# ---- failed items can be retried by an admin
r = c.post(f"/api/v1/outbox/{item['id']}/retry", headers=H(admin))
check("a sent message cannot be requeued", r.status_code == 400, r.status_code)
check("retry of unknown id is 404", c.post("/api/v1/outbox/00000000-0000-0000-0000-000000000000/retry", headers=H(admin)).status_code == 404)

# ---- scheduler: atomic slot claiming against the real database
from app.core.scheduler import claim_slot  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402


async def claim(name, slot):
    async with AsyncSessionLocal() as db:
        return await claim_slot(db, name, slot)


async def scheduler_checks():
    name = "smoke-" + secrets.token_hex(3)
    slot1 = datetime(2030, 1, 7, 8)
    first = await claim(name, slot1)
    check("first sighting of a job does not fire it (no digest at install time)", first is False, first)
    slot2 = slot1 + timedelta(days=7)
    racers = await asyncio.gather(*[claim(name, slot2) for _ in range(8)])
    check("8 concurrent workers: exactly one wins the slot", racers.count(True) == 1, racers)
    check("the slot cannot be claimed again", await claim(name, slot2) is False)
    check("the next slot can", await claim(name, slot2 + timedelta(days=7)) is True)
    check("an older slot never re-fires", await claim(name, slot1) is False)



# ---- queue concurrency: two workers share the queue without double delivery
from sqlalchemy import select  # noqa: E402
from app.core import mailer  # noqa: E402
from app.models.email_outbox import EmailOutbox  # noqa: E402


async def queue_checks():
    sent = []
    from app.core import notifications

    orig = notifications.email_service.send_email
    notifications.email_service.send_email = lambda to, *a, **k: sent.append(to)
    try:
        async with AsyncSessionLocal() as db:
            for i in range(10):
                await mailer.enqueue_raw(db, to=f"bulk{i}@example.com", subject="bulk", text="x", kind="smoke-bulk")
            await db.commit()
        counts = await asyncio.gather(*[mailer.deliver_due(batch=10) for _ in range(3)])
        check("3 concurrent workers deliver each message exactly once", len(sent) == 10 and len(set(sent)) == 10, (sent, counts))
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(select(EmailOutbox).where(EmailOutbox.kind == "smoke-bulk"))).scalars().all()
            check("all of them are marked sent", all(r.status == "sent" and r.attempts == 1 for r in rows))
    finally:
        notifications.email_service.send_email = orig




async def main():
    # one event loop for both: the engine's pooled connections belong to the loop that created them
    await scheduler_checks()
    await queue_checks()


asyncio.run(main())

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
