import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { buildApp } from '../app.js';
import { getConfig } from '../config.js';
import { DemoRepository } from './demo.repository.js';
import type { FastifyInstance } from 'fastify';

const databaseUrl = process.env.PTM_TEST_DATABASE_URL;
const origin = 'https://realtime.example.test';

describe.skipIf(!databaseUrl)('demo realtime authorization', () => {
  let app: FastifyInstance;
  let pool: Pool;
  let repository: DemoRepository;
  let endpoint: string;
  let first: Awaited<ReturnType<DemoRepository['create']>>;
  let second: Awaited<ReturnType<DemoRepository['create']>>;
  const sockets: WebSocket[] = [];
  function connect(boardId: string, token?: string, requestOrigin = origin) {
    const socket = new WebSocket(`${endpoint}/api/boards/${boardId}/realtime`, { headers: { Origin: requestOrigin, ...(token ? { Cookie: `__Host-ptm-demo=${token}` } : {}) } });
    sockets.push(socket);
    return socket;
  }
  async function rejection(socket: WebSocket) {
    return new Promise<number>((resolve, reject) => {
      socket.on('unexpected-response', (_request, response) => { response.resume(); socket.close(); resolve(response.statusCode!); });
      socket.on('error', () => {});
      socket.on('open', () => { socket.close(); reject(new Error('Unauthorized websocket was accepted.')); });
    });
  }
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    repository = new DemoRepository(pool);
    app = await buildApp(getConfig({ PTM_DATABASE_URL: databaseUrl, PTM_DEMO_ENABLED: 'true', CORS_ORIGIN: origin }));
    endpoint = (await app.listen({ host: '127.0.0.1', port: 0 })).replace('http:', 'ws:');
    first = await repository.create(`ws-first-${crypto.randomUUID()}`);
    second = await repository.create(`ws-second-${crypto.randomUUID()}`);
  });
  afterAll(async () => {
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.terminate();
    await app?.close();
    await pool.query('DELETE FROM demo_sessions WHERE token_hash=ANY($1)', [[first?.session.token_hash, second?.session.token_hash].filter(Boolean)]);
    await pool.end();
  });

  it('rejects missing cookies, cross-guest boards and foreign origins', async () => {
    expect(await rejection(connect(first.session.board_id))).toBe(401);
    expect(await rejection(connect(first.session.board_id, second.token))).toBe(403);
    expect(await rejection(connect(first.session.board_id, first.token, 'https://evil.example'))).toBe(403);
  });

  it('rejects malformed board encodings without crashing the server', async () => {
    expect(await rejection(connect('%E0%A4%A', first.token))).toBe(404);
    expect((await app.inject('/api/health')).statusCode).toBe(200);
  });

  it('rejects the legacy reset command over WebSocket', async () => {
    const socket = connect(first.session.board_id, first.token);
    await once(socket, 'message');
    const before = await repository.find(first.session.board_id);
    const next = once(socket, 'message');
    socket.send(JSON.stringify({ type: 'command', commandId: crypto.randomUUID(), command: { type: 'board.reset' } }));
    const response = JSON.parse((await next)[0].toString());
    expect(response.type).toBe('command.error');
    expect(response.message).toContain('Reset demo');
    expect(await repository.find(first.session.board_id)).toEqual(before);
    const closed = once(socket, 'close');
    socket.close();
    await closed;
  });

  it('delivers only the owned snapshot and closes existing connections on reset', async () => {
    const socket = connect(first.session.board_id, first.token);
    const [message] = await once(socket, 'message');
    expect(JSON.parse(message.toString()).boardId).toBe(first.session.board_id);
    const closed = once(socket, 'close');
    const reset = await app.inject({ method: 'POST', url: '/api/demo/reset', headers: { origin, cookie: `__Host-ptm-demo=${first.token}` } });
    expect(reset.statusCode).toBe(200);
    expect((await closed)[0]).toBe(1008);
    expect(await rejection(connect(first.session.board_id, first.token))).toBe(403);
    first.session.board_id = reset.json().boardId;
  });

  it('checks session expiry on every websocket command', async () => {
    const socket = connect(second.session.board_id, second.token);
    await once(socket, 'message');
    await pool.query("UPDATE demo_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1", [second.session.token_hash]);
    const message = once(socket, 'message');
    socket.send(JSON.stringify({ type: 'command', commandId: crypto.randomUUID(), command: { type: 'settings.setActiveTileUnit', tileUnitId: 'money-5k' } }));
    const error = JSON.parse((await message)[0].toString());
    expect(error.type).toBe('command.error');
    expect(error.message).toContain('Start a new demo session');
    const stored = await pool.query('SELECT version FROM demo_sessions WHERE token_hash=$1', [second.session.token_hash]);
    expect(stored.rows[0].version).toBe(1);
    socket.close();
  });
  it('caps simultaneous connections per guest', async () => {
    const connected: WebSocket[] = [];
    for (let index = 0; index < 4; index += 1) {
      const socket = connect(first.session.board_id, first.token);
      await once(socket, 'message');
      connected.push(socket);
    }
    expect(await rejection(connect(first.session.board_id, first.token))).toBe(429);
    await Promise.all(connected.map(async (socket) => { const closed = once(socket, 'close'); socket.close(); await closed; }));
  });

  it('closes clients exceeding the message rate', async () => {
    const socket = connect(first.session.board_id, first.token);
    await once(socket, 'message');
    const closed = once(socket, 'close');
    for (let index = 0; index < 31; index += 1) socket.send('{');
    expect((await closed)[0]).toBe(1008);
  });

  it('rejects oversized frames without an unhandled socket error', async () => {
    const socket = connect(first.session.board_id, first.token);
    await once(socket, 'message');
    const closed = once(socket, 'close');
    socket.send('x'.repeat(524289));
    expect((await closed)[0]).toBe(1009);
    expect((await app.inject('/api/health')).statusCode).toBe(200);
  });

});
