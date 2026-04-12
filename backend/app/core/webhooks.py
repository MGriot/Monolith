import logging
import httpx
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class WebhookService:
    async def _send_post(self, url: str, payload: Dict[str, Any]) -> bool:
        """Helper to send an async POST request."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                return True
        except Exception as e:
            logger.error(f"Failed to send webhook to {url}: {e}")
            return False

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
