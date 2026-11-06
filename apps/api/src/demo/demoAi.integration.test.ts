import { demoSessionResponseSchema } from '@ptm/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { DemoRepository } from './demo.repository.js';
import { buildApp } from '../app.js';
import { getConfig } from '../config.js';
import type { FastifyInstance } from 'fastify';

const databaseUrl = process.env.PTM_TEST_DATABASE_URL;
const origin = 'https://ai.example.test';
const result = { verdict: 'pursue', confidence: 'high', topReasons: ['Test'], projectActions: [], allocationSuggestions: [], bottlenecks: [], financialRisks: [], deliveryHrRisks: [], assumptionsToVerify: [], nextScenarioToTry: 'Test' };

describe.skipIf(!databaseUrl)('demo AI spending limits', () => {
  let app: FastifyInstance;
  let pool: Pool;
  let repository: DemoRepository;
  let cookie: string;
  let boardId: string;
  let periodId: string;
  const sessionHashes: string[] = [];
  const request = () => app.inject({ method: 'POST', url: `/api/boards/${boardId}/periods/${periodId}/ai-opportunity-check`, headers: { origin, cookie } });
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    repository = new DemoRepository(pool);
    app = await buildApp(getConfig({ PTM_DATABASE_URL: databaseUrl, PTM_DEMO_ENABLED: 'true', CORS_ORIGIN: origin, PTM_DEMO_OPENAI_API_KEY: 'test-demo-key' }));
  });
  beforeEach(async () => {
    await pool.query('DELETE FROM demo_ai_reservations');
    await pool.query('DELETE FROM demo_ai_months');
    const session = await repository.create(`ai-test-${crypto.randomUUID()}`);
    sessionHashes.push(session.session.token_hash);
    cookie = `__Host-ptm-demo=${session.token}`;
    boardId = session.session.board_id;
    periodId = session.session.snapshot_json.activePeriodId;
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await app?.close();
    await pool.query('DELETE FROM demo_sessions WHERE token_hash=ANY($1)', [sessionHashes]);
    await pool.end();
  });

  it('reserves the monthly budget before a provider request and reconciles verified usage', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const ledger = await pool.query<{ reserved_nano: string }>('SELECT reserved_nano FROM demo_ai_months');
      expect(Number(ledger.rows[0].reserved_nano)).toBeGreaterThan(1000000);
      const body: unknown = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ max_completion_tokens: 4096 });
      expect(body).toMatchObject({ service_tier: 'default' });
      expect(body).toMatchObject({ reasoning_effort: 'none' });
      return new Response(JSON.stringify({ model: 'gpt-5.4-mini-2026-03-17', choices: [{ message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } }));
    });
    const response = await request();
    expect(response.statusCode).toBe(200);
    expect(response.json<unknown>()).toMatchObject({ mode: 'model' });
    const ledger = await pool.query<{ reserved_nano: string }>('SELECT reserved_nano FROM demo_ai_months');
    expect(Number(ledger.rows[0].reserved_nano)).toBe(525000);
    expect((await app.inject({ url: '/api/demo/session', headers: { cookie } })).json<unknown>()).toMatchObject({ aiRemaining: 2 });
    expect((await request()).statusCode).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retains uncertain reservations, never retries, and preserves attempts across reset', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('secret provider body test-demo-key'));
    const response = await request();
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('test-demo-key');
    const before = await pool.query<{ reserved_nano: string }>('SELECT reserved_nano FROM demo_ai_months');
    expect(Number(before.rows[0].reserved_nano)).toBeGreaterThan(1000000);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const reset = await app.inject({ method: 'POST', url: '/api/demo/reset', headers: { origin, cookie } });
    expect(reset.json<unknown>()).toMatchObject({ aiRemaining: 2 });
  });

  it('prevents concurrent requests from exceeding the final monthly reservation', async () => {
    const month = new Date().toISOString().slice(0, 7);
    await pool.query('INSERT INTO demo_ai_months(month,reserved_nano) VALUES($1,4999999999)', [month]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    const responses = await Promise.all([request(), request(), request()]);
    expect(responses.map((response) => response.statusCode)).toEqual([429, 429, 429]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    const ledger = await pool.query<{ reserved_nano: string }>('SELECT reserved_nano FROM demo_ai_months');
    expect(Number(ledger.rows[0].reserved_nano)).toBe(4999999999);
  });

  it('admits exactly one request when the remaining budget covers one reservation', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const reservation = (100000 + 4096) * 750 + 4096 * 4500;
    await pool.query('INSERT INTO demo_ai_months(month,reserved_nano) VALUES($1,$2)', [month, 5000000000 - reservation]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    const responses = await Promise.all([request(), request(), request()]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([429, 429, 503]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(Number((await pool.query<{ reserved_nano: string }>('SELECT reserved_nano FROM demo_ai_months')).rows[0].reserved_nano)).toBe(5000000000);
  });

  it('allows at most three provider attempts even after reset', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 500 }));
    expect((await request()).statusCode).toBe(503);
    const reset = await app.inject({ method: 'POST', url: '/api/demo/reset', headers: { origin, cookie } });
    boardId = demoSessionResponseSchema.parse(reset.json<unknown>()).boardId;
    expect((await request()).statusCode).toBe(503);
    expect((await request()).statusCode).toBe(503);
    const response = await request();
    expect(response.statusCode).toBe(429);
    expect(response.json<unknown>()).toMatchObject({ code: 'DEMO_AI_LIMIT' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('limits global concurrent calls across independent sessions', async () => {
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { await barrier; return new Response('{}'); });
    const pending = [request(), request()].map((promise) => Promise.resolve(promise));
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    const other = await repository.create(`other-${crypto.randomUUID()}`);
    sessionHashes.push(other.session.token_hash);
    const response = await app.inject({ method: 'POST', url: `/api/boards/${other.session.board_id}/periods/${periodId}/ai-opportunity-check`, headers: { origin, cookie: `__Host-ptm-demo=${other.token}` } });
    expect(response.statusCode).toBe(429);
    expect(response.json<unknown>()).toMatchObject({ code: 'DEMO_AI_BUSY' });
    release();
    await Promise.all(pending);
  });
});
