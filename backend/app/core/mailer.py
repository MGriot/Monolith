"""E-mail queue: render templates, enqueue into `email_outbox`, deliver with retries.

Requests never talk to the mail server: they INSERT a row (inside their own transaction when one is passed).
`run_outbox_worker` delivers due rows with exponential backoff, so a slow or down mail server cannot slow down or
fail an API call, and nothing is lost when it is down for a while.
"""
import asyncio
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Optional, Tuple

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.email_outbox import EmailOutbox

logger = logging.getLogger(__name__)

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates", "email")

# HTML templates are autoescaped (user-controlled titles/names!); plain-text ones are not.
_env = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=lambda name: bool(name) and ".html" in name,
    undefined=StrictUndefined,
)


def absolute_url(path: str) -> str:
    return settings.APP_BASE_URL.rstrip("/") + "/" + path.lstrip("/")


def render_email(template: str, **context: Any) -> Tuple[str, str, str]:
    """-> (subject, text, html). The subject is defined inside the text template with {% set subject = ... %}."""
    ctx = {"app_name": "Monolith", "app_url": settings.APP_BASE_URL, **context}
    text_tpl = _env.get_template(f"{template}.txt.j2")
    module = text_tpl.make_module(ctx)
    subject = str(getattr(module, "subject")).strip().replace("\n", " ")[:200]
    html = _env.get_template(f"{template}.html.j2").render(**ctx)
    return subject, str(module).strip() + "\n", html


async def enqueue_raw(
    db: AsyncSession, *, to: str, subject: str, text: str, html: Optional[str] = None, kind: str = "generic"
) -> Optional[EmailOutbox]:
    """Add a message to the queue in the caller's session (the caller commits)."""
    if not settings.EMAIL_ENABLED:
        logger.info("E-mail disabled: not queueing %s to %s", kind, to)
        return None
    row = EmailOutbox(kind=kind, to_email=to, subject=subject, body_text=text, body_html=html)
    db.add(row)
    await db.flush()
    return row


async def enqueue_email(db: AsyncSession, *, to: str, kind: str, template: str, **context: Any) -> Optional[EmailOutbox]:
    subject, text, html = render_email(template, **context)
    return await enqueue_raw(db, to=to, subject=subject, text=text, html=html, kind=kind)


def retry_delay(attempts: int) -> timedelta:
    """Delay before the next try after `attempts` failures: base, 2x base, 4x base, ... (capped at 12 h)."""
    return timedelta(seconds=min(settings.EMAIL_RETRY_BASE_SECONDS * (2 ** max(attempts - 1, 0)), 12 * 3600))


async def deliver_due(batch: int = 20) -> int:
    """Send up to `batch` due messages. SKIP LOCKED lets several processes share the queue without double sends."""
    from app.core.notifications import email_service  # late import: notifications imports this module

    now = datetime.utcnow()
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(EmailOutbox)
                .where(EmailOutbox.status == "pending", EmailOutbox.next_attempt_at <= now)
                .order_by(EmailOutbox.next_attempt_at)
                .limit(batch)
                .with_for_update(skip_locked=True)
            )
        ).scalars().all()
        for row in rows:
            row.attempts += 1
            try:
                await asyncio.to_thread(email_service.send_email, row.to_email, row.subject, row.body_text, row.body_html)
                row.status, row.sent_at, row.last_error = "sent", datetime.utcnow(), None
            except Exception as exc:  # noqa: BLE001 - any failure means "try again later"
                row.last_error = f"{type(exc).__name__}: {exc}"[:500]
                if row.attempts >= settings.EMAIL_MAX_ATTEMPTS:
                    row.status = "failed"
                    logger.error("E-mail %s to %s failed permanently: %s", row.id, row.to_email, row.last_error)
                else:
                    row.next_attempt_at = datetime.utcnow() + retry_delay(row.attempts)
                    logger.warning("E-mail %s to %s failed (attempt %s), retrying: %s", row.id, row.to_email, row.attempts, row.last_error)
        await db.commit()
        return len(rows)


async def run_outbox_worker() -> None:
    logger.info("E-mail outbox worker started")
    while True:
        delivered = 0
        try:
            delivered = await deliver_due()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("Outbox worker iteration failed")
        await asyncio.sleep(0.5 if delivered else settings.EMAIL_POLL_SECONDS)
