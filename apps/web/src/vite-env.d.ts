/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PTM_API_URL?: string;
  readonly VITE_PTM_AUTH_ENABLED?: string;
  readonly VITE_PTM_DEMO_ENABLED?: string;
  readonly VITE_PTM_SYNC_HOST?: string;
  readonly VITE_PTM_SYNC_HTTP_PORT?: string;
  readonly VITE_PTM_SYNC_WS_PORT?: string;
  readonly VITE_PTM_SYNC_WS_URL?: string;
}
