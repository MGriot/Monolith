# Changelog: INFRA-001

## Initialize Docker Environment
- Created `docker-compose.yml` defining services:
    - `db`: PostgreSQL 15
    - `backend`: FastAPI (Port 8000)
    - `frontend`: React/Vite (Port 5173)
    - `nginx`: Reverse Proxy (Port 8080)
- Configured `.env` for secrets.
- Configured `nginx/nginx.conf` for routing.
- Created `backend` and `frontend` directories.
