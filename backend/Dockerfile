# syntax=docker/dockerfile:1
# Targets: dev (bind-mount + reload, runs as container-root = host user when rootless)
#          prod (default; non-root, no reload)
FROM docker.io/library/python:3.12-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libz-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

FROM base AS dev
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS prod
RUN useradd --system --uid 10001 --create-home app \
    && mkdir -p /app/uploads /app/media \
    && chown -R app:app /app
COPY --chown=app:app . .
USER app
# Only the edge proxy can reach this port (not published), so trust its X-Forwarded-For.
# One worker: the websocket manager is in-process (see audit, Tier 1 "WS").
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
