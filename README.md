# 🗿 Monolith

[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-20232A?logo=react)](https://react.dev/)
[![MCP](https://img.shields.io/badge/MCP-110%20tools-6741d9)](docs/guide/09-mcp.html)

**Monolith** is a self-hosted project planner for technical teams. Projects hold a tree of tasks of any depth with dates, PERT
estimates, dependencies and a live critical path, budgets and risk, time tracking, custom fields and automations. Comments, an ideas
hub, a File Hub with previews and **real-time Excalidraw sketches** keep the conversation next to the work, and a **Model Context
Protocol** server lets AI assistants plan and update projects as you.

![Gantt chart with dependencies, the critical path and a today marker](docs/img/gantt.png)

<table>
  <tr>
    <td width="50%"><img src="docs/img/kanban.png" alt="Kanban board with filters and saved views"></td>
    <td width="50%"><img src="docs/img/schedule.png" alt="Master schedule showing every project on one yearly roadmap"></td>
  </tr>
</table>

## 📖 Documentation

The complete guide is plain HTML in [`docs/guide/`](docs/guide/index.html). Open `docs/guide/index.html` in a browser after cloning
(GitHub shows HTML files as source), or serve the folder with any static host.

| | Chapter | Covers |
|---|---|---|
| 1 | [Getting started](docs/guide/01-getting-started.html) | the stack, `.env`, first sign-in, dev mode, tests, Podman notes |
| 2 | [Concepts](docs/guide/02-concepts.html) | architecture, the task tree, status roll-up, roles, scheduling and CPM |
| 3 | [Projects & tasks](docs/guide/03-projects-and-tasks.html) | every editor field, filters, saved views, shortcuts, bulk actions, archive |
| 4 | [Planning views](docs/guide/04-planning-views.html) | Gantt, Kanban, schedule, dashboard, workload, heatmap, portfolio health |
| 5 | [Collaboration](docs/guide/05-collaboration.html) | comments, ideas, live sketches and sharing, File Hub, notifications, e-mail |
| 6 | [Tracking](docs/guide/06-tracking.html) | time tracking, custom fields, recurring tasks, calendar feed |
| 7 | [Automation](docs/guide/07-automation.html) | rules, webhooks, templates, SOP workflows, exports |
| 8 | [Administration](docs/guide/08-administration.html) | users and approval, taxonomy, teams, settings, migrations, mail queue |
| 9 | [MCP server](docs/guide/09-mcp.html) | personal tokens, client setup, every tool, the sample project |
| 10 | [API reference](docs/guide/10-api-reference.html) | every REST endpoint, the websocket protocols |
| 11 | [Troubleshooting](docs/guide/11-troubleshooting.html) | security model, common problems, health checks, backups |

The tool and endpoint references are generated from the code: `python scripts/docs/gen_reference.py` (CI runs it with `--check`).

## 🚀 Quick start

Requirements: rootless **Podman** with `podman-compose` ≥ 1.2, or **Docker** with Compose v2.

```bash
cp .env.example .env            # set POSTGRES_PASSWORD, SECRET_KEY, FIRST_SUPERUSER_EMAIL/PASSWORD, SMTP_USER/PASSWORD
scripts/mail-bootstrap.sh       # one-time: TLS certificate + sender mailbox for the internal mail server
podman-compose up -d --build    # or: docker compose up -d --build
```

| What | Where |
|---|---|
| App | http://localhost:8080 (`HTTP_PORT`) |
| API docs | http://localhost:8080/api/docs |
| MCP | http://localhost:8080/mcp/sse with a personal token |

There are **no default accounts**: sign in with `FIRST_SUPERUSER_EMAIL`, then remove its password from `.env`. Development mode with
hot reload: `podman-compose -f compose.yaml -f compose.dev.yaml up -d --build` (Vite on :5173, API on :8000). Details in
[chapter 1](docs/guide/01-getting-started.html).

## 🤖 Connect an AI assistant (MCP)

1. In Monolith, open **Settings → MCP access → Create token** and copy the token (it is shown once).
2. Add the server to your client, for example Claude Code:

   ```bash
   claude mcp add --transport sse monolith http://localhost:8080/mcp/sse --header "Authorization: Bearer $MONOLITH_MCP_TOKEN"
   ```

3. Ask it to plan something. Every tool acts as you, with your project roles; a viewer's token can read but not write.

Try the sample: `pip install "mcp<2"` and `python scripts/mcp_sample_project.py --replace` build a complete migration project
(deadline, budget versus cost, allocations, 5 phases and 22 tasks with dependencies, time, comments, an idea, a sketch and a runbook) through MCP calls
alone. See [chapter 9](docs/guide/09-mcp.html).

## ✨ Highlights

- **Planning**: unlimited task nesting with WBS codes, FS/SS/FF/SF dependencies with lag, PERT estimates, a server-side critical path, planned dates and hard deadlines on projects and tasks.
- **Views**: Gantt (day to year, PNG export), Kanban, filtered lists with shareable URLs and saved views, a yearly schedule, dashboard KPIs, workload, heatmap, risk matrix, portfolio health.
- **Collaboration**: project roles (viewer, editor, admin), comments, an ideas hub with voting and promotion, live Excalidraw sketches with presence, pointers and view-only mode, a File Hub that previews images, PDFs, spreadsheets, documents, notes and `.excalidraw` files.
- **Tracking & automation**: timers against estimates, timesheets, typed custom fields, recurring tasks, an ICS feed, "when / if / then" rules, Slack/Discord/JSON webhooks, templates, SOPs with LaTeX, CSV/XLSX exports.
- **Operations**: rootless containers, one transaction per operation, Alembic migrations at start-up, queued e-mail and webhooks with retries, a bundled mail server.

## 🛠️ Tech stack

React 19 · TypeScript · Tailwind · TanStack Query · Excalidraw 0.18 — FastAPI · SQLAlchemy (async) · PostgreSQL 16 · Alembic · MCP Python SDK — nginx · docker-mailserver · Podman/Docker Compose.

## 📦 Repository layout

```text
backend/     FastAPI app (app/api, app/mcp, app/core, app/models), Alembic migrations, tests (unit + live)
frontend/    React app (Vite)
docs/        guide/ (HTML documentation), img/ (screenshots), redesign/ (UI redesign proposal)
scripts/     mail-bootstrap.sh, live-smoke.sh, mcp_sample_project.py + sample_project.json, docs/gen_reference.py
nginx/       reverse proxy configuration
compose.yaml / compose.dev.yaml
```

## 🧪 Tests and CI

```bash
cd backend && python -m pytest -q tests/                      # unit tests, no database
cd frontend && npm ci && npm run typecheck && npm test && npm run build
scripts/live-smoke.sh                                         # against a throw-away stack with a fresh database
python scripts/docs/gen_reference.py --check                  # generated guide sections are current
```

[GitHub Actions](.github/workflows/ci.yml) runs the backend unit tests and a `pip-audit` scan, the docs check, the frontend typecheck,
tests and build, then builds the Podman stack and runs the live checks (including MCP over SSE and two websocket peers on one sketch).

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions, tests and the pull-request process.

## 📄 License

MIT, see [LICENSE](LICENSE).
