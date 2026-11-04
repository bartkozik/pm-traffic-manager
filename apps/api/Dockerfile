FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@8.15.4
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/sync-server/package.json apps/sync-server/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps/api apps/api
COPY packages packages
RUN pnpm --filter @ptm/api build

FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PTM_API_HOST=0.0.0.0
ENV PTM_API_PORT=4000

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/apps/api/dist ./dist
RUN useradd -m -u 1001 ptm \
  && chown -R ptm:ptm /app

USER ptm
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:4000/api/health || exit 1

CMD ["node", "dist/main.cjs"]
