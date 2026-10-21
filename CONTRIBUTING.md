# Contributing to Monolith

First off, thank you for considering contributing to Monolith! It's people like you that make it a great tool for technical teams.

## 🌈 Code of Conduct

By participating in this project, you agree to abide by our standards of professional and respectful conduct.

## 🛠️ Development Setup

### Backend
- Language: Python 3.12 (the version CI and the container image use)
- Framework: FastAPI
- ORM: SQLAlchemy (Async), migrations with Alembic
- Linting: Use `ruff` (not enforced by CI yet)

### Frontend
- Language: TypeScript, Node 22
- Framework: React 19 (Vite)
- Styling: Tailwind CSS & Shadcn/UI
- State: React Query (TanStack)

## 📐 Project Conventions

### 1. Hierarchy First
Always respect the `Project -> Task -> Subtask` structure. Do not flatten this hierarchy without significant architectural review.

### 2. Status Propagation
When modifying status logic, ensure that:
- Subtask `Done` status updates the parent Task.
- Task status changes update the Project's overall progress percentage.

### 3. TypeScript Strictness
We use `verbatimModuleSyntax`. Always use `import type` for type-only imports to ensure clean builds.

### 4. Database Migrations
Schema changes go through Alembic: update the models in `backend/app/models/`, then add a migration. See
[Administration › Database migrations](docs/guide/08-administration.html#migrations).

### 5. MCP tools
New features that users can reach in the UI should be reachable over MCP too. Add a tool in `backend/app/mcp/tools/` that calls the
REST handler through `app.mcp.context.call` (never duplicate validation or permission logic), add its name to `EXPECTED` in
`backend/tests/test_mcp_registry.py`, and regenerate the guide (below).

### 6. Documentation
The guide is HTML in `docs/guide/`, styled by `docs/guide/assets/guide.css` (the design tokens of `docs/redesign`). Write prose by hand;
never edit between `<!-- BEGIN:… -->` and `<!-- END:… -->` markers: run `python scripts/docs/gen_reference.py` instead. CI fails when
the generated parts are stale.

## 🧪 Testing

Before submitting a PR, run what CI runs (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):
- Backend: `python -m pytest -q tests/<file>.py` in `backend/` for the unit-test files listed in the workflow. New test
  files must be added to that list, or CI will not run them.
- Dependencies: `pip-audit -r backend/requirements.txt` should report no known vulnerabilities.
- Frontend (Node 22): `npm ci && npm run typecheck && npm test && npm run build` in `frontend/`.
- Docs: `python scripts/docs/gen_reference.py --check`.
- Full stack: `podman-compose up -d --build` on a fresh database, then `scripts/live-smoke.sh`. Never run the live checks against a
  database with real data: they create accounts and projects.

## 📝 Commit Messages

We prefer clear, descriptive commit messages.
- `feat:` for new features.
- `fix:` for bug fixes.
- `docs:` for documentation changes.
- `refactor:` for code restructuring.

## 🚀 Pull Request Process

1. Create a branch from `main`.
2. Ensure your code follows the existing style and conventions.
3. Update the guide in `docs/guide/` (and the `README.md` if it is a headline feature or new configuration).
4. Submit the PR and wait for review.

---
*Questions? Reach out to the maintainers or open an issue!*
