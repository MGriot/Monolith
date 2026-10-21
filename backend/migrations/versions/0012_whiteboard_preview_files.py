"""Whiteboards: move base64 previews out of the database into preview files

Rows that stored `data:image/png;base64,...` in preview_image get a file under UPLOAD_DIR/previews and keep its
URL instead; rows without a preview get an SVG rendered from their elements. Downgrade keeps the files' URLs
(the old frontend can show them too).

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-18
"""
import base64
import json
import logging
import os
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0012'
down_revision: Union[str, None] = '0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.0012")
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _preview_dir() -> str:
    from app.core.config import settings

    path = os.path.join(settings.UPLOAD_DIR, "previews")
    os.makedirs(path, exist_ok=True)
    return path


def _write(data: bytes, ext: str) -> str:
    name = f"{uuid.uuid4()}.{ext}"
    with open(os.path.join(_preview_dir(), name), "wb") as out:
        out.write(data)
    return f"/uploads/previews/{name}"


def upgrade() -> None:
    from app.core.excalidraw import render_svg

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, preview_image, data FROM whiteboards")).fetchall()
    for wb_id, preview, data in rows:
        url = None
        try:
            if preview and preview.startswith("data:image/png;base64,"):
                raw = base64.b64decode(preview.split(",", 1)[1])
                if raw.startswith(PNG_MAGIC):
                    url = _write(raw, "png")
            if url is None and (not preview or preview.startswith("data:")):
                scene = data if isinstance(data, dict) else json.loads(data or "{}")
                url = _write(render_svg(scene.get("elements")).encode("utf-8"), "svg")
        except Exception as exc:  # one bad row must not block the upgrade
            log.warning("whiteboard %s: preview not converted (%s)", wb_id, exc)
            continue
        if url:
            bind.execute(sa.text("UPDATE whiteboards SET preview_image = :url WHERE id = :id"), {"url": url, "id": wb_id})


def downgrade() -> None:
    pass
