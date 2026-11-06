import { demoSessionResponseSchema, trafficBoardResponseSchema } from '@ptm/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { TrafficBoardService } from '../traffic/services/trafficBoard.service.js';
import { DemoRepository, hash } from './demo.repository.js';
import { buildApp } from '../app.js';
import { getConfig } from '../config.js';
import type { FastifyInstance } from 'fastify';

const databaseUrl = process.env.PTM_TEST_DATABASE_URL;
const origin = 'https://demo.example.test';

describe.skipIf(!databaseUrl)('guest demo isolation', () => {
  let app: FastifyInstance;
  let pool: Pool;
  let first: { boardId: string; expiresAt: string; aiRemaining: number };
  let firstCookie: string;
  let secondCookie: string;
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    app = await buildApp(getConfig({ PTM_DATABASE_URL: databaseUrl, PTM_DEMO_ENABLED: 'true', CORS_ORIGIN: origin, OPENAI_API_KEY: 'unused-ambient-key', PTM_OPENAI_API_KEY: 'unused-ordinary-key' }));
  });
  afterAll(async () => {
    await app?.close();
    const hashes = [firstCookie, secondCookie].filter(Boolean).map((cookie) => hash(cookie.split('=')[1]));
    await pool.query('DELETE FROM demo_sessions WHERE token_hash=ANY($1)', [hashes]);
    await pool.end();
  });

  it('creates isolated 24 hour sessions using secure opaque cookies', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/demo/session', headers: { origin } });
    expect(a.statusCode).toBe(200);
    first = demoSessionResponseSchema.parse(a.json<unknown>());
    firstCookie = String(a.headers['set-cookie']).split(';')[0];
    expect(a.headers['set-cookie']).toContain('HttpOnly');
    expect(a.headers['set-cookie']).toContain('Secure');
    expect(a.headers['set-cookie']).toContain('SameSite=Strict');
    expect(a.headers['set-cookie']).not.toContain('Domain=');
    expect(first.aiRemaining).toBe(3);
    const seeded = trafficBoardResponseSchema.parse((await app.inject({ url: `/api/boards/${first.boardId}`, headers: { cookie: firstCookie } })).json<unknown>());
    expect(seeded.snapshot.activePeriodId).toBe(new Date().toISOString().slice(0, 7));
    expect(Date.parse(first.expiresAt) - Date.now()).toBeGreaterThan(23 * 3600_000);
    const b = await app.inject({ method: 'POST', url: '/api/demo/session', headers: { origin } });
    secondCookie = String(b.headers['set-cookie']).split(';')[0];
    expect(demoSessionResponseSchema.parse(b.json<unknown>()).boardId).not.toBe(first.boardId);
    expect((await app.inject({ url: `/api/boards/${first.boardId}`, headers: { cookie: firstCookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/boards/${first.boardId}`, headers: { cookie: secondCookie } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/boards/default' })).statusCode).toBe(401);
    const stored = await pool.query<{ token_hash: string }>('SELECT token_hash FROM demo_sessions WHERE board_id=$1', [first.boardId]);
    expect(stored.rows[0].token_hash).not.toContain(firstCookie.split('=')[1]);
  });

  it('blocks foreign origins, administrative endpoints and same-board reset', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/demo/session', headers: { origin: 'https://evil.test' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/demo/session' })).statusCode).toBe(403);
    for (const url of ['/api/auth/session', '/api/auth/saml/metadata.xml', '/api/access/users', '/api/mcp']) {
      expect((await app.inject({ url, headers: { cookie: firstCookie } })).statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'POST', url: `/api/boards/${first.boardId}/reset`, headers: { origin, cookie: firstCookie } })).statusCode).toBe(404);
  });

  it('rejects the legacy reset command over HTTP', async () => {
    const before = await new DemoRepository(pool).find(first.boardId);
    const response = await app.inject({ method: 'POST', url: `/api/boards/${first.boardId}/commands`, headers: { origin, cookie: firstCookie }, payload: { commandId: crypto.randomUUID(), command: { type: 'board.reset' } } });
    expect(response.statusCode).toBe(400);
    expect(response.json<unknown>()).toMatchObject({ code: 'DEMO_RESET_REQUIRED' });
    expect(await new DemoRepository(pool).find(first.boardId)).toEqual(before);
  });

  it('rejects excessive capacity before executing a domain command or saving a snapshot', async () => {
    const before = await new DemoRepository(pool).find(first.boardId);
    const person = { ...before.snapshot.people[0], id: 'bounded-test-person', monthlyCostK: 101 };
    const command = await app.inject({ method: 'POST', url: `/api/boards/${first.boardId}/commands`, headers: { origin, cookie: firstCookie }, payload: { commandId: crypto.randomUUID(), command: { type: 'person.create', person, periodId: before.snapshot.activePeriodId } } });
    expect(command.statusCode).toBe(400);
    expect(command.json<unknown>()).toMatchObject({ code: 'DEMO_BOARD_LIMIT' });
    const snapshot = { ...before.snapshot, people: [person, ...before.snapshot.people] };
    const save = await app.inject({ method: 'PUT', url: `/api/boards/${first.boardId}`, headers: { origin, cookie: firstCookie }, payload: { snapshot, baseUpdatedAt: before.updatedAt } });
    expect(save.statusCode).toBe(400);
    expect(await new DemoRepository(pool).find(first.boardId)).toEqual(before);
  });

  it('rotates boards on reset and rejects requests carrying the stale board', async () => {
    const reset = await app.inject({ method: 'POST', url: '/api/demo/reset', headers: { origin, cookie: firstCookie } });
    expect(reset.statusCode).toBe(200);
    expect(demoSessionResponseSchema.parse(reset.json<unknown>()).boardId).not.toBe(first.boardId);
    expect(demoSessionResponseSchema.parse(reset.json<unknown>()).aiRemaining).toBe(3);
    expect((await app.inject({ method: 'GET', url: `/api/boards/${first.boardId}`, headers: { cookie: firstCookie } })).statusCode).toBe(403);
    first = demoSessionResponseSchema.parse(reset.json<unknown>());
  });

  it('keeps the app usable without a dedicated demo AI key', async () => {
    const board = trafficBoardResponseSchema.parse((await app.inject({ url: `/api/boards/${first.boardId}`, headers: { cookie: firstCookie } })).json<unknown>());
    const response = await app.inject({ method: 'POST', url: `/api/boards/${first.boardId}/periods/${board.snapshot.activePeriodId}/ai-opportunity-check`, headers: { origin, cookie: firstCookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json<unknown>()).toMatchObject({ code: 'DEMO_AI_UNAVAILABLE' });
    expect((await app.inject({ url: '/api/demo/session', headers: { cookie: firstCookie } })).json<unknown>()).toMatchObject({ aiRemaining: 3 });
  });

  it('does not recreate deleted boards from a request authorized before reset', async () => {
    const repository = new DemoRepository(pool);
    const previous = await repository.find(first.boardId);
    const session = await repository.authenticate(firstCookie);
    const next = await repository.reset(session.token_hash);
    await expect(repository.upsert(previous.boardId, previous.snapshot)).rejects.toMatchObject({ code: 'DEMO_SESSION_REQUIRED' });
    expect((await repository.find(next.board_id)).version).toBe(1);
    first.boardId = next.board_id;
  });

  it('rejects concurrent stale snapshot saves across service instances', async () => {
    const repositoryA = new DemoRepository(pool);
    const repositoryB = new DemoRepository(pool);
    const a = new TrafficBoardService(repositoryA);
    const b = new TrafficBoardService(repositoryB);
    const board = await a.getOrCreate(first.boardId);
    let count = 0;
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    for (const repository of [repositoryA, repositoryB]) {
      const find = repository.find.bind(repository);
      vi.spyOn(repository, 'find').mockImplementation(async (id) => {
        const current = await find(id);
        count += 1;
        if (count === 2) release();
        await barrier;
        return current;
      });
    }
    const attempts = await Promise.allSettled([
      a.save(first.boardId, { ...board.snapshot, activeTileUnitId: 'money-5k' }, { baseUpdatedAt: board.updatedAt }),
      b.save(first.boardId, board.snapshot, { baseUpdatedAt: board.updatedAt }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
  });

  it('reports an unhealthy database without exposing connection details', async () => {
    const query = vi.spyOn(Pool.prototype, 'query').mockRejectedValueOnce(new Error('internal database detail'));
    try {
      const response = await app.inject('/api/health');
      expect(response.statusCode).toBe(503);
      expect(response.json<unknown>()).toMatchObject({ ok: false });
      expect(response.body).not.toContain('internal database detail');
    } finally { query.mockRestore(); }
  });

  it('denies expired sessions', async () => {
    await pool.query('UPDATE demo_sessions SET expires_at=NOW()-INTERVAL \'1 second\' WHERE board_id=$1', [first.boardId]);
    expect((await app.inject({ url: `/api/boards/${first.boardId}`, headers: { cookie: firstCookie } })).statusCode).toBe(401);
  });
});
