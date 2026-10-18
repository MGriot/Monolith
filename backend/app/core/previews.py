"""Sketch preview images, stored as files under UPLOAD_DIR/previews and served from /uploads/previews/.

The browser editor sends a PNG data URL when it saves; scenes saved without one (MCP tools, imports) get an SVG
rendered server-side. Lists then carry a short URL instead of a base64 blob per sketch.
"""
import base64
import binascii
import os
import re
import uuid
from typing import Any, Dict, Optional

from fastapi import HTTPException

from app.core.config import settings
from app.core.excalidraw import render_svg

PREVIEW_SUBDIR = "previews"
URL_PREFIX = f"/uploads/{PREVIEW_SUBDIR}/"
MAX_PREVIEW_BYTES = 2 * 1024 * 1024
_NAME = re.compile(r"^[0-9a-f-]{36}\.(png|svg)$")
_DATA_URL = re.compile(r"^data:image/png;base64,(?P<b64>[A-Za-z0-9+/=\s]+)$")
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _dir() -> str:
    path = os.path.join(settings.UPLOAD_DIR, PREVIEW_SUBDIR)
    os.makedirs(path, exist_ok=True)
    return path


def is_preview_url(value: Optional[str]) -> bool:
    return bool(value and value.startswith(URL_PREFIX) and _NAME.match(value[len(URL_PREFIX):]))


def _write(data: bytes, ext: str) -> str:
    name = f"{uuid.uuid4()}.{ext}"
    with open(os.path.join(_dir(), name), "wb") as out:
        out.write(data)
    return URL_PREFIX + name


def decode_png_data_url(data_url: str) -> bytes:
    """The PNG bytes of a `data:image/png;base64,...` URL; 400 for anything else or anything too large."""
    match = _DATA_URL.match(data_url)
    if not match:
        raise HTTPException(status_code=400, detail="preview_image must be a PNG data URL")
    if len(match.group("b64")) > MAX_PREVIEW_BYTES * 4 // 3 + 16:
        raise HTTPException(status_code=413, detail="Preview image is too large (max 2 MB)")
    try:
        raw = base64.b64decode(match.group("b64"), validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="preview_image is not valid base64")
    if not raw.startswith(PNG_MAGIC):
        raise HTTPException(status_code=400, detail="preview_image is not a PNG")
    if len(raw) > MAX_PREVIEW_BYTES:
        raise HTTPException(status_code=413, detail="Preview image is too large (max 2 MB)")
    return raw


def store_png_data_url(data_url: str) -> str:
    return _write(decode_png_data_url(data_url), "png")


def store_scene_svg(data: Optional[Dict[str, Any]]) -> str:
    return _write(render_svg((data or {}).get("elements")).encode("utf-8"), "svg")


def delete_preview(url: Optional[str]) -> None:
    if not is_preview_url(url):
        return  # never touch anything outside the previews folder
    try:
        os.remove(os.path.join(_dir(), url[len(URL_PREFIX):]))
    except FileNotFoundError:
        pass


def preview_for(incoming: Optional[str], scene: Optional[Dict[str, Any]], old: Optional[str] = None) -> str:
    """The preview URL to store: an uploaded PNG, the unchanged existing file, or a freshly rendered SVG."""
    if incoming and incoming.startswith("data:"):
        url = store_png_data_url(incoming)
    elif incoming and is_preview_url(incoming):
        return incoming
    elif incoming:
        raise HTTPException(status_code=400, detail="preview_image must be a PNG data URL")
    else:
        url = store_scene_svg(scene)
    if old and old != url:
        delete_preview(old)
    return url
