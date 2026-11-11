FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@8.15.4
WORKDIR /app
ARG VITE_PTM_API_URL=http://localhost:4000/api
ARG VITE_PTM_AUTH_ENABLED=false
ARG VITE_PTM_DEMO_ENABLED=false
ENV VITE_PTM_DEMO_ENABLED=$VITE_PTM_DEMO_ENABLED
ARG VITE_PTM_SYNC_HOST=localhost
ARG VITE_PTM_SYNC_WS_PORT=3000
ARG VITE_PTM_SYNC_HTTP_PORT=3001
ARG VITE_PTM_SYNC_WS_URL=
ENV VITE_PTM_API_URL=$VITE_PTM_API_URL
ENV VITE_PTM_AUTH_ENABLED=$VITE_PTM_AUTH_ENABLED
ENV VITE_PTM_SYNC_HOST=$VITE_PTM_SYNC_HOST
ENV VITE_PTM_SYNC_WS_PORT=$VITE_PTM_SYNC_WS_PORT
ENV VITE_PTM_SYNC_HTTP_PORT=$VITE_PTM_SYNC_HTTP_PORT
ENV VITE_PTM_SYNC_WS_URL=$VITE_PTM_SYNC_WS_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY apps/sync-server/package.json apps/sync-server/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm --filter @ptm/web build

FROM ghcr.io/bartkozik/portfolio-infra@sha256:1a23c66865a1e81113270900934e615f34bd8a05be409a6a7ddd5272d46bd35d AS production
COPY --from=builder /app/apps/web/dist /srv
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
ENV XDG_CONFIG_HOME=/tmp/config
ENV XDG_DATA_HOME=/tmp/data
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
