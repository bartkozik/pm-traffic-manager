FROM node:24.11.0-bookworm-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@10.13.1
WORKDIR /app
ARG VITE_PTM_API_URL=http://localhost:4000/api
ARG VITE_PTM_AUTH_ENABLED=false
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
COPY apps/sync-server/package.json apps/sync-server/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @ptm/web build:prod

FROM nginx:1.21.0 AS production
ARG BUILD_VERSION
ENV APP_VERSION=$BUILD_VERSION
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.template
COPY apps/web/entrypoint.sh /entrypoint.sh
EXPOSE 80
CMD ["/bin/sh",  "/entrypoint.sh"]
