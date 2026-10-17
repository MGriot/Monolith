"""SSRF guard for server-side requests to user-supplied URLs (webhooks)."""
import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit

from app.core.config import settings


class UnsafeURLError(ValueError):
    pass


def _is_public(ip: ipaddress._BaseAddress) -> bool:
    # IPv4-mapped IPv6 (::ffff:10.0.0.1) must be judged by the embedded v4 address
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    return not (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast
        or ip.is_reserved or ip.is_unspecified
    )


async def assert_safe_url(url: str) -> None:
    """Raise UnsafeURLError unless `url` is http(s) and every address it resolves to is public.

    Set WEBHOOK_ALLOW_PRIVATE=true to allow internal targets (e.g. a self-hosted chat server).
    """
    parts = urlsplit(url or "")
    if parts.scheme not in ("http", "https"):
        raise UnsafeURLError("Webhook URL must start with http:// or https://")
    if not parts.hostname:
        raise UnsafeURLError("Webhook URL has no host")
    if parts.username or parts.password:
        raise UnsafeURLError("Credentials in the URL are not allowed")
    if settings.WEBHOOK_ALLOW_PRIVATE:
        return

    port = parts.port or (443 if parts.scheme == "https" else 80)
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            parts.hostname, port, type=socket.SOCK_STREAM
        )
    except socket.gaierror:
        raise UnsafeURLError("Webhook host could not be resolved")
    if not infos:
        raise UnsafeURLError("Webhook host could not be resolved")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if not _is_public(ip):
            raise UnsafeURLError("Webhook URL points to a private or internal address")
