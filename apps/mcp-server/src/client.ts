import {
  executeTrafficBoardCommandRequestSchema,
  type TrafficCommandMetadata,
  trafficBoardIdSchema,
  trafficBoardResponseSchema,
} from '@ptm/contracts';
import type { TrafficBoardCommand } from '@ptm/domain';

export interface PtmApiClientOptions {
  apiBaseUrl: string;
  apiServiceToken?: string;
}

export type TrafficBoardResponse = ReturnType<typeof trafficBoardResponseSchema.parse>;

export class PtmApiClient {
  private readonly apiBaseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(options: PtmApiClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, '');
    this.headers = options.apiServiceToken
      ? { authorization: `Bearer ${options.apiServiceToken}` }
      : {};
  }

  async getBoard(boardId: string): Promise<TrafficBoardResponse> {
    const parsedBoardId = trafficBoardIdSchema.parse(boardId);
    const response = await fetch(`${this.apiBaseUrl}/boards/${encodeURIComponent(parsedBoardId)}`, {
      headers: this.headers,
    });
    return trafficBoardResponseSchema.parse(await parseJsonResponse(response, 'load board'));
  }

  async executeCommand(
    boardId: string,
    command: TrafficBoardCommand,
    metadata: TrafficCommandMetadata = {}
  ): Promise<TrafficBoardResponse> {
    const parsedBoardId = trafficBoardIdSchema.parse(boardId);
    const commandId = metadata.commandId || createCommandId(command.type);
    const actorId = metadata.actorId || 'ptm-mcp-agent';
    const body = executeTrafficBoardCommandRequestSchema.parse({
      actorId,
      command,
      commandId,
      metadata: {
        ...metadata,
        actorId,
        commandId,
      },
    });
    const response = await fetch(`${this.apiBaseUrl}/boards/${encodeURIComponent(parsedBoardId)}/commands`, {
      method: 'POST',
      headers: { ...this.headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return trafficBoardResponseSchema.parse(await parseJsonResponse(response, `execute ${command.type}`));
  }
}

async function parseJsonResponse(response: Response, action: string): Promise<unknown> {
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = getErrorMessage(payload) || `Failed to ${action}: HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function getErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return undefined;
  const message = (payload as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
}

function createCommandId(action: string) {
  return `mcp:${action}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
