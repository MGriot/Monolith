#!/usr/bin/env python3
"""Regenerate the machine-written parts of the HTML guide in docs/guide/ from the code.

Fills every block between `<!-- BEGIN:<name> -->` and `<!-- END:<name> -->`:

  topbar       chapter bar (every page)            toc      "On this page" rail, from <section id> + <h2>
  pager        previous / next chapter links        stats    counts on the index page
  mcp-tools    every MCP tool, grouped by module, with its typed parameters (from the live MCP server)
  mcp-extras   MCP resources and prompts
  api          every REST endpoint, grouped by area, with parameters and request bodies (from app.openapi())

    python scripts/docs/gen_reference.py           # rewrite the pages
    python scripts/docs/gen_reference.py --check   # exit 1 if a page is out of date (CI)

Needs the backend's Python dependencies (no database: nothing is queried).
"""
import argparse
import asyncio
import html
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GUIDE = ROOT / "docs" / "guide"
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://docs:docs@localhost:5432/docs")
os.environ.setdefault("SECRET_KEY", "docs-generator-placeholder-secret-key-0123456789")

CHAPTERS = [
    ("index.html", "", "Overview"),
    ("01-getting-started.html", "1", "Getting started"),
    ("02-concepts.html", "2", "Concepts"),
    ("03-projects-and-tasks.html", "3", "Projects & tasks"),
    ("04-planning-views.html", "4", "Planning views"),
    ("05-collaboration.html", "5", "Collaboration"),
    ("06-tracking.html", "6", "Tracking"),
    ("07-automation.html", "7", "Automation"),
    ("08-administration.html", "8", "Administration"),
    ("09-mcp.html", "9", "MCP"),
    ("10-api-reference.html", "10", "API reference"),
    ("11-troubleshooting.html", "11", "Troubleshooting"),
]

TOOL_GROUPS = {
    "users": "Identity & people", "projects": "Projects & members", "tasks": "Tasks, dependencies & critical path",
    "time": "Time tracking", "project_settings": "Custom fields & automations",
    "collaboration": "Comments, ideas & sketches", "files": "File Hub", "organization": "Teams, taxonomy, templates, SOPs, webhooks & notifications",
    "insights": "Dashboards, calendar & search",
}

API_GROUPS = {
    "login": "Sign-in", "auth": "Account flows", "users": "Users & personal tokens", "projects": "Projects",
    "tasks": "Tasks", "subtasks": "Subtasks (legacy alias)", "time": "Time tracking", "metadata": "Topics & work types",
    "dashboard": "Dashboard", "teams": "Teams", "templates": "Templates", "workflows": "Workflows (SOPs)",
    "whiteboards": "Whiteboards", "ideas": "Ideas", "comments": "Comments", "folders": "File Hub",
    "search": "Search", "webhooks": "Webhooks", "notifications": "Notifications", "calendar": "Calendar",
    "outbox": "E-mail outbox",
}

esc = html.escape


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def replace_block(text: str, name: str, body: str) -> str:
    pattern = re.compile(rf"(<!-- BEGIN:{re.escape(name)} -->)(.*?)(<!-- END:{re.escape(name)} -->)", re.S)
    if not pattern.search(text):
        return text
    return pattern.sub(lambda m: m.group(1) + "\n" + body.rstrip() + "\n" + m.group(3), text)


# --- shared navigation -------------------------------------------------------------------------------------------

def topbar(current: str) -> str:
    links = []
    for file, num, title in CHAPTERS:
        cur = ' aria-current="page"' if file == current else ""
        prefix = f"<b>{num}</b>" if num else ""
        links.append(f'<a href="{file}"{cur}>{prefix}{esc(title)}</a>')
    return (
        '<header class="topbar"><div class="topbar-in">'
        '<a class="brand" href="index.html"><img src="assets/monolith.svg" alt="" width="22" height="22">Monolith Guide</a>'
        f'<nav class="chapters" aria-label="Chapters">{"".join(links)}</nav>'
        '<button type="button" class="theme-btn">Dark mode</button>'
        "</div></header>"
    )


SECTION_RE = re.compile(r'<section id="([^"]+)"[^>]*>\s*(?:<span class="eyebrow">.*?</span>\s*)?<h2[^>]*>(.*?)</h2>', re.S)


def toc(text: str) -> str:
    items = [f'<a href="#{sid}">{esc(re.sub(r"<[^>]+>", "", title).strip())}</a>' for sid, title in SECTION_RE.findall(text)]
    return '<span class="eyebrow">On this page</span>\n' + "\n".join(items)


def pager(current: str) -> str:
    idx = [c[0] for c in CHAPTERS].index(current)
    parts = []
    if idx > 0:
        f, n, t = CHAPTERS[idx - 1]
        parts.append(f'<a class="prev" href="{f}"><span>Previous</span>{(n + ". ") if n else ""}{esc(t)}</a>')
    if idx < len(CHAPTERS) - 1:
        f, n, t = CHAPTERS[idx + 1]
        parts.append(f'<a class="next" href="{f}"><span>Next</span>{n}. {esc(t)}</a>')
    return '<nav class="pager" aria-label="Chapters">' + "".join(parts) + "</nav>"


# --- MCP ---------------------------------------------------------------------------------------------------------

def _schema_type(prop: dict, defs: dict) -> str:
    if "$ref" in prop:
        name = prop["$ref"].rsplit("/", 1)[-1]
        return f"object <code>{esc(name)}</code>"
    if "anyOf" in prop:
        kinds = [_schema_type(p, defs) for p in prop["anyOf"] if p.get("type") != "null"]
        return " | ".join(kinds) + (" | null" if any(p.get("type") == "null" for p in prop["anyOf"]) else "")
    if "enum" in prop:
        return " | ".join(f"<code>{esc(json.dumps(v))}</code>" for v in prop["enum"])
    t = prop.get("type", "any")
    fmt = prop.get("format")
    if t == "array":
        return f"array of {_schema_type(prop.get('items', {}), defs)}"
    if fmt in ("uuid", "date", "date-time"):
        return {"uuid": "UUID", "date": "date", "date-time": "date-time"}[fmt]
    return t


def _fields_table(props: dict, required: set, defs: dict) -> str:
    rows = []
    for name, prop in props.items():
        extra = []
        for key, label in (("minimum", "≥"), ("maximum", "≤"), ("minLength", "min length"), ("maxLength", "max length")):
            if key in prop:
                extra.append(f"{label} {prop[key]}")
        default = prop.get("default", None)
        if "default" in prop and default not in (None, [], {}):
            extra.append(f"default <code>{esc(json.dumps(default))}</code>")
        desc = esc(prop.get("description", "") or "")
        req = '<span class="req">required</span>' if name in required else ""
        rows.append(f"<tr><td><code>{esc(name)}</code>{req}</td><td class=\"wrap\">{_schema_type(prop, defs)}</td>"
                    f"<td class=\"wrap\">{desc}{(' · ' if desc and extra else '') + ', '.join(extra)}</td></tr>")
    if not rows:
        return '<p class="small muted">No parameters.</p>'
    return ('<div class="tbl"><table><thead><tr><th>Parameter</th><th>Type</th><th>Notes</th></tr></thead><tbody>'
            + "".join(rows) + "</tbody></table></div>")


def _model_fields(defs: dict, name: str) -> str:
    model = defs.get(name, {})
    props = model.get("properties", {})
    if not props:
        return ""
    keys = ", ".join(f"<code>{esc(k)}</code>" for k in props)
    return f'<p class="small"><b>{esc(name)}</b> fields: {keys}</p>'


def mcp_blocks():
    from app.mcp.server import mcp

    tools = asyncio.run(mcp.list_tools())
    manager = mcp._tool_manager
    groups: dict = {}
    for tool in tools:
        module = manager.get_tool(tool.name).fn.__module__.rsplit(".", 1)[-1]
        groups.setdefault(module, []).append(tool)
    out = []
    for module, title in TOOL_GROUPS.items():
        items = groups.get(module, [])
        if not items:
            continue
        cards = []
        for tool in items:
            schema = tool.inputSchema
            defs = schema.get("$defs", {})
            first = (tool.description or "").strip().split("\n")[0]
            rest = "\n".join((tool.description or "").strip().split("\n")[1:]).strip()
            model_notes = "".join(_model_fields(defs, p["$ref"].rsplit("/", 1)[-1])
                                  for p in schema.get("properties", {}).values() if "$ref" in p)
            cards.append(
                f'<details class="tool" id="tool-{tool.name}"><summary><code>{esc(tool.name)}</code><span>{esc(first)}</span></summary>'
                f'<div class="body">{f"<p>{esc(rest)}</p>" if rest else ""}'
                f'{_fields_table(schema.get("properties", {}), set(schema.get("required", [])), defs)}{model_notes}</div></details>'
            )
        out.append(f'<h3 id="tools-{module}">{esc(title)} <span class="tag">{len(items)}</span></h3>\n<div class="tools">\n'
                   + "\n".join(cards) + "\n</div>")
    resources = asyncio.run(mcp.list_resources())
    templates = asyncio.run(mcp.list_resource_templates())
    prompts = asyncio.run(mcp.list_prompts())
    rows = [f"<tr><td><code>{esc(str(r.uri))}</code></td><td class=\"wrap\">{esc(r.description or '')}</td></tr>" for r in resources]
    rows += [f"<tr><td><code>{esc(t.uriTemplate)}</code></td><td class=\"wrap\">{esc(t.description or '')}</td></tr>" for t in templates]
    prow = [f"<tr><td><code>{esc(p.name)}</code></td><td class=\"wrap\">{esc(p.description or '')}</td>"
            f"<td>{', '.join('<code>' + esc(a.name) + '</code>' for a in (p.arguments or []))}</td></tr>" for p in prompts]
    extras = ('<h3>Resources</h3><div class="tbl"><table><thead><tr><th>URI</th><th>Content</th></tr></thead><tbody>'
              + "".join(rows) + "</tbody></table></div>"
              '<h3>Prompts</h3><div class="tbl"><table><thead><tr><th>Prompt</th><th>Purpose</th><th>Arguments</th></tr></thead><tbody>'
              + "".join(prow) + "</tbody></table></div>")
    return "\n".join(out), extras, len(tools), len(resources) + len(templates), len(prompts)


# --- REST --------------------------------------------------------------------------------------------------------

def api_block():
    from app.main import app

    spec = app.openapi()
    groups: dict = {}
    count = 0
    for path, methods in spec["paths"].items():
        area = path.split("/")[3] if path.startswith("/api/v1/") else "other"
        for method, op in methods.items():
            groups.setdefault(area, []).append((path, method, op))
            count += 1
    schemas = spec.get("components", {}).get("schemas", {})
    out = []
    order = list(API_GROUPS) + sorted(set(groups) - set(API_GROUPS))
    for area in order:
        ops = groups.get(area)
        if not ops:
            continue
        rows = []
        for path, method, op in ops:
            anchor = f"api-{method}-{slug(path)}"
            params = op.get("parameters", [])
            prow = "".join(
                f"<tr><td><code>{esc(p['name'])}</code>{'<span class=\"req\">required</span>' if p.get('required') else ''}</td>"
                f"<td>{esc(p['in'])}</td><td class=\"wrap\">{_schema_type(p.get('schema', {}), schemas)}</td></tr>"
                for p in params
            )
            body = op.get("requestBody", {}).get("content", {})
            body_html = ""
            for ctype, content in body.items():
                ref = content.get("schema", {}).get("$ref", "")
                name = ref.rsplit("/", 1)[-1] if ref else ctype
                fields = schemas.get(name, {}).get("properties", {})
                body_html += (f'<p class="small"><b>Body</b> <code>{esc(ctype)}</code> {esc(name)}'
                              + (": " + ", ".join(f"<code>{esc(k)}</code>" for k in fields) if fields else "") + "</p>")
            desc = (op.get("description") or "").strip()
            secured = "" if op.get("security") else '<p class="small"><span class="tag">no sign-in</span></p>'
            details = (f"<p>{esc(desc)}</p>" if desc else "") + secured + body_html + (
                '<div class="tbl"><table><thead><tr><th>Parameter</th><th>In</th><th>Type</th></tr></thead><tbody>'
                + prow + "</tbody></table></div>" if prow else "")
            rows.append(
                f'<details class="ep" id="{anchor}"><summary><span class="m {method}">{method.upper()}</span>'
                f'<code>{esc(path)}</code><span class="sum">{esc(op.get("summary", ""))}</span></summary>'
                f'<div class="body">{details or "<p>No parameters.</p>"}</div></details>'
            )
        title = API_GROUPS.get(area, area.title())
        out.append(f'<div class="api-group"><h3 id="api-{area}">{esc(title)} <span class="tag">{len(ops)}</span></h3>\n'
                   + "\n".join(rows) + "\n</div>")
    return "\n".join(out), count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if any page would change")
    args = parser.parse_args()

    tools_html, extras_html, n_tools, n_resources, n_prompts = mcp_blocks()
    api_html, n_endpoints = api_block()
    stats = (f'<div class="stats"><div class="stat"><b>{len(CHAPTERS) - 1}</b><span>chapters</span></div>'
             f'<div class="stat"><b>{n_endpoints}</b><span>REST endpoints documented</span></div>'
             f'<div class="stat"><b>{n_tools}</b><span>MCP tools</span></div>'
             f'<div class="stat"><b>{n_resources} + {n_prompts}</b><span>MCP resources + prompts</span></div></div>')

    stale = []
    for file, _, _ in CHAPTERS:
        path = GUIDE / file
        original = path.read_text(encoding="utf-8")
        text = replace_block(original, "topbar", topbar(file))
        text = replace_block(text, "toc", toc(text))
        text = replace_block(text, "pager", pager(file))
        text = replace_block(text, "stats", stats)
        text = replace_block(text, "mcp-tools", tools_html)
        text = replace_block(text, "mcp-extras", extras_html)
        text = replace_block(text, "api", api_html)
        if text != original:
            stale.append(file)
            if not args.check:
                path.write_text(text, encoding="utf-8", newline="\n")
    if args.check and stale:
        print("Out of date (run python scripts/docs/gen_reference.py):", ", ".join(stale), file=sys.stderr)
        sys.exit(1)
    print(f"{'checked' if args.check else 'updated'}: {len(CHAPTERS)} pages; {n_endpoints} endpoints, {n_tools} tools"
          + (f"; rewrote {', '.join(stale)}" if stale and not args.check else ""))


if __name__ == "__main__":
    main()
