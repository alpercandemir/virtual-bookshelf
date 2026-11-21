# syntax=docker/dockerfile:1

# --- Stage 1: Build shared, backend, and frontend ---
FROM node:22-bookworm-slim AS builder

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY backend/package.json backend/tsconfig.json ./backend/
COPY frontend/package.json frontend/tsconfig.json frontend/vite.config.ts ./frontend/

# Install workspace dependencies (allow Prisma & esbuild install scripts cleanly)
RUN npm ci --foreground-scripts

# Copy source trees
COPY packages/shared/src ./packages/shared/src
COPY backend/prisma ./backend/prisma
COPY backend/src ./backend/src
COPY frontend/index.html ./frontend/index.html
COPY frontend/public ./frontend/public
COPY frontend/src ./frontend/src

# Build all packages & generate Prisma Client for linux target
RUN npm run build --workspace=packages/shared \
  && npm run db:generate --workspace=backend \
  && npm run build --workspace=backend \
  && npm run build --workspace=frontend

# --- Stage 2: Lean production runtime ---
FROM node:22-bookworm-slim AS runner

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV DATABASE_URL=file:/data/bookshelf.db
ENV UPLOADS_DIR=/data/uploads
ENV STATIC_DIR=/app/frontend/dist
ENV COOKIE_SECURE=false

# Copy workspace manifests & lockfile and install production deps (+ prisma CLI for schema sync)
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /data/uploads \
  && chown -R node:node /app /data

USER node

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
