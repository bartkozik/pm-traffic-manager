import { TrafficBoardConflictError } from '../traffic/services/trafficBoard.service.js';
import { createDemoSnapshot } from './demo.seed.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { type TrafficSnapshot, type TrafficBoardCommand } from '@ptm/domain';
import type { TrafficBoardRecord, TrafficBoardRepository } from '../traffic/repositories/trafficBoard.repository.js';

import { DemoError } from './demo.errors.js';
import { validateDemoCommand, validateDemoSnapshot } from './demo.validation.js';
export { DemoError } from './demo.errors.js';

interface SessionRow {
  token_hash: string;
  board_id: string;
  expires_at: Date;
  ai_attempts: number;
  snapshot_json: TrafficSnapshot;
  updated_at: Date;
  version: number;
}

export class DemoRepository implements TrafficBoardRepository {
  constructor(readonly pool: Pool) {}

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS demo_sessions (
        token_hash TEXT PRIMARY KEY,
        board_id TEXT UNIQUE NOT NULL,
        ip_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        version INTEGER NOT NULL DEFAULT 1,
        ai_attempts INTEGER NOT NULL DEFAULT 0 CHECK (ai_attempts BETWEEN 0 AND 3),
        snapshot_json JSONB NOT NULL CHECK (octet_length(snapshot_json::text) <= 1000000)
      );
      CREATE INDEX IF NOT EXISTS demo_sessions_expiry ON demo_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS demo_sessions_ip ON demo_sessions(ip_hash);
      CREATE TABLE IF NOT EXISTS demo_ai_months (
        month TEXT PRIMARY KEY,
        reserved_nano BIGINT NOT NULL DEFAULT 0 CHECK (reserved_nano BETWEEN 0 AND 5000000000)
      );
      CREATE TABLE IF NOT EXISTS demo_ai_reservations (
        id UUID PRIMARY KEY,
        token_hash TEXT NOT NULL REFERENCES demo_sessions(token_hash) ON DELETE CASCADE,
        month TEXT NOT NULL REFERENCES demo_ai_months(month),
        reserved_nano BIGINT NOT NULL CHECK (reserved_nano > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished BOOLEAN NOT NULL DEFAULT FALSE,
        cache_key TEXT NOT NULL,
        result_json JSONB
      );
      CREATE INDEX IF NOT EXISTS demo_ai_reservations_session_cache ON demo_ai_reservations(token_hash, cache_key);
      CREATE INDEX IF NOT EXISTS demo_ai_reservations_active ON demo_ai_reservations(created_at) WHERE NOT finished;
    `);
  }

  async cleanup() { await this.pool.query('DELETE FROM demo_sessions WHERE expires_at <= NOW()'); }

  async create(ip: string) {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(71829301)');
      await client.query('DELETE FROM demo_sessions WHERE expires_at <= NOW()');
      const ipHash = hash(ip);
      const counts = await client.query<{ total: number; per_ip: number }>('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ip_hash=$1)::int AS per_ip FROM demo_sessions', [ipHash]);
      if (counts.rows[0].total >= 500 || counts.rows[0].per_ip >= 10) throw new DemoError(429, 'DEMO_CAPACITY', 'Demo session limit reached. Please return later.');
      const token = randomBytes(32).toString('base64url');
      const { rows } = await client.query<SessionRow>('INSERT INTO demo_sessions(token_hash,board_id,ip_hash,snapshot_json) VALUES($1,$2,$3,$4) RETURNING *', [hash(token), `demo-${randomUUID()}`, ipHash, JSON.stringify(createDemoSnapshot())]);
      return { session: rows[0], token };
    });
  }

  async authenticate(cookie: string | undefined, boardId?: string) {
    const token = cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('__Host-ptm-demo='))?.slice('__Host-ptm-demo='.length);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw required();
    const { rows } = await this.pool.query<SessionRow>('SELECT * FROM demo_sessions WHERE token_hash=$1 AND expires_at>NOW()', [hash(token)]);
    if (!rows[0]) throw required();
    if (boardId && rows[0].board_id !== boardId) throw new DemoError(403, 'DEMO_BOARD_FORBIDDEN', 'This board does not belong to your demo session.');
    return rows[0];
  }

  async reset(tokenHash: string) {
    const { rows } = await this.pool.query<SessionRow>('UPDATE demo_sessions SET board_id=$2, snapshot_json=$3, version=1, updated_at=clock_timestamp() WHERE token_hash=$1 AND expires_at>NOW() RETURNING *', [tokenHash, `demo-${randomUUID()}`, JSON.stringify(createDemoSnapshot())]);
    if (!rows[0]) throw required();
    return rows[0];
  }

  async find(boardId: string): Promise<TrafficBoardRecord> {
    const { rows } = await this.pool.query<SessionRow>('SELECT * FROM demo_sessions WHERE board_id=$1 AND expires_at>NOW()', [boardId]);
    if (!rows[0]) throw required();
    validateDemoSnapshot(rows[0].snapshot_json);
    return record(rows[0]);
  }

  validateCommand(snapshot: TrafficSnapshot, command: TrafficBoardCommand) { validateDemoCommand(snapshot, command); }

  async saveIfCurrent(boardId: string, snapshot: TrafficSnapshot, baseUpdatedAt?: string) {
    validateDemoSnapshot(snapshot);
    return this.write(boardId, () => snapshot, baseUpdatedAt ?? '');
  }

  async upsert(boardId: string, snapshot: TrafficSnapshot, action = 'board_snapshot_saved') {
    if (action === 'board_reset') throw new DemoError(400, 'DEMO_RESET_REQUIRED', 'Use Reset demo to create a fresh isolated board.');
    validateDemoSnapshot(snapshot);
    return this.updateAtomically(boardId, snapshot, () => snapshot);
  }

  async updateAtomically(boardId: string, _initial: TrafficSnapshot, update: (snapshot: TrafficSnapshot) => TrafficSnapshot) {
    return this.write(boardId, update);
  }

  private async write(boardId: string, update: (snapshot: TrafficSnapshot) => TrafficSnapshot, baseUpdatedAt?: string) {
    return this.transaction(async (client) => {
      const { rows } = await client.query<SessionRow>('SELECT * FROM demo_sessions WHERE board_id=$1 AND expires_at>NOW() FOR UPDATE', [boardId]);
      if (!rows[0]) throw required();
      if (baseUpdatedAt !== undefined && rows[0].updated_at.toISOString() !== baseUpdatedAt) throw new TrafficBoardConflictError(record(rows[0]));
      validateDemoSnapshot(rows[0].snapshot_json);
      const snapshot = update(rows[0].snapshot_json);
      validateDemoSnapshot(snapshot);
      if (Buffer.byteLength(JSON.stringify(snapshot)) > 900000) throw new DemoError(413, 'DEMO_BOARD_TOO_LARGE', 'Demo board storage limit reached.');
      const result = await client.query<SessionRow>("UPDATE demo_sessions SET snapshot_json=$2,version=version+1,updated_at=GREATEST(clock_timestamp(),updated_at+INTERVAL '1 millisecond') WHERE board_id=$1 AND expires_at>NOW() RETURNING *", [boardId, JSON.stringify(snapshot)]);
      if (!result.rows[0]) throw required();
      return record(result.rows[0]);
    });
  }

  async listAuditLog() { return []; }
  async countEntityRows() { return 0; }

  async transaction<T>(operation: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}

export function demoSessionResponse(session: SessionRow, aiAvailable: boolean) {
  return { boardId: session.board_id, expiresAt: session.expires_at.toISOString(), aiRemaining: 3 - session.ai_attempts, aiAvailable };
}
function record(row: SessionRow): TrafficBoardRecord { return { boardId: row.board_id, snapshot: row.snapshot_json, updatedAt: row.updated_at.toISOString(), version: row.version }; }
function required() { return new DemoError(401, 'DEMO_SESSION_REQUIRED', 'Start a new demo session to continue.'); }
export function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
