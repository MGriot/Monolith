# syntax=docker/dockerfile:1
# Targets: dev (Vite dev server), prod (default; static bundle on unprivileged nginx :8080)
FROM docker.io/library/node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
# strict: a lockfile out of sync with package.json fails the build instead of resolving fresh versions
RUN npm ci

FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM deps AS build
COPY . .
# `npm run build` = `tsc -b` (type check) + vite build.
RUN npm run build

FROM docker.io/nginxinc/nginx-unprivileged:stable-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
