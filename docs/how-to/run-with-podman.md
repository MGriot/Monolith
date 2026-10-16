# Run Monolith with Podman (rootless) and the internal mail server

Works with `podman-compose` (>= 1.2) and `docker compose` unchanged. Tested with Podman 6 / podman-compose 1.6 on Windows (WSL machine).

## Services

| Service | Image | Reachable from |
|---|---|---|
| `proxy` | nginx | host, `http://localhost:${HTTP_PORT:-8080}` (SPA + `/api` + websockets + `/uploads` + `/mcp`) |
| `frontend` | nginx-unprivileged (static build) | proxy only |
| `backend` | FastAPI, non-root uid 10001 | proxy + `mail_net` |
| `db` | postgres 16 | backend only (not published) |
| `mailserver` | docker-mailserver | backend only, over `mail_net` (not published) |

## First run

```bash
cp .env.example .env
# fill in: POSTGRES_PASSWORD, SECRET_KEY (openssl rand -hex 32), FIRST_SUPERUSER_EMAIL/PASSWORD,
#          MAIL_DOMAIN, SMTP_USER (e.g. noreply@<MAIL_DOMAIN>), SMTP_PASSWORD, MCP_API_KEY (optional)

scripts/mail-bootstrap.sh            # self-signed TLS cert + the sender mailbox (idempotent)
podman-compose up -d --build
podman ps                            # all services should become (healthy)
```

Open `http://localhost:8080` and sign in with `FIRST_SUPERUSER_EMAIL`. Public sign-up is off (`ALLOW_SIGNUP=false`); create users as an admin.

> **User e-mail domains:** the API rejects special-use domains (`.test`, `.local`, `.localhost`, `.invalid`) in user addresses.
> `MAIL_DOMAIN` may be `monolith.local`, but the accounts you create in the app need a normal domain such as `example.com`.

> **Why the bootstrap script?** docker-mailserver does not create a TLS certificate for `SSL_TYPE=manual`, and Dovecot shuts the container
> down 120 s after start if no mailbox exists. The script prepares both before the first start.

## Development

```bash
podman-compose -f compose.yaml -f compose.dev.yaml up -d --build
```

Adds bind mounts (`:z` for SELinux), `--reload`, the Vite dev server on `127.0.0.1:5173`, the API on `127.0.0.1:8000` and Postgres on `127.0.0.1:54321`.

## Rootless notes

* Host ports are all above 1024 (`8080`), so no `net.ipv4.ip_unprivileged_port_start` change is needed. Publishing mail ports (25/587) for real delivery needs either that sysctl or unprivileged host ports (`2525:25`).
* `PERMIT_DOCKER=none` on the mail server: rootless networking NATs source addresses, and `connected-networks` could turn the server into an open relay. The app authenticates on port 587 (STARTTLS) instead.
* Mail state lives in **named volumes**. Postfix creates unix sockets under `/var/mail-state`, which fails on bind mounts from Windows/macOS/network filesystems. Only `mailserver/config` (accounts, certs, DKIM keys) is bind-mounted.
* `loginctl enable-linger $USER` keeps rootless containers running after you log out (Linux).
* Short image names are fully qualified (`docker.io/...`), so no `unqualified-search-registries` prompt.

## Real e-mail delivery

The bundled setup delivers between mailboxes on the internal server. To reach Gmail/Outlook you additionally need DNS `MX`, SPF, DKIM
(`setup config dkim domain <domain>`), DMARC and a matching reverse DNS, a real certificate (`SSL_CERT_PATH`/`SSL_KEY_PATH`), and an ISP that
allows outbound port 25. On home connections it is usually easier to set `RELAY_HOST`/`RELAY_PORT`/`RELAY_USER`/`RELAY_PASSWORD` (commented in `compose.yaml`) and relay through a provider.

## MCP endpoint

`/mcp` is only mounted when `MCP_API_KEY` is set and requires `Authorization: Bearer <MCP_API_KEY>`. The `Host` header must match `APP_BASE_URL`,
`localhost`/`127.0.0.1` or `MCP_ALLOWED_HOSTS` (DNS-rebinding protection).

## Checks

```bash
podman exec monolith_mail setup email list
podman logs monolith_backend | tail
podman exec monolith_backend python -c "import urllib.request;print(urllib.request.urlopen('http://localhost:8000/api/health').read())"
```

## Typecheck

The production image bundles with `vite build` only. Run `npm run typecheck` in `frontend/` separately; it still reports ~35 unused-import errors (TS6133) that should be cleaned up before adding it to CI.
