import type {
  AppAccessRole,
  AppAccessStatus,
  UpdateAppAccessUserRequest,
} from '@ptm/contracts';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import {
  AccessUserAlreadyExistsError,
  AccessUserNotFoundError,
  LastActiveAdminError,
  isActiveAdmin,
  type AccessLoginProfile,
  type AccessUserRecord,
  type AccessUserRepository,
  type AccessUserSeed,
} from './access.repository.js';

interface AccessUserRow extends QueryResultRow {
  created_at: Date | string;
  display_name: string | null;
  email: string;
  last_login_at: Date | string | null;
  role: AppAccessRole;
  saml_name_id: string | null;
  status: AppAccessStatus;
  updated_at: Date | string;
}

export class PostgresAccessUserRepository implements AccessUserRepository {
  constructor(private readonly pool: Pool) {}

  async seedUsers(users: AccessUserSeed[]): Promise<void> {
    if (users.length === 0) return;

    await this.pool.query(`
      WITH seed(email, role) AS (
        SELECT LOWER(email), role
        FROM UNNEST($1::TEXT[], $2::TEXT[]) AS input(email, role)
      ), inserted AS (
        INSERT INTO app_access_users (email, role, status)
        SELECT email, role, 'active'
        FROM seed
        ON CONFLICT (email) DO NOTHING
        RETURNING email, role
      )
      INSERT INTO app_access_audit (actor_email, target_email, action, details_json)
      SELECT 'system', email, 'access_bootstrapped', jsonb_build_object('role', role)
      FROM inserted
    `, [users.map((user) => normalizeEmail(user.email)), users.map((user) => user.role)]);
  }

  async findActiveUser(email: string): Promise<AccessUserRecord | undefined> {
    const result = await this.pool.query<AccessUserRow>(`
      SELECT ${ACCESS_USER_COLUMNS}
      FROM app_access_users
      WHERE email = $1 AND status = 'active'
    `, [normalizeEmail(email)]);
    return result.rows[0] ? mapAccessUser(result.rows[0]) : undefined;
  }

  async listUsers(): Promise<AccessUserRecord[]> {
    const result = await this.pool.query<AccessUserRow>(`
      SELECT ${ACCESS_USER_COLUMNS}
      FROM app_access_users
      ORDER BY
        CASE status WHEN 'active' THEN 0 ELSE 1 END,
        CASE role WHEN 'admin' THEN 0 ELSE 1 END,
        email
    `);
    return result.rows.map(mapAccessUser);
  }

  async recordSuccessfulLogin(profile: AccessLoginProfile): Promise<AccessUserRecord | undefined> {
    const result = await this.pool.query<AccessUserRow>(`
      UPDATE app_access_users
      SET
        saml_name_id = $2,
        display_name = $3,
        last_login_at = NOW(),
        updated_at = NOW()
      WHERE email = $1 AND status = 'active'
      RETURNING ${ACCESS_USER_COLUMNS}
    `, [
      normalizeEmail(profile.email),
      profile.samlNameId,
      profile.name,
    ]);
    return result.rows[0] ? mapAccessUser(result.rows[0]) : undefined;
  }

  async createUser(
    input: { email: string; role: AppAccessRole },
    actorEmail: string
  ): Promise<AccessUserRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockAccessMutations(client);
      const result = await client.query<AccessUserRow>(`
        INSERT INTO app_access_users (email, role, status)
        VALUES ($1, $2, 'active')
        RETURNING ${ACCESS_USER_COLUMNS}
      `, [normalizeEmail(input.email), input.role]);
      await insertAudit(client, actorEmail, input.email, 'access_created', {
        role: input.role,
        status: 'active',
      });
      await client.query('COMMIT');
      return mapAccessUser(result.rows[0]);
    } catch (error) {
      await rollbackQuietly(client);
      if (isUniqueViolation(error)) throw new AccessUserAlreadyExistsError(input.email);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateUser(
    email: string,
    patch: UpdateAppAccessUserRequest,
    actorEmail: string
  ): Promise<AccessUserRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockAccessMutations(client);
      const currentResult = await client.query<AccessUserRow>(`
        SELECT ${ACCESS_USER_COLUMNS}
        FROM app_access_users
        WHERE email = $1
        FOR UPDATE
      `, [normalizeEmail(email)]);
      const currentRow = currentResult.rows[0];
      if (!currentRow) throw new AccessUserNotFoundError(email);

      const current = mapAccessUser(currentRow);
      const nextRole = patch.role ?? current.role;
      const nextStatus = patch.status ?? current.status;
      if (isActiveAdmin(current) && (nextRole !== 'admin' || nextStatus !== 'active')) {
        const countResult = await client.query<{ count: string }>(`
          SELECT COUNT(*)::TEXT AS count
          FROM app_access_users
          WHERE role = 'admin' AND status = 'active'
        `);
        if (Number(countResult.rows[0]?.count || 0) <= 1) throw new LastActiveAdminError();
      }

      const result = await client.query<AccessUserRow>(`
        UPDATE app_access_users
        SET role = $2, status = $3, updated_at = NOW()
        WHERE email = $1
        RETURNING ${ACCESS_USER_COLUMNS}
      `, [normalizeEmail(email), nextRole, nextStatus]);
      await insertAudit(client, actorEmail, email, 'access_updated', {
        from: { role: current.role, status: current.status },
        to: { role: nextRole, status: nextStatus },
      });
      await client.query('COMMIT');
      return mapAccessUser(result.rows[0]);
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

const ACCESS_USER_COLUMNS = `
  email,
  saml_name_id,
  display_name,
  role,
  status,
  last_login_at,
  created_at,
  updated_at
`;

async function lockAccessMutations(client: PoolClient) {
  await client.query('SELECT id FROM app_access_settings WHERE id = 1 FOR UPDATE');
}

async function insertAudit(
  client: PoolClient,
  actorEmail: string,
  targetEmail: string,
  action: string,
  details: object
) {
  await client.query(`
    INSERT INTO app_access_audit (actor_email, target_email, action, details_json)
    VALUES ($1, $2, $3, $4::JSONB)
  `, [normalizeEmail(actorEmail), normalizeEmail(targetEmail), action, JSON.stringify(details)]);
}

async function rollbackQuietly(client: PoolClient) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original transaction error.
  }
}

function mapAccessUser(row: AccessUserRow): AccessUserRecord {
  return {
    createdAt: toIsoString(row.created_at),
    email: row.email,
    lastLoginAt: row.last_login_at ? toIsoString(row.last_login_at) : undefined,
    name: row.display_name || undefined,
    role: row.role,
    samlNameId: row.saml_name_id || undefined,
    status: row.status,
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isUniqueViolation(error: unknown): error is { code: '23505' } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}
