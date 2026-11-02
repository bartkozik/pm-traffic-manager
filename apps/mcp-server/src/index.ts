import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getConfig } from './config.js';
import { createPtmMcpServer } from './server.js';

const server = createPtmMcpServer(getConfig());
const transport = new StdioServerTransport();

await server.connect(transport);
