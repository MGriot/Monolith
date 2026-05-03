# Monolith — Frontend

React 19 + TypeScript + Vite frontend for the **Monolith** project management platform.

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

The app uses a custom `M` monogram as its favicon (`public/monolith.svg`) — a black rounded square with a white bold "M", matching the sidebar logo badge. This replaces the default Vite icon.

## Running in Development (Docker)

The frontend runs as part of the full Docker stack. From the repo root:

```bash
docker-compose up -d
```

The Vite dev server will be available at **http://localhost:5173**.

> If you add new npm packages to `package.json`, run `npm install` inside the container to update `node_modules` without rebuilding the image:
> ```bash
> docker exec monolith_frontend npm install
> docker restart monolith_frontend
> ```

## Running Locally (without Docker)

```bash
cd frontend
npm install
npm run dev
```

## Building for Production

```bash
npm run build
```

Output is placed in `dist/` and served via the Nginx container in the full Docker stack.

## Environment

The Vite dev server proxies API requests to the backend. See `vite.config.ts` for the proxy configuration.

## Default Credentials

| Role | Email | Password |
|---|---|---|
| Superuser | `admin@admin.com` | `admin123` |
| Tester | `tester@example.com` | `tester123` |
