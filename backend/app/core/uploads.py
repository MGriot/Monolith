"""Safe upload handling shared by every upload endpoint."""
import os
import uuid
from typing import Tuple

from fastapi import HTTPException, UploadFile
from starlette.staticfiles import StaticFiles

from app.core.config import settings

CHUNK_SIZE = 1024 * 1024

# Extensions that can execute in a browser (or on a server) if ever served inline.
BLOCKED_EXTENSIONS = {
    ".html", ".htm", ".xhtml", ".xht", ".shtml", ".js", ".mjs", ".jsx", ".xml", ".xsl", ".xslt",
    ".php", ".phtml", ".py", ".pl", ".cgi", ".sh", ".bat", ".cmd", ".ps1", ".exe", ".msi", ".dll",
    ".jar", ".com", ".scr", ".vbs", ".wasm", ".swf", ".svgz",
}

# Served as a download (never rendered in the app origin) even when someone opens the URL directly.
FORCE_DOWNLOAD_EXTENSIONS = {".svg"}


def safe_extension(filename: str | None) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    # keep only a conservative charset (no path tricks / odd unicode)
    if ext and not all(c.isalnum() or c == "." for c in ext):
        raise HTTPException(status_code=400, detail="Invalid file extension")
    if ext in BLOCKED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Files of type '{ext}' are not allowed")
    return ext


async def save_upload(file: UploadFile) -> Tuple[str, str, int]:
    """Stream an upload to UPLOAD_DIR under a random name.

    Returns (stored_filename, extension, size_bytes). Enforces MAX_UPLOAD_MB and the extension block-list,
    and removes the partial file on failure.
    """
    ext = safe_extension(file.filename)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    stored = f"{uuid.uuid4()}{ext}"
    path = os.path.join(settings.UPLOAD_DIR, stored)
    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    size = 0
    try:
        with open(path, "wb") as out:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                size += len(chunk)
                if size > limit:
                    raise HTTPException(
                        status_code=413, detail=f"File too large (max {settings.MAX_UPLOAD_MB} MB)"
                    )
                out.write(chunk)
    except BaseException:
        if os.path.exists(path):
            os.remove(path)
        raise
    return stored, ext, size


class SafeStaticFiles(StaticFiles):
    """StaticFiles with response headers that stop uploaded content from running as the app origin."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["X-Content-Type-Options"] = "nosniff"
        ext = os.path.splitext(path)[1].lower()
        if ext in FORCE_DOWNLOAD_EXTENSIONS:
            response.headers["Content-Disposition"] = "attachment"
            response.headers["Content-Security-Policy"] = "sandbox; default-src 'none'"
        return response
