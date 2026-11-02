export interface PtmMcpConfig {
  apiBaseUrl: string;
  apiServiceToken?: string;
  defaultBoardId: string;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): PtmMcpConfig {
  return {
    apiBaseUrl: (env.PTM_MCP_API_URL || env.PTM_API_URL || 'http://localhost:4000/api').replace(/\/$/, ''),
    apiServiceToken: (env.PTM_MCP_API_SERVICE_TOKEN || env.PTM_AUTH_SERVICE_TOKEN)?.trim() || undefined,
    defaultBoardId: env.PTM_MCP_BOARD_ID || 'ptm-mvp',
  };
}
