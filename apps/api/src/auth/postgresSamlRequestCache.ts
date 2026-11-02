import type { CacheItem, CacheProvider } from '@node-saml/node-saml';
import type { Pool } from 'pg';

export class PostgresSamlRequestCache implements CacheProvider {
  private readonly claimedValues = new Map<string, string>();

  constructor(
    private readonly pool: Pool,
    private readonly expirationMs: number
  ) {}

  async saveAsync(key: string, value: string): Promise<CacheItem | null> {
    await this.deleteExpired();
    const result = await this.pool.query<{ created_at: Date | string }>(`
      INSERT INTO app_saml_request_cache (request_id, request_value)
      VALUES ($1, $2)
      ON CONFLICT (request_id) DO NOTHING
      RETURNING created_at
    `, [key, value]);
    const createdAt = result.rows[0]?.created_at;
    return createdAt ? { createdAt: new Date(createdAt).getTime(), value } : null;
  }

  async getAsync(key: string): Promise<string | null> {
    const claimedValue = this.claimedValues.get(key);
    if (claimedValue) return claimedValue;
    await this.deleteExpired(key);
    const result = await this.pool.query<{ request_value: string }>(`
      UPDATE app_saml_request_cache
      SET claimed_at = NOW()
      WHERE request_id = $1 AND claimed_at IS NULL
      RETURNING request_value
    `, [key]);
    const value = result.rows[0]?.request_value ?? null;
    if (value) this.claimedValues.set(key, value);
    return value;
  }

  async removeAsync(key: string | null): Promise<string | null> {
    if (!key) return null;
    const claimedValue = this.claimedValues.get(key) || null;
    this.claimedValues.delete(key);
    const result = await this.pool.query<{ request_value: string }>(`
      DELETE FROM app_saml_request_cache
      WHERE request_id = $1
      RETURNING request_value
    `, [key]);
    return result.rows[0]?.request_value ?? claimedValue;
  }

  private async deleteExpired(key?: string) {
    await this.pool.query(`
      DELETE FROM app_saml_request_cache
      WHERE created_at <= NOW() - ($1::BIGINT * INTERVAL '1 millisecond')
        AND ($2::TEXT IS NULL OR request_id = $2)
    `, [this.expirationMs, key ?? null]);
  }
}
