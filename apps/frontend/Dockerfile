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
FROM nginx:1.29-alpine AS runner

# Pull latest patched Alpine libs (c-ares, curl, openssl, expat, ...) —
# base image tags lag behind security releases.
RUN apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*

# nginx resolves the backend at request time via Docker's embedded DNS, so a
# backend restart does not cascade into an nginx restart.
#
# The official nginx image runs envsubst over /etc/nginx/templates/*.template
# at container start, so ${BACKEND_UPSTREAM} is substituted from the
# environment. NGINX_ENVSUBST_FILTER restricts substitution to that variable
# only, so nginx's own runtime variables ($host, $uri, $scheme, ...) survive.
COPY nginx/default.conf /etc/nginx/templates/default.conf.template
ENV BACKEND_UPSTREAM=backend:3000
ENV NGINX_ENVSUBST_FILTER=BACKEND_UPSTREAM

# The Next.js standalone server runs on :3000 inside this container; nginx
# serves it and proxies /api to the backend.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["sh", "-c", "node server.js & exec nginx -g 'daemon off;'"]
