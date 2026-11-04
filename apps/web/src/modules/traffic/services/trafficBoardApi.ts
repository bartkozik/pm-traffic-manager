import type {
  OpportunityCheckResponse,
  TrafficBoardRealtimeEvent,
} from '@ptm/contracts';
import type { FxRateSnapshot, MoveTrafficAllocation, TrafficBoardCommand } from '@ptm/domain';
import type { TrafficSnapshot } from '../models/traffic.model';
import { apiBaseUrl, apiFetch } from '@/core/api/apiClient';
import { demoEnabled, DEMO_REFRESH_EVENT } from '@/modules/demo/demoRuntime';

export interface TrafficBoardResponse {
  boardId: string;
  snapshot: TrafficSnapshot;
  updatedAt: string;
  version: number;
}

export class TrafficBoardApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly current?: TrafficBoardResponse
  ) {
    super(message);
    this.name = 'TrafficBoardApiError';
  }
}

export async function loadTrafficBoardSnapshot(boardId: string): Promise<TrafficBoardResponse> {
  const response = await apiFetch(`${apiBaseUrl}/boards/${encodeURIComponent(boardId)}`);
  if (!response.ok) {
    throw new Error(`Failed to load board snapshot: ${response.status}`);
  }
  return response.json() as Promise<TrafficBoardResponse>;
}

export async function saveTrafficBoardSnapshot(
  boardId: string,
  snapshot: TrafficSnapshot,
  baseUpdatedAt?: string | null
): Promise<TrafficBoardResponse> {
  const response = await apiFetch(`${apiBaseUrl}/boards/${encodeURIComponent(boardId)}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ baseUpdatedAt: baseUpdatedAt || undefined, snapshot }),
  });
  if (!response.ok) {
    let current: TrafficBoardResponse | undefined;
    try {
      const payload = await response.json() as { current?: TrafficBoardResponse; message?: string };
      current = payload.current;
      throw new TrafficBoardApiError(
        payload.message || `Failed to save board snapshot: ${response.status}`,
        response.status,
        current
      );
    } catch (error) {
      if (error instanceof TrafficBoardApiError) throw error;
      throw new TrafficBoardApiError(`Failed to save board snapshot: ${response.status}`, response.status);
    }
  }
  return response.json() as Promise<TrafficBoardResponse>;
}

export async function moveTrafficBoardAllocations(
  boardId: string,
  periodId: string,
  moves: MoveTrafficAllocation[]
): Promise<TrafficBoardResponse> {
  const response = await apiFetch(`${apiBaseUrl}/boards/${encodeURIComponent(boardId)}/allocations/move`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ periodId, moves }),
  });
  if (!response.ok) {
    throw new TrafficBoardApiError(`Failed to move allocations: ${response.status}`, response.status);
  }
  return response.json() as Promise<TrafficBoardResponse>;
}

export async function executeTrafficBoardCommand(
  boardId: string,
  command: TrafficBoardCommand,
  commandId = createCommandId(command.type)
): Promise<TrafficBoardResponse> {
  const response = await apiFetch(`${apiBaseUrl}/boards/${encodeURIComponent(boardId)}/commands`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ command, commandId }),
  });
  if (!response.ok) {
    throw new TrafficBoardApiError(`Failed to execute board command: ${response.status}`, response.status);
  }
  return response.json() as Promise<TrafficBoardResponse>;
}

export interface TrafficBoardRealtimeConnection {
  close: () => void;
  sendCommand: (command: TrafficBoardCommand, commandId?: string) => boolean;
}

interface TrafficBoardRealtimeHandlers {
  onEvent: (event: TrafficBoardRealtimeEvent) => void;
  onStatus?: (status: 'connecting' | 'connected' | 'disconnected') => void;
  onError?: (error: Event) => void;
}

export function connectTrafficBoardRealtime(
  boardId: string,
  handlers: TrafficBoardRealtimeHandlers
): TrafficBoardRealtimeConnection | null {
  if (typeof WebSocket === 'undefined') return null;

  handlers.onStatus?.('connecting');
  const socket = new WebSocket(getRealtimeUrl(boardId));

  socket.addEventListener('open', () => {
    handlers.onStatus?.('connected');
  });
  socket.addEventListener('close', () => {
    handlers.onStatus?.('disconnected');
  });
  socket.addEventListener('error', (event) => {
    handlers.onError?.(event);
  });
  socket.addEventListener('message', (event) => {
    try {
      handlers.onEvent(JSON.parse(String(event.data)) as TrafficBoardRealtimeEvent);
    } catch {
      // Ignore malformed realtime messages; REST load remains the recovery path.
    }
  });

  return {
    close: () => socket.close(),
    sendCommand: (command, commandId = createCommandId(command.type)) => {
      if (socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify({
        type: 'command',
        command,
        commandId,
      }));
      return true;
    },
  };
}

export async function runOpportunityCheck(
  boardId: string,
  periodId: string
): Promise<OpportunityCheckResponse> {
  const response = await apiFetch(`${apiBaseUrl}/boards/${encodeURIComponent(boardId)}/periods/${encodeURIComponent(periodId)}/ai-opportunity-check`, {
    method: 'POST',
  });
  if (demoEnabled) window.dispatchEvent(new Event(DEMO_REFRESH_EVENT));
  if (!response.ok) {
    let message = `Failed to run AI opportunity check: ${response.status}`;
    try {
      const payload = await response.json() as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      // Keep the status-based error when the API response is not JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<OpportunityCheckResponse>;
}

export async function fetchFxRateToPln(currency: string, date: string): Promise<FxRateSnapshot> {
  const params = new URLSearchParams({ currency, date });
  const response = await apiFetch(`${apiBaseUrl}/fx-rates/pln?${params.toString()}`);
  if (!response.ok) {
    let message = `Failed to fetch FX rate: ${response.status}`;
    try {
      const payload = await response.json() as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      // Keep status-based error when the API response is not JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<FxRateSnapshot>;
}

function getRealtimeUrl(boardId: string) {
  const base = typeof window === 'undefined'
    ? new URL(apiBaseUrl)
    : new URL(apiBaseUrl, window.location.origin);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = `${base.pathname.replace(/\/$/, '')}/boards/${encodeURIComponent(boardId)}/realtime`;
  base.search = '';
  base.hash = '';
  return base.toString();
}

function createCommandId(action: string) {
  return `${action}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
