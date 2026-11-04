import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { DemoRepository } from './demo.repository.js';

const databaseUrl = process.env.PTM_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('demo storage and session bounds', () => {
  let pool: Pool;
  let repository: DemoRepository;
  const prefix = `limit-${crypto.randomUUID()}`;
  const tokens: string[] = [];
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    repository = new DemoRepository(pool);
    await repository.initialize();
  });
  afterAll(async () => {
    await pool.query('DELETE FROM demo_sessions WHERE token_hash=ANY($1) OR token_hash LIKE $2', [tokens, `${prefix}%`]);
    await pool.end();
  });

  it('admits at most ten sessions per address under concurrent creation', async () => {
    const results = await Promise.allSettled(Array.from({ length: 11 }, () => repository.create(prefix)));
    for (const result of results) if (result.status === 'fulfilled') tokens.push(result.value.session.token_hash);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(10);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('caps global stored sessions and removes expired snapshots', async () => {
    await pool.query("INSERT INTO demo_sessions(token_hash,board_id,ip_hash,snapshot_json) SELECT $1 || n, $1 || n, $1, '{}'::jsonb FROM generate_series(1,500) n", [prefix]);
    await expect(repository.create(`${prefix}-new`)).rejects.toMatchObject({ code: 'DEMO_CAPACITY' });
    await pool.query("UPDATE demo_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash LIKE $1", [`${prefix}%`]);
    await repository.cleanup();
    expect((await pool.query('SELECT count(*)::int AS count FROM demo_sessions WHERE token_hash LIKE $1', [`${prefix}%`])).rows[0].count).toBe(0);
  });

  it('rejects oversized snapshots without changing the original board', async () => {
    const created = await repository.create(`${prefix}-storage`);
    tokens.push(created.session.token_hash);
    const snapshot = structuredClone(created.session.snapshot_json);
    snapshot.people[0].name = 'x'.repeat(1000000);
    await expect(repository.upsert(created.session.board_id, snapshot)).rejects.toMatchObject({ code: 'DEMO_BOARD_LIMIT' });
    expect((await repository.find(created.session.board_id)).version).toBe(1);
  });
});
