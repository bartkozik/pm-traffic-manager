import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { initializePostgresDatabase } from '../db/postgres.js';
import { LastActiveAdminError } from './access.repository.js';
import { PostgresAccessUserRepository } from './postgresAccess.repository.js';

const databaseUrl = process.env.PTM_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('PostgresAccessUserRepository concurrency', () => {
  const schemaName = `access_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const firstAdmin = `first-${crypto.randomUUID()}@example.test`;
  const secondAdmin = `second-${crypto.randomUUID()}@example.test`;
  let adminPool: Pool;
  let pool: Pool;
  let schemaCreated = false;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: databaseUrl });
    await adminPool.query(`CREATE SCHEMA ${quoteTestSchema(schemaName)}`);
    schemaCreated = true;
    const isolatedDatabaseUrl = new URL(databaseUrl || '');
    isolatedDatabaseUrl.searchParams.set('options', `-csearch_path=${schemaName}`);
    pool = new Pool({ connectionString: isolatedDatabaseUrl.toString() });
    await initializePostgresDatabase(pool);
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (adminPool && schemaCreated) {
      await adminPool.query(`DROP SCHEMA ${quoteTestSchema(schemaName)} CASCADE`);
    }
    if (adminPool) await adminPool.end();
  });

  it('serializes concurrent demotions so one active administrator always remains', async () => {
    const firstRepository = new PostgresAccessUserRepository(pool);
    const secondRepository = new PostgresAccessUserRepository(pool);
    await firstRepository.seedUsers([
      { email: firstAdmin, role: 'admin' },
      { email: secondAdmin, role: 'admin' },
    ]);

    const results = await Promise.allSettled([
      firstRepository.updateUser(firstAdmin, { role: 'member' }, secondAdmin),
      secondRepository.updateUser(secondAdmin, { role: 'member' }, firstAdmin),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' ? rejected.reason : undefined)
      .toBeInstanceOf(LastActiveAdminError);
    expect((await firstRepository.listUsers()).filter((user) => (
      user.role === 'admin' && user.status === 'active'
    ))).toHaveLength(1);
  });
});

function quoteTestSchema(value: string) {
  if (!/^access_test_[a-f0-9]+$/.test(value)) throw new Error('Unsafe integration-test schema name.');
  return `"${value}"`;
}
