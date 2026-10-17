"""Outgoing webhooks: the HTTP sender (SSRF-guarded), the per-provider payload formats, and the delivery queue.

Requests never POST to a webhook themselves: the engine INSERTs a `webhook_deliveries` row inside its transaction
(so nothing is sent if the change rolls back) and `run_webhook_worker` delivers it after the commit, with a timeout
and retries/backoff - a slow or dead endpoint can neither slow down nor fail an API call.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.netguard import UnsafeURLError, assert_safe_url

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
POLL_SECONDS = 2.0
RETRY_BASE_SECONDS = 30

EVENT_LABELS = {
    "task.created": "Task created",
    "task.status_changed": "Status changed",
    "task.assigned": "Task assigned",
    "task.completed": "Task completed",
    "task.due_soon": "Task due soon",
    "automation": "Automation",
}


def format_event_payload(provider: str, event: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
    """The JSON body for one provider. `ctx`: task{id,title,status,priority,assignees}, project{id,name}, url,
    changes{field:[old,new]}, message (optional free text, used by the automation action)."""
    task, project = ctx.get("task", {}), ctx.get("project", {})
    label = EVENT_LABELS.get(event, event)
    title = task.get("title", "")
    bits = [f"{label}: {title}"]
    if project.get("name"):
        bits.append(f"in {project['name']}")
    status_change = ctx.get("changes", {}).get("status")
    if status_change:
        bits.append(f"({status_change[0]} → {status_change[1]})")
    elif task.get("status"):
        bits.append(f"[{task['status']}]")
    if ctx.get("message"):
        bits.append(f"- {ctx['message']}")
    line = " ".join(bits)
    url = ctx.get("url")

    if provider == "slack":
        text = f"{line}\n<{url}|Open task>" if url else line
        return {"text": text}
    if provider == "discord":
        return {"content": f"{line}\n{url}" if url else line}
    return {
        "event": event,
        "message": ctx.get("message"),
        "task": task,
        "project": project,
        "changes": ctx.get("changes", {}),
        "url": url,
        "timestamp": ctx.get("timestamp") or datetime.utcnow().isoformat() + "Z",
    }


class WebhookService:
    async def deliver(self, url: str, payload: Dict[str, Any]) -> Tuple[bool, Optional[str], bool]:
        """POST once. -> (ok, error, permanent): `permanent` errors (blocked URL, 4xx) are not worth retrying."""
        try:
            # Re-check at send time (the stored URL may have been valid when saved), never follow redirects.
            await assert_safe_url(url)
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                return True, None, False
        except UnsafeURLError as e:
            logger.warning(f"Blocked webhook to {url}: {e}")
            return False, f"blocked: {e}", True
        except httpx.HTTPStatusError as e:
            code = e.response.status_code
            logger.error(f"Webhook {url} answered {code}")
            return False, f"HTTP {code}", 400 <= code < 500 and code not in (408, 425, 429)
        except Exception as e:
            logger.error(f"Failed to send webhook to {url}: {e}")
            return False, f"{type(e).__name__}: {e}"[:300], False

    async def _send_post(self, url: str, payload: Dict[str, Any]) -> bool:
        ok, _, _ = await self.deliver(url, payload)
        return ok

    async def send_slack_notification(self, webhook_url: str, text: str, blocks: Optional[list] = None) -> bool:
        """Send a notification to a Slack webhook."""
        payload = {"text": text}
        if blocks:
            payload["blocks"] = blocks
        return await self._send_post(webhook_url, payload)

    async def send_discord_notification(self, webhook_url: str, content: str, embeds: Optional[list] = None) -> bool:
        """Send a notification to a Discord webhook."""
        payload = {"content": content}
        if embeds:
            payload["embeds"] = embeds
        return await self._send_post(webhook_url, payload)

    async def send_generic_notification(self, webhook_url: str, payload: Dict[str, Any]) -> bool:
        """Send a generic JSON payload to any webhook URL."""
        return await self._send_post(webhook_url, payload)


webhook_service = WebhookService()


def retry_delay(attempts: int) -> timedelta:
    return timedelta(seconds=min(RETRY_BASE_SECONDS * (2 ** max(attempts - 1, 0)), 3600))


async def enqueue_delivery(
    db: AsyncSession, *, webhook: Any, event: str, payload: Dict[str, Any]
) -> Any:
    """Queue a delivery in the caller's session (the caller's transaction commits it)."""
    from app.models.automation import WebhookDelivery

    row = WebhookDelivery(webhook_id=webhook.id, url=webhook.url, provider=webhook.provider or "generic", event=event, payload=payload)
    db.add(row)
    await db.flush()
    return row


async def deliver_due(batch: int = 20, now: Optional[datetime] = None) -> int:
    """Send up to `batch` due deliveries. SKIP LOCKED lets several processes share the queue without double sends."""
    from app.db.session import AsyncSessionLocal
    from app.models.automation import WebhookDelivery

    now = now or datetime.utcnow()
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(WebhookDelivery)
                .where(WebhookDelivery.status == "pending", WebhookDelivery.next_attempt_at <= now)
                .order_by(WebhookDelivery.next_attempt_at)
                .limit(batch)
                .with_for_update(skip_locked=True)
            )
        ).scalars().all()
        for row in rows:
            row.attempts += 1
            ok, error, permanent = await webhook_service.deliver(row.url, row.payload)
            if ok:
                row.status, row.delivered_at, row.last_error = "sent", datetime.utcnow(), None
            else:
                row.last_error = (error or "")[:500]
                if permanent or row.attempts >= MAX_ATTEMPTS:
                    row.status = "failed"
                else:
                    row.next_attempt_at = datetime.utcnow() + retry_delay(row.attempts)
        await db.commit()
        return len(rows)


async def run_webhook_worker() -> None:
    logger.info("Webhook delivery worker started")
    while True:
        delivered = 0
        try:
            delivered = await deliver_due()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("Webhook worker iteration failed")
        await asyncio.sleep(0.5 if delivered else POLL_SECONDS)
