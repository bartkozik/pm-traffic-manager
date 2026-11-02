export interface TrafficSyncServerConfig {
  host: string;
  httpPort: number;
  wsPort: number;
  wsUrl?: string;
}

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const defaultSyncServerConfig: TrafficSyncServerConfig = {
  host: import.meta.env.VITE_PTM_SYNC_HOST || 'localhost',
  wsPort: readNumber(import.meta.env.VITE_PTM_SYNC_WS_PORT, 3000),
  httpPort: readNumber(import.meta.env.VITE_PTM_SYNC_HTTP_PORT, 3001),
  wsUrl: normalizeWsUrl(import.meta.env.VITE_PTM_SYNC_WS_URL),
};

export function getSyncServerWsUrl(
  config: Pick<TrafficSyncServerConfig, 'host' | 'wsPort' | 'wsUrl'> = defaultSyncServerConfig
) {
  const wsUrl = normalizeWsUrl(config.wsUrl);
  if (wsUrl) return wsUrl;
  return `ws://${config.host}:${config.wsPort}`;
}

function normalizeWsUrl(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return undefined;
  return trimmedValue.replace(/\/+$/, '');
}
