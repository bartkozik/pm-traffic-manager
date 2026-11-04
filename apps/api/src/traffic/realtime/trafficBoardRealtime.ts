import { DemoError, DemoRepository } from '../../demo/demo.repository.js';
import { IncomingMessage } from 'node:http';
import { Duplex } from 'node:stream';
import { FastifyInstance } from 'fastify';
import {
  trafficBoardIdSchema,
  trafficBoardRealtimeClientMessageSchema,
  trafficBoardRealtimeEventSchema,
} from '@ptm/contracts';
import { getTrafficBoardCommandAuditAction } from '@ptm/domain';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import { TrafficBoardRecord } from '../repositories/trafficBoard.repository.js';
import { TrafficBoardService } from '../services/trafficBoard.service.js';
import { AuthService } from '../../auth/auth.service.js';
import { isAllowedBrowserOrigin } from '../../auth/browserOrigin.js';

export class TrafficBoardRealtimeHub {
  private readonly clientsByActorId = new Map<string, Set<WebSocket>>();
  private readonly clientsByBoardId = new Map<string, Set<WebSocket>>();
  private readonly webSocketServer: WebSocketServer;

  constructor(
    private readonly service: TrafficBoardService,
    private readonly authService?: AuthService,
    private readonly allowedOrigin?: string,
    private readonly demoRepository?: DemoRepository
  ) {
    this.webSocketServer = new WebSocketServer({ noServer: true, maxPayload: demoRepository ? 524288 : 1048576 });
  }

  attach(app: FastifyInstance) {
    app.server.on('upgrade', (request, socket, head) => {
      void this.handleUpgrade(request, socket, head);
    });

    this.webSocketServer.on('connection', (
      webSocket: WebSocket,
      _request: IncomingMessage,
      boardId: string,
      actorId?: string,
      sessionExpiresAt?: number
    ) => {
      void this.handleConnection(webSocket, boardId, actorId, sessionExpiresAt);
    });

    app.addHook('onClose', async () => {
      await new Promise<void>((resolve) => {
        this.webSocketServer.close(() => resolve());
      });
    });
  }

  private async handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const boardId = parseRealtimeBoardId(request);
    if (!boardId) {
      closeUpgradeSocket(socket);
      return;
    }
    if ((this.demoRepository && request.headers.origin !== this.allowedOrigin) || (this.authService?.enabled && !isAllowedBrowserOrigin(request.headers.origin, this.allowedOrigin))) {
      closeUpgradeSocket(socket, 403, 'Forbidden');
      return;
    }

    try {
      const demoSession = await this.demoRepository?.authenticate(request.headers.cookie, boardId);
      const actorId = demoSession?.token_hash ?? await this.authService?.getRequestActor(
        request.headers.cookie,
        request.headers.authorization
      );
      if (this.authService?.enabled && !actorId) {
        closeUpgradeSocket(socket, 401, 'Unauthorized');
        return;
      }
      const sessionExpiresAt = demoSession?.expires_at.getTime() ?? this.authService?.getSessionExpiresAt(request.headers.cookie);
      if (demoSession && (this.webSocketServer.clients.size >= 200 || (this.clientsByActorId.get(demoSession.token_hash)?.size ?? 0) >= 4)) {
        closeUpgradeSocket(socket, 429, 'Too Many Requests');
        return;
      }

      this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        this.webSocketServer.emit('connection', webSocket, request, boardId, actorId, sessionExpiresAt);
      });
    } catch (error) {
      if (error instanceof DemoError) {
        closeUpgradeSocket(socket, error.statusCode, error.statusCode === 401 ? 'Unauthorized' : 'Forbidden');
        return;
      }
      closeUpgradeSocket(socket, 503, 'Service Unavailable');
    }
  }

  broadcastBoardUpdated(record: TrafficBoardRecord, action: string, commandId?: string) {
    this.broadcast(record.boardId, {
      type: 'board.updated',
      action,
      boardId: record.boardId,
      commandId,
      snapshot: record.snapshot,
      updatedAt: record.updatedAt,
      version: record.version,
    });
  }

  disconnectActor(actorId: string) {
    const clients = this.clientsByActorId.get(actorId.toLowerCase());
    clients?.forEach((client) => client.close(1008, 'Application access disabled.'));
  }

  private async handleConnection(
    webSocket: WebSocket,
    boardId: string,
    actorId?: string,
    sessionExpiresAt?: number
  ) {
    const clients = this.clientsByBoardId.get(boardId) ?? new Set<WebSocket>();
    clients.add(webSocket);
    this.clientsByBoardId.set(boardId, clients);
    const actorClients = actorId
      ? this.clientsByActorId.get(actorId.toLowerCase()) ?? new Set<WebSocket>()
      : undefined;
    if (actorId && actorClients) {
      actorClients.add(webSocket);
      this.clientsByActorId.set(actorId.toLowerCase(), actorClients);
    }

    const expirationTimer = sessionExpiresAt
      ? setTimeout(() => webSocket.close(1008, 'Session expired.'), Math.max(0, sessionExpiresAt - Date.now()))
      : undefined;

    webSocket.on('close', () => {
      if (expirationTimer) clearTimeout(expirationTimer);
      clients.delete(webSocket);
      if (clients.size === 0) this.clientsByBoardId.delete(boardId);
      if (actorId && actorClients) {
        actorClients.delete(webSocket);
        if (actorClients.size === 0) this.clientsByActorId.delete(actorId.toLowerCase());
      }
    });

    let windowStart = Date.now();
    let messageCount = 0;
    let pendingCommands = 0;
    webSocket.on('error', () => webSocket.close());
    webSocket.on('message', (data) => {
      if (this.demoRepository) {
        if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); messageCount = 0; }
        messageCount += 1;
        if (messageCount > 30 || pendingCommands >= 5) { webSocket.close(1008, 'Demo realtime limit reached.'); return; }
      }
      pendingCommands += 1;
      void this.handleClientMessage(webSocket, boardId, data, actorId).finally(() => { pendingCommands -= 1; });
    });

    try {
      const record = await this.service.getOrCreate(boardId);
      sendJson(webSocket, {
        type: 'board.snapshot',
        boardId: record.boardId,
        snapshot: record.snapshot,
        updatedAt: record.updatedAt,
        version: record.version,
      });
    } catch (error) {
      sendJson(webSocket, {
        type: 'command.error',
        boardId,
        message: error instanceof Error ? error.message : 'Unable to load board snapshot.',
      });
      webSocket.close(1011, 'Unable to load board snapshot.');
    }
  }

  private async handleClientMessage(webSocket: WebSocket, boardId: string, data: RawData, actorId?: string) {
    let message: unknown;
    try {
      message = JSON.parse(data.toString());
    } catch {
      sendJson(webSocket, {
        type: 'command.error',
        boardId,
        message: 'Invalid JSON message.',
      });
      return;
    }

    const parsed = trafficBoardRealtimeClientMessageSchema.safeParse(message);
    if (!parsed.success) {
      sendJson(webSocket, {
        type: 'command.error',
        boardId,
        message: 'Invalid realtime command message.',
      });
      return;
    }

    try {
      const record = await this.service.executeCommand(boardId, parsed.data.command, {
        actorId: actorId || parsed.data.actorId,
        commandId: parsed.data.commandId,
      });
      sendJson(webSocket, {
        type: 'command.ack',
        boardId: record.boardId,
        commandId: parsed.data.commandId,
        updatedAt: record.updatedAt,
        version: record.version,
      });
      this.broadcastBoardUpdated(record, getTrafficBoardCommandAuditAction(parsed.data.command), parsed.data.commandId);
    } catch (error) {
      sendJson(webSocket, {
        type: 'command.error',
        boardId,
        commandId: parsed.data.commandId,
        message: error instanceof Error ? error.message : 'Realtime command failed.',
      });
    }
  }

  private broadcast(boardId: string, event: unknown) {
    const parsed = trafficBoardRealtimeEventSchema.safeParse(event);
    if (!parsed.success) {
      throw new Error('Invalid traffic board realtime event.');
    }

    const payload = JSON.stringify(parsed.data);
    this.clientsByBoardId.get(boardId)?.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }
}

function sendJson(webSocket: WebSocket, event: unknown) {
  const parsed = trafficBoardRealtimeEventSchema.safeParse(event);
  if (!parsed.success) {
    throw new Error('Invalid traffic board realtime event.');
  }

  if (webSocket.readyState === WebSocket.OPEN) {
    webSocket.send(JSON.stringify(parsed.data));
  }
}

function parseRealtimeBoardId(request: IncomingMessage) {
  if (!request.url) return null;

  const url = new URL(request.url, 'http://localhost');
  const match = url.pathname.match(/^\/api\/boards\/([^/]+)\/realtime$/);
  if (!match) return null;

  try {
    const parsed = trafficBoardIdSchema.safeParse(decodeURIComponent(match[1]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function closeUpgradeSocket(socket: Duplex, status = 404, statusText = 'Not Found') {
  socket.write(`HTTP/1.1 ${status} ${statusText}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}
