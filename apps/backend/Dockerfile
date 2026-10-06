# syntax=docker/dockerfile:1.7
#
# Build context is the REPOSITORY ROOT, not apps/backend, because the backend
# image must also ship the database migrations that live at the repository-root
# `migrations/` directory (DATABASE-owned). Shipping them in the image lets the
# VPS run migrations without checking out the source repository.
#
#   docker build -f apps/backend/Dockerfile -t hosifest-backend:local .

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Manifest-only layer so dependency installation is cached independently of source.
COPY apps/backend/package.json apps/backend/pnpm-lock.yaml* ./
RUN --mount=type=cache,id=hosifest-backend-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY apps/backend/ ./
# Repository-root migrations/ (DATABASE-owned) travel with the image.
COPY migrations/ ./migrations/
COPY seeders/ ./seeders/

RUN pnpm build \
 && pnpm prune --prod

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g npm@latest \
 && npm cache clean --force

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/seeders ./seeders

# node:22-bookworm-slim ships an unprivileged `node` user (uid/gid 1000).
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

# Entry point matches the backend `start` script (node dist/server.js).
CMD ["node", "dist/server.js"]
