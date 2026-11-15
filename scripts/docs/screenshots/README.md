# Guide screenshots

`capture.mjs` takes the custom-fields screenshots in `docs/img/guide/` (1440×900, light theme, WebP), so they can
be redone after a UI change instead of by hand. `seed.mjs` creates the demo data it needs through the REST API.

**Never point it at real data**: it creates global custom fields, a project and tasks.

## Run

1. Start a throw-away backend with an empty database and a first superuser, for example:

   ```bash
   podman run -d --rm --name docs-pg -e POSTGRES_PASSWORD=test -p 55432:5432 docker.io/library/postgres:16-alpine
   cd backend
   DATABASE_URL=postgresql+asyncpg://postgres:test@localhost:55432/postgres SECRET_KEY=<random> \
   FIRST_SUPERUSER_EMAIL=docs-admin@example.com FIRST_SUPERUSER_PASSWORD=<random> EMAIL_ENABLED=false \
   uvicorn app.main:app --port 8601
   ```

2. Start the frontend against it: the `frontend-docs` entry in `.claude/launch.json`, or
   `VITE_PROXY_TARGET=http://localhost:8601 npm --prefix frontend run dev -- --port 5175`.

3. Capture:

   ```bash
   cd scripts/docs/screenshots
   npm install
   npx playwright install chromium   # or set DOCS_BROWSER_CHANNEL=msedge / chrome to use an installed browser
   DOCS_USER=docs-admin@example.com DOCS_PASSWORD=<random> npm run capture
   ```

`DOCS_ONLY=custom-fields-task-values,custom-fields-project-overview` retakes just those shots.
`DOCS_BASE_URL` and `DOCS_API_URL` default to `http://localhost:5175` and `http://localhost:8601/api/v1`.
