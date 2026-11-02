# Dockerfile for PTM Sync Server
FROM node:24.11.0-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --omit=dev \
  && npm cache clean --force

COPY . .

RUN useradd -m -u 1001 ptm \
  && chown -R ptm:ptm /app

USER ptm

# Expose ports
# Default Y.js WebSocket port
EXPOSE 1234
# HTTP API port
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:3001/health || exit 1

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "server.js"]
