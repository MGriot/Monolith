# 🗿 Monolith

[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-20232A?logo=react)](https://react.dev/)
[![MCP](https://img.shields.io/badge/MCP-112%20tools-6741d9)](docs/guide/09-mcp.html)

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

## ✨ Features

Each group links to the guide chapter that explains it.

### 📁 Projects and tasks ([chapter 3](docs/guide/03-projects-and-tasks.html))

- **Projects** with a Markdown description, status, priority, topics, work types and free tags, planned start and due dates, a
  **hard deadline**, budget versus real cost, and risk probability × impact; create blank or from a template.
- **Task tree of any depth** with automatic **WBS codes** (2.3.1), milestones, colours, several assignees, checklists, attachments
  and sketches; move a task anywhere in the tree, drag rows or cards to set a shared manual order.
- **Two-pane task editor**: content on the left, properties rail on the right, tabs for schedule, budget and risk, checklist,
  time, files and activity.
- **Project roles**: viewer, editor or admin per project, enforced by the API on every request, websocket message and MCP call.
- **Filter bar** (text, status, priority, assignee) with sort and group, state kept in the URL so links are shareable, and
  **saved views**.
- **Command palette** (Ctrl/⌘ + K) with actions, navigation and live search over projects, tasks and ideas; single-key
  **shortcuts** (`c` new task, `g p` / `g t` / `g d`, `?` cheat sheet).
- **Bulk actions** on up to 200 tasks: status, priority, assignees, archive, restore, delete.
- **Archive and restore** projects and tasks, plus auto-archive of projects that have been Done for a while.

### 🗓️ Scheduling ([chapter 2](docs/guide/02-concepts.html))

- **Dependencies** finish-to-start, start-to-start, finish-to-finish and start-to-finish, with lag or lead in days; cycles are
  rejected.
- **PERT estimates** (optimistic, normal, pessimistic) and an expected duration; start, due and duration recalculate each other.
- **Critical path (CPM)** computed by the server, with slack per task; hard deadlines tighten it and show negative slack when late.
- **Status roll-up**: summary tasks follow their children, a task cannot be Done before its predecessors, project progress and
  dates follow the tasks.
- **Deadline status** on every project (ok, at risk, missed) and actual completion dates.

### 📊 Planning views ([chapter 4](docs/guide/04-planning-views.html))

- **Interactive Gantt**: zoom from days to years, drag and resize bars, dependency arrows with conflict highlighting, critical-path
  toggle, deadline buffers, completion markers, today line, reference zones, and a **PNG export of the whole chart**.
- **Kanban board** by status with drag and drop that fires the roll-up and automations.
- **My tasks** across every project, as a list or a board.
- **Schedule**: every project on one yearly roadmap (roadmaps, deadlines and milestones, task progression) and a month calendar.
- **Dashboard**: KPI tiles, due this week, status distribution, team capacity and workload, risk exposure, completions over 12 months.
- **Team workload** timeline per project, an **activity heatmap**, a **risk matrix** and a 0–100 **portfolio health** score.
- **Updates** feed of recent changes across your projects.

### 💬 Collaboration ([chapter 5](docs/guide/05-collaboration.html))

- **Threaded comments** in Markdown on projects, tasks and ideas, with attachments, images from the project gallery, edit and delete.
- **Activity and change log**: every task change is recorded as a plain sentence with who made it (app, API or MCP); automation
  and roll-up changes are labelled; filter All / Comments / Changes.
- **Ideas Hub**: propose, vote, approve or reject, then promote an idea to a task or a new project.
- **Live Excalidraw sketches**: real-time co-editing with element-level merge, named pointers in colour, autosave, view-only mode
  for viewers, offline reconnect, a share dialog to manage members, server-rendered previews, export to a task as PNG.
- **File Hub** per project and task: nested folders, drag-and-drop uploads with progress, rename, topics, grid or list, filters by
  kind, Markdown notes, and previews of images, PDFs, CSV/XLSX, DOCX, text and `.excalidraw` files.
- **Notifications**: an in-app notification centre pushed over a websocket, plus e-mail for assignments, deadline reminders and a
  weekly digest, with per-user opt-outs.

### ⏱️ Tracking ([chapter 6](docs/guide/06-tracking.html))

- **Time tracking**: one running timer per person, manual entries, **estimate versus actual** against PERT, timesheets per person
  and project.
- **Custom fields** per project: text, number, select, date and user, validated on every save.
- **Recurring tasks** (daily, weekly, monthly, yearly, intervals, weekdays, "last Friday", end date) that create the next copy when
  one is done.
- **Private iCalendar feed** of your dated tasks for Google Calendar, Outlook or Apple Calendar.

### ⚙️ Automation and data ([chapter 7](docs/guide/07-automation.html))

- **"When / if / then" rules** per project: triggers (created, status changed, assigned, completed, due soon), conditions and
  actions (set fields, assign, notify, call a webhook), isolated, loop-safe and with a 90-day run history.
- **Webhooks** to Slack, Discord or any JSON endpoint, personal or per project, queued with retries and protected against SSRF.
- **Project templates** with a task tree and taxonomy presets, private, shared or public.
- **Workflows (SOPs)**: a searchable library of procedures in Markdown with LaTeX math.
- **Exports**: projects and tasks to CSV and XLSX, the Gantt to PNG, a full project to JSON over MCP.

### 🛡️ Administration ([chapter 8](docs/guide/08-administration.html))

- **Users**: optional sign-up with administrator approval, temporary passwords, promote or demote administrators, deactivate
  accounts, login throttling.
- **Topics and work types**: global lists with colours plus project-scoped entries.
- **Teams** with co-owners, an activity feed and a weekly team report.
- **Personal settings**: profile, light, dark or system theme, notification opt-outs, calendar feed, personal webhooks, MCP tokens,
  password change.
- **Alembic migrations** applied automatically at start-up, and a **mail queue** with retries, administrator retry and an optional
  outbound relay.

### 🤖 AI assistants over MCP ([chapter 9](docs/guide/09-mcp.html))

- **112 typed tools, 5 resources and 2 prompts** (`plan_project`, `weekly_status_report`) covering everything above.
- **Personal tokens** (hashed, optional expiry, revocable, re-checked on every call): the assistant acts as you, with your roles.
- Tools call the same REST handlers as the UI, so validation, roll-up, automations, notifications and the change log behave the same.
- SSE or stdio transport, DNS-rebinding protection, and a **sample project** script that builds a full migration plan through MCP.

### 🔌 API and operations ([chapters 10](docs/guide/10-api-reference.html) and [11](docs/guide/11-troubleshooting.html))

- **REST API** with Swagger at `/api/docs`, plus websockets for notifications and live sketch rooms.
- **Security**: no default accounts, bcrypt, one authorization layer, safe uploads (random names, size limit, executable types
  refused), outbound address checks.
- **Operations**: rootless Podman or Docker, only the proxy published, one transaction per operation, queued e-mail and webhooks
  with retries, a bundled mail server, health checks and documented backups.

## 🛠️ Tech stack

React 19 · TypeScript · Tailwind · TanStack Query · Excalidraw 0.18 — FastAPI · SQLAlchemy (async) · PostgreSQL 16 · Alembic · MCP Python SDK — nginx · docker-mailserver · Podman/Docker Compose.

## 📦 Repository layout

```text
backend/     FastAPI app (app/api, app/mcp, app/core, app/models), Alembic migrations, tests (unit + live)
frontend/    React app (Vite)
docs/        guide/ (HTML documentation), img/ (screenshots; img/guide/ for the guide), redesign/ (UI redesign proposal)
scripts/     mail-bootstrap.sh, live-smoke.sh, mcp_sample_project.py + sample_project.json, docs/gen_reference.py,
             debug/ (one-off Playwright scripts)
nginx/       reverse proxy configuration
compose.yaml / compose.dev.yaml
```

## 🧪 Tests and CI

```bash
cd backend && python -m pytest -q tests/                      # unit tests, no database
TEST_DATABASE_URL=postgresql+asyncpg://postgres:test@localhost:55432/postgres \
  python -m pytest -q tests/test_db_integration.py              # against a throw-away Postgres (rolled back)
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
