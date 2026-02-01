# Contributing to Monolith

First off, thank you for considering contributing to Monolith! It's people like you that make it a great tool for technical teams.

## 🌈 Code of Conduct

By participating in this project, you agree to abide by our standards of professional and respectful conduct.

## 🛠️ Development Setup

### Backend
- Language: Python 3.12+
- Framework: FastAPI
- ORM: SQLAlchemy (Async)
- Linting: Use `ruff`

### Frontend
- Language: TypeScript
- Framework: React (Vite)
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
We use SQLAlchemy's base metadata to auto-generate tables on startup. For schema changes, update the models in `backend/app/models/`.

## 🧪 Testing

Before submitting a PR, please verify your changes:
- Check for TypeScript errors: `npm run build` in the frontend.
- Verify Docker builds: `docker-compose build`.

## 📝 Commit Messages

We prefer clear, descriptive commit messages.
- `feat:` for new features.
- `fix:` for bug fixes.
- `docs:` for documentation changes.
- `refactor:` for code restructuring.

## 🚀 Pull Request Process

1. Create a branch from `main`.
2. Ensure your code follows the existing style and conventions.
3. Update the `README.md` if you've added new features or configuration.
4. Submit the PR and wait for review.

---
*Questions? Reach out to the maintainers or open an issue!*
