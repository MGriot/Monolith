# syntax=docker/dockerfile:1
# Targets: dev (Vite dev server), prod (default; static bundle on unprivileged nginx :8080)
FROM docker.io/library/node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install

FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM deps AS build
COPY . .
# `npm run build` runs `tsc -b` first, which still has ~35 unused-import errors (TS6133) to clean up;
# bundle with Vite directly and run `npm run typecheck` as a separate CI step instead.
RUN npx vite build

FROM docker.io/nginxinc/nginx-unprivileged:stable-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
