"""Excalidraw scene helpers: complete hand-written elements, and render a scene to a static SVG preview.

The browser editor exports its own PNG preview on save. Scenes written without a browser (MCP tools, imports)
get an SVG rendered here instead, so every sketch has a thumbnail in the File Hub and task attachments.
The renderer covers the shapes people actually draw: rectangle, ellipse, diamond, line, arrow, freedraw, text,
frames and images (as placeholders). Text is escaped; nothing from the scene is emitted as markup.
"""
import math
import random
import time
import uuid
from typing import Any, Dict, Iterable, List, Optional, Tuple
from xml.sax.saxutils import escape

SHAPES = {"rectangle", "ellipse", "diamond", "line", "arrow", "freedraw", "text", "frame", "image", "embeddable"}

_BASE: Dict[str, Any] = {
    "angle": 0,
    "strokeColor": "#1e1e1e",
    "backgroundColor": "transparent",
    "fillStyle": "solid",
    "strokeWidth": 2,
    "strokeStyle": "solid",
    "roughness": 1,
    "opacity": 100,
    "groupIds": [],
    "frameId": None,
    "roundness": None,
    "boundElements": None,
    "link": None,
    "locked": False,
    "isDeleted": False,
}

FONT_SIZE = 20
LINE_HEIGHT = 1.25


def _nonce() -> int:
    return random.randint(1, 2**31 - 1)


def _text_size(text: str, font_size: float) -> Tuple[float, float]:
    lines = text.split("\n") or [""]
    width = max(len(line) for line in lines) * font_size * 0.55
    return max(width, font_size), len(lines) * font_size * LINE_HEIGHT


def normalize_elements(elements: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Fill in the bookkeeping fields Excalidraw expects; expand `label` on shapes into bound text elements."""
    out: List[Dict[str, Any]] = []
    now = int(time.time() * 1000)
    for raw in elements:
        if not isinstance(raw, dict) or raw.get("type") not in SHAPES:
            raise ValueError(f"Unsupported element: {raw!r:.80}")
        el = {**_BASE, **{k: v for k, v in raw.items() if k != "label"}}
        el.setdefault("id", uuid.uuid4().hex[:20])
        el.setdefault("x", 0)
        el.setdefault("y", 0)
        el.setdefault("version", 1)
        el.setdefault("versionNonce", _nonce())
        el.setdefault("seed", _nonce())
        el.setdefault("updated", now)
        kind = el["type"]
        if kind == "rectangle" and "roundness" not in raw:
            el["roundness"] = {"type": 3}
        if kind in ("line", "arrow", "freedraw"):
            points = el.get("points") or [[0, 0], [el.get("width", 100), el.get("height", 0)]]
            el["points"] = [[float(p[0]), float(p[1])] for p in points]
            xs, ys = [p[0] for p in el["points"]], [p[1] for p in el["points"]]
            el.setdefault("width", max(xs) - min(xs))
            el.setdefault("height", max(ys) - min(ys))
            el.setdefault("lastCommittedPoint", None)
            if kind != "freedraw":
                el.setdefault("startBinding", None)
                el.setdefault("endBinding", None)
                el.setdefault("startArrowhead", None)
                el.setdefault("endArrowhead", "arrow" if kind == "arrow" else None)
            else:
                el.setdefault("pressures", [])
                el.setdefault("simulatePressure", True)
        if kind == "text":
            text = str(el.get("text", ""))
            el["text"] = text
            el.setdefault("originalText", text)
            el.setdefault("fontSize", FONT_SIZE)
            el.setdefault("fontFamily", 5)
            el.setdefault("textAlign", "left")
            el.setdefault("verticalAlign", "top")
            el.setdefault("containerId", None)
            el.setdefault("autoResize", True)
            el.setdefault("lineHeight", LINE_HEIGHT)
            w, h = _text_size(text, el["fontSize"])
            el.setdefault("width", w)
            el.setdefault("height", h)
        el.setdefault("width", 160)
        el.setdefault("height", 80)
        out.append(el)

        label = raw.get("label")
        if label and kind in ("rectangle", "ellipse", "diamond"):
            text_id = uuid.uuid4().hex[:20]
            size = raw.get("labelFontSize", FONT_SIZE)
            w, h = _text_size(str(label), size)
            el["boundElements"] = (el.get("boundElements") or []) + [{"type": "text", "id": text_id}]
            out.append({
                **_BASE, "id": text_id, "type": "text", "version": 1, "versionNonce": _nonce(), "seed": _nonce(),
                "updated": now, "text": str(label), "originalText": str(label), "fontSize": size, "fontFamily": 5,
                "textAlign": "center", "verticalAlign": "middle", "containerId": el["id"], "autoResize": True,
                "lineHeight": LINE_HEIGHT, "strokeColor": raw.get("labelColor", el["strokeColor"]),
                "x": el["x"] + (el["width"] - w) / 2, "y": el["y"] + (el["height"] - h) / 2, "width": w, "height": h,
            })
    return out


# --- SVG rendering -----------------------------------------------------------------------------------------------

def _visible(elements: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [e for e in elements if isinstance(e, dict) and not e.get("isDeleted") and e.get("type") in SHAPES]


def _bounds(elements: List[Dict[str, Any]]) -> Tuple[float, float, float, float]:
    xs: List[float] = []
    ys: List[float] = []
    for e in elements:
        x, y = float(e.get("x", 0)), float(e.get("y", 0))
        if e.get("points"):
            for px, py in e["points"]:
                xs.append(x + px)
                ys.append(y + py)
        else:
            xs += [x, x + float(e.get("width", 0))]
            ys += [y, y + float(e.get("height", 0))]
    return min(xs), min(ys), max(xs), max(ys)


def _color(value: Any, fallback: str) -> str:
    v = str(value or "")
    if v == "transparent":
        return "none"
    # only plain colour tokens reach the SVG
    if v.startswith("#") and all(c in "0123456789abcdefABCDEF" for c in v[1:]) and len(v) in (4, 7, 9):
        return v
    if v.isalpha() and len(v) < 20:
        return v
    return fallback


def _num(value: Any, default: float = 0.0) -> float:
    try:
        n = float(value)
        return n if math.isfinite(n) else default
    except (TypeError, ValueError):
        return default


def _style(e: Dict[str, Any], fill: bool = True) -> str:
    stroke = _color(e.get("strokeColor"), "#1e1e1e")
    bg = _color(e.get("backgroundColor"), "none") if fill else "none"
    width = _num(e.get("strokeWidth"), 2)
    dash = {"dashed": ' stroke-dasharray="8 6"', "dotted": ' stroke-dasharray="2 5"'}.get(e.get("strokeStyle"), "")
    opacity = max(0.0, min(1.0, _num(e.get("opacity"), 100) / 100))
    return (f'stroke="{stroke}" stroke-width="{width:g}" fill="{bg}" opacity="{opacity:g}"{dash} '
            'stroke-linejoin="round" stroke-linecap="round"')


def _rotate(e: Dict[str, Any], cx: float, cy: float) -> str:
    angle = _num(e.get("angle"))
    return f' transform="rotate({math.degrees(angle):g} {cx:g} {cy:g})"' if angle else ""


def _element_svg(e: Dict[str, Any]) -> str:
    kind = e["type"]
    x, y = _num(e.get("x")), _num(e.get("y"))
    w, h = _num(e.get("width")), _num(e.get("height"))
    rot = _rotate(e, x + w / 2, y + h / 2)
    if kind in ("rectangle", "frame", "image", "embeddable"):
        radius = min(w, h) * 0.12 if e.get("roundness") else 0
        style = _style(e) if kind == "rectangle" else 'stroke="#868e96" stroke-width="1" fill="#f1f3f5"'
        return f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" rx="{radius:g}" {style}{rot}/>'
    if kind == "ellipse":
        return f'<ellipse cx="{x + w / 2:g}" cy="{y + h / 2:g}" rx="{w / 2:g}" ry="{h / 2:g}" {_style(e)}{rot}/>'
    if kind == "diamond":
        pts = f"{x + w / 2:g},{y:g} {x + w:g},{y + h / 2:g} {x + w / 2:g},{y + h:g} {x:g},{y + h / 2:g}"
        return f'<polygon points="{pts}" {_style(e)}{rot}/>'
    if kind in ("line", "arrow", "freedraw"):
        pts = [(x + _num(p[0]), y + _num(p[1])) for p in e.get("points") or []]
        if len(pts) < 2:
            return ""
        path = " ".join(f"{px:g},{py:g}" for px, py in pts)
        closed = kind == "line" and pts[0] == pts[-1]
        tag = "polygon" if closed else "polyline"
        svg = f'<{tag} points="{path}" {_style(e, fill=closed)}{rot}/>'
        if kind == "arrow":
            for at_end, key in ((True, "endArrowhead"), (False, "startArrowhead")):
                if e.get(key):
                    (ax, ay), (bx, by) = (pts[-2], pts[-1]) if at_end else (pts[1], pts[0])
                    ang = math.atan2(by - ay, bx - ax)
                    size = 10 + _num(e.get("strokeWidth"), 2) * 2
                    left = (bx - size * math.cos(ang - 0.45), by - size * math.sin(ang - 0.45))
                    right = (bx - size * math.cos(ang + 0.45), by - size * math.sin(ang + 0.45))
                    svg += (f'<polyline points="{left[0]:g},{left[1]:g} {bx:g},{by:g} {right[0]:g},{right[1]:g}" '
                            f'{_style(e, fill=False)}{rot}/>')
        return svg
    if kind == "text":
        size = _num(e.get("fontSize"), FONT_SIZE)
        lh = size * _num(e.get("lineHeight"), LINE_HEIGHT)
        align = e.get("textAlign", "left")
        anchor, tx = {"center": ("middle", x + w / 2), "right": ("end", x + w)}.get(align, ("start", x))
        color = _color(e.get("strokeColor"), "#1e1e1e")
        lines = str(e.get("text", "")).split("\n")
        spans = "".join(
            f'<tspan x="{tx:g}" y="{y + size + i * lh:g}">{escape(line)}</tspan>' for i, line in enumerate(lines)
        )
        return (f'<text font-family="Virgil, Segoe Print, Comic Sans MS, sans-serif" font-size="{size:g}" '
                f'fill="{color}" text-anchor="{anchor}"{rot}>{spans}</text>')
    return ""


def render_svg(elements: Optional[Iterable[Dict[str, Any]]], *, max_size: int = 960, padding: int = 24) -> str:
    """Render a scene to a standalone SVG (white background, scaled to fit max_size)."""
    visible = _visible(elements or [])
    if not visible:
        return ('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">'
                '<rect width="320" height="200" fill="#ffffff"/></svg>')
    x0, y0, x1, y1 = _bounds(visible)
    x0, y0, x1, y1 = x0 - padding, y0 - padding, x1 + padding, y1 + padding
    vw, vh = max(x1 - x0, 1), max(y1 - y0, 1)
    scale = min(1.0, max_size / max(vw, vh))
    body = "".join(_element_svg(e) for e in visible)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{vw * scale:.0f}" height="{vh * scale:.0f}" '
            f'viewBox="{x0:g} {y0:g} {vw:g} {vh:g}"><rect x="{x0:g}" y="{y0:g}" width="{vw:g}" height="{vh:g}" '
            f'fill="#ffffff"/>{body}</svg>')
