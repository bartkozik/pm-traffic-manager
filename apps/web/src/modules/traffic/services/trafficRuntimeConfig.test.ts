import { describe, expect, it } from 'vitest';
import { getSyncServerWsUrl } from './trafficRuntimeConfig';

describe('traffic runtime config', () => {
  it('uses an absolute sync WebSocket URL when configured', () => {
    expect(getSyncServerWsUrl({
      host: '127.0.0.1',
      wsPort: 3000,
      wsUrl: 'wss://ptm.example.com/yjs/',
    })).toBe('wss://ptm.example.com/yjs');
  });

  it('keeps the local host and port fallback for development', () => {
    expect(getSyncServerWsUrl({
      host: '127.0.0.1',
      wsPort: 3000,
    })).toBe('ws://127.0.0.1:3000');
  });
});
