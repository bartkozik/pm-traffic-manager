import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { initializePostgresDatabase } from '../db/postgres.js';
import { PostgresSamlConfigurationRepository } from './postgresSamlConfiguration.repository.js';
import { PostgresSamlRequestCache } from './postgresSamlRequestCache.js';
import { testSamlConfiguration } from './saml.testSupport.js';

const databaseUrl = process.env.PTM_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('PostgreSQL SAML repositories', () => {
  const schemaName = `saml_test_${crypto.randomUUID().replaceAll('-', '')}`;
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

  it('seeds once, updates transactionally, and audits without certificate contents', async () => {
    const repository = new PostgresSamlConfigurationRepository(pool);
    await repository.seedConfiguration(testSamlConfiguration);
    await repository.seedConfiguration({
      ...testSamlConfiguration,
      idpSsoUrl: 'https://should-not-overwrite.example.test',
    });
    expect(await repository.getConfiguration()).toMatchObject(testSamlConfiguration);

    const updated = await repository.upsertConfiguration({
      ...testSamlConfiguration,
      idpSsoUrl: 'https://accounts.google.test/updated-saml',
    }, 'admin@example.test');
    expect(updated.idpSsoUrl).toBe('https://accounts.google.test/updated-saml');

    const audit = await pool.query<{ details_json: Record<string, unknown> }>(`
      SELECT details_json
      FROM app_access_audit
      WHERE action = 'saml_configuration_updated'
    `);
    expect(audit.rows).toHaveLength(1);
    expect(JSON.stringify(audit.rows[0]?.details_json)).not.toContain(testSamlConfiguration.idpCertificate);
  });

  it('atomically lets only one response validator claim a request ID', async () => {
    const firstCache = new PostgresSamlRequestCache(pool, 5 * 60 * 1000);
    const secondCache = new PostgresSamlRequestCache(pool, 5 * 60 * 1000);
    await firstCache.saveAsync('request-id', new Date().toISOString());

    const claims = await Promise.all([
      firstCache.getAsync('request-id'),
      secondCache.getAsync('request-id'),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    const claimedCache = claims[0] ? firstCache : secondCache;
    expect(await claimedCache.getAsync('request-id')).toBe(claims.find(Boolean));
    await claimedCache.removeAsync('request-id');
    expect(await firstCache.getAsync('request-id')).toBeNull();
    expect(await secondCache.getAsync('request-id')).toBeNull();
  });
});

function quoteTestSchema(value: string) {
  if (!/^saml_test_[a-f0-9]+$/.test(value)) throw new Error('Unsafe integration-test schema name.');
  return `"${value}"`;
}
