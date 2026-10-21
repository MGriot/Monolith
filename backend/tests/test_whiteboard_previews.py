"""Sketch previews: PNG data-URL validation, preview files, server-rendered SVG (no database).

Run:  pytest backend/tests/test_whiteboard_previews.py
"""
import base64
import os

import pytest
from fastapi import HTTPException

from app.core import previews
from app.core.config import settings
from app.core.excalidraw import normalize_elements, render_svg

PNG = previews.PNG_MAGIC + b"\x00" * 64


def data_url(raw: bytes, mime="image/png") -> str:
    return f"data:{mime};base64," + base64.b64encode(raw).decode()


@pytest.fixture(autouse=True)
def upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    return tmp_path


def stored_path(upload_dir, url):
    return os.path.join(upload_dir, "previews", url.rsplit("/", 1)[1])


class TestDataUrls:
    def test_accepts_png(self):
        assert previews.decode_png_data_url(data_url(PNG)) == PNG

    @pytest.mark.parametrize("bad", [
        data_url(b"GIF89a....", "image/png"),          # wrong magic
        data_url(PNG, "image/svg+xml"),                # not PNG
        "data:image/png;base64,***",                   # not base64
        "https://evil.example/x.png",
    ])
    def test_rejects_everything_else(self, bad):
        with pytest.raises(HTTPException) as e:
            previews.decode_png_data_url(bad)
        assert e.value.status_code == 400

    def test_rejects_large_images(self, monkeypatch):
        monkeypatch.setattr(previews, "MAX_PREVIEW_BYTES", 32)
        with pytest.raises(HTTPException) as e:
            previews.decode_png_data_url(data_url(PNG))
        assert e.value.status_code == 413


class TestPreviewFor:
    def test_png_is_written_and_the_old_file_removed(self, upload_dir):
        first = previews.preview_for(data_url(PNG), None)
        assert previews.is_preview_url(first) and first.endswith(".png")
        assert open(stored_path(upload_dir, first), "rb").read() == PNG
        second = previews.preview_for(data_url(PNG), None, old=first)
        assert second != first
        assert not os.path.exists(stored_path(upload_dir, first))

    def test_existing_preview_url_is_kept(self):
        url = previews.preview_for(data_url(PNG), None)
        assert previews.preview_for(url, {"elements": []}, old=url) == url

    def test_foreign_urls_are_refused(self):
        with pytest.raises(HTTPException):
            previews.preview_for("/uploads/../../etc/passwd", None)

    def test_scenes_without_a_preview_get_an_svg(self, upload_dir):
        url = previews.preview_for(None, {"elements": normalize_elements([{"type": "rectangle", "label": "API"}])})
        assert url.endswith(".svg")
        svg = open(stored_path(upload_dir, url), encoding="utf-8").read()
        assert svg.startswith("<svg") and "API" in svg

    def test_delete_never_leaves_the_previews_folder(self, upload_dir):
        outside = upload_dir / "keep.txt"
        outside.write_text("x")
        previews.delete_preview("/uploads/keep.txt")
        previews.delete_preview("/uploads/previews/../keep.txt")
        assert outside.exists()


class TestScenes:
    def test_normalize_fills_bookkeeping_and_binds_labels(self):
        out = normalize_elements([{"type": "rectangle", "id": "box", "x": 10, "y": 10, "label": "Hello"},
                                  {"type": "arrow", "x": 0, "y": 0, "points": [[0, 0], [100, 50]]}])
        box, text, arrow = out
        assert box["version"] == 1 and box["seed"] and box["roundness"] == {"type": 3}
        assert box["boundElements"] == [{"type": "text", "id": text["id"]}]
        assert text["containerId"] == "box" and text["text"] == "Hello"
        assert arrow["width"] == 100 and arrow["height"] == 50 and arrow["endArrowhead"] == "arrow"

    def test_normalize_rejects_unknown_types(self):
        with pytest.raises(ValueError):
            normalize_elements([{"type": "script"}])

    def test_render_escapes_text_and_colours(self):
        svg = render_svg(normalize_elements([
            {"type": "text", "text": "<script>alert(1)</script>"},
            {"type": "rectangle", "strokeColor": "red\" onload=\"x", "backgroundColor": "#a5d8ff"},
        ]))
        assert "<script>" not in svg and "&lt;script&gt;" in svg
        assert "onload" not in svg and "#a5d8ff" in svg

    def test_deleted_elements_are_not_drawn_and_empty_scenes_render(self):
        assert "rect x" not in render_svg([{"type": "rectangle", "isDeleted": True, "x": 0, "y": 0, "width": 5, "height": 5}])
        assert render_svg([]).startswith("<svg")
