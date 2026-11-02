import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PtmApiClient } from './client.js';
import type { PtmMcpConfig } from './config.js';
import { registerPtmTools } from './tools.js';

export function createPtmMcpServer(config: PtmMcpConfig) {
  const server = new McpServer({
    name: 'ptm-mcp-server',
    version: '1.0.0',
  }, {
    capabilities: {
      logging: {},
      tools: {},
    },
  });

  registerPtmTools(server, new PtmApiClient({
    apiBaseUrl: config.apiBaseUrl,
    apiServiceToken: config.apiServiceToken,
  }), config);
  return server;
}
