# Monolith — Frontend

React 19 + TypeScript + Vite frontend for the **Monolith** project management platform. Setup, development mode and
the first sign-in are covered in the [guide, chapter 1](../docs/guide/01-getting-started.html).

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite 6 |
| Styling | Tailwind CSS v3 + Shadcn/UI |
| Icons | Lucide React |
| State/Data | TanStack Query v5 |
| Routing | React Router v7 |
| Forms | React Hook Form + Zod |
| Markdown | react-markdown + remark-gfm + remark-math + rehype-katex |
| Whiteboard | Excalidraw |
| Drag & Drop | dnd-kit |

## Branding

The app uses a custom `M` monogram as its favicon (`public/monolith.svg`) — a black rounded square with a white bold "M", matching the sidebar logo badge.

## Running in Development

With hot reload, from the repo root (Vite on **http://localhost:5173**, API on :8000):

```bash
podman-compose -f compose.yaml -f compose.dev.yaml up -d --build   # or: docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

Or run Vite on the host against a running backend:

```bash
cd frontend
npm install
VITE_PROXY_TARGET=http://localhost:8000 npm run dev
```

The Vite dev server proxies API requests to `VITE_PROXY_TARGET` (default `http://backend:8000`, the compose service; see
`vite.config.ts`).

## Checks and Production Build

```bash
npm run typecheck && npm test && npm run build
```

Output is placed in `dist/` and served by the frontend container behind the edge proxy in the full stack.

## Accounts

There are no default accounts: sign in with the `FIRST_SUPERUSER_EMAIL` / `FIRST_SUPERUSER_PASSWORD` from the root `.env`.
