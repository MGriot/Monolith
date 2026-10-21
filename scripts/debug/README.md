# Debug scripts

One-off [Playwright](https://playwright.dev/python/) scripts used while chasing UI bugs. They are not part of the test suite
and are kept only as starting points for similar investigations.

| Script | What it does |
|---|---|
| `recon_login.py` | Loads the login page and prints what the form contains. |
| `capture_logs.py` | Opens the login page and records the browser console. |
| `verify_full.py` | Signs in and screenshots the landing page. |
| `repro_task_click.py` | Signs in, opens the first project and clicks a task to reproduce a dialog error. |
| `debug_specific_project.py` | Signs in and opens one project (`PROJECT_ID`) to inspect a blank page. |

```bash
pip install playwright && playwright install chromium
BASE_URL=http://localhost:5173 MONOLITH_EMAIL=you@example.com MONOLITH_PASSWORD=... python scripts/debug/verify_full.py
```

Screenshots go to `scripts/debug/output/` (ignored by git). Credentials are read from the environment only.
