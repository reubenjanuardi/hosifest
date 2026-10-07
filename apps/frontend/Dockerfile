# syntax=docker/dockerfile:1

# ---- deps -------------------------------------------------------------------
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# ---- build ------------------------------------------------------------------
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

# NEXT_PUBLIC_* values are inlined at build time, so they must be PUBLIC values
# only (the backend origin as reached through this frontend). No secrets here.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next.config.mjs sets `output: 'standalone'`, which is what the runtime stage
# below depends on.
RUN pnpm build

# ---- runtime ----------------------------------------------------------------
# nginx + Node in ONE image: nginx serves static assets and reverse-proxies,
# while the Next.js standalone server runs on :3000 behind it. nginx:alpine has
# no Node, so the standalone output is copied in from a node stage rather than
# running `node server.js` against an image that cannot execute it.
FROM nginx:1.29-alpine AS runner

# Pull latest patched Alpine libs (c-ares, curl, openssl, expat, ...) —
# base image tags lag behind security releases.
RUN apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*

# Node runtime for the Next.js standalone server. Pinned to the same major as
# the build stages so the standalone output's ABI matches.
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/bin/node /usr/bin/node

# nginx resolves the backend at request time via Docker's embedded DNS, so a
# backend restart does not cascade into an nginx restart.
#
# /etc/nginx/templates/*.template is rendered by the entrypoint into
# /etc/nginx/conf.d/*.conf, the directory nginx.conf actually includes. That
# render REPLACES the stock conf.d/default.conf (listen :80) with this config's
# `listen 8080`, which is the port the compose publish and /healthcheck target.
COPY nginx/default.conf /etc/nginx/templates/default.conf.template
ENV BACKEND_UPSTREAM=backend:3000
ENV NGINX_ENVSUBST_FILTER=BACKEND_UPSTREAM

# The Next.js standalone server runs on :3000 inside this container; nginx
# serves it and proxies /api to the backend.
#
# HOSTNAME=0.0.0.0 is REQUIRED. server.js binds to `process.env.HOSTNAME`,
# and Docker sets HOSTNAME to the container ID, which resolves to the eth0
# address (e.g. 172.17.0.3:3000). The loopback proxy below then gets 502
# because nothing is listening on 127.0.0.1:3000.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

# node runs in the background; nginx takes over PID 1 via exec.
#
# The explicit /docker-entrypoint.sh call is REQUIRED, not decorative: that
# script only runs /docker-entrypoint.d/*.sh (including the envsubst step that
# renders templates/ into conf.d/) when $1 is "nginx" or "nginx-debug". Wrapping
# this in plain `sh -c "... nginx ..."` would make $1 = "sh", envsubst would be
# skipped, and the stock conf.d/default.conf (listen :80) would keep serving
# while /healthz probes 8080 — the container goes unhealthy with no clue why.
CMD ["sh", "-c", "node server.js & exec /docker-entrypoint.sh nginx -g 'daemon off;'"]
