import { Pool } from 'pg';

export function createPostgresPool(databaseUrl: string) {
  return new Pool({
    connectionString: databaseUrl,
  });
}

export async function initializePostgresDatabase(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_access_settings (
      id SMALLINT PRIMARY KEY CHECK (id = 1)
    );

    INSERT INTO app_access_settings (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS app_access_users (
      email TEXT PRIMARY KEY CHECK (email = LOWER(email)),
      saml_name_id TEXT,
      display_name TEXT,
      role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
      status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_access_audit (
      id BIGSERIAL PRIMARY KEY,
      actor_email TEXT NOT NULL,
      target_email TEXT NOT NULL,
      action TEXT NOT NULL,
      details_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS app_access_audit_target_created_idx
      ON app_access_audit (target_email, created_at DESC);

    CREATE TABLE IF NOT EXISTS app_saml_configuration (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      idp_certificate TEXT NOT NULL,
      idp_entity_id TEXT NOT NULL,
      idp_sso_url TEXT NOT NULL,
      request_ttl_minutes INTEGER NOT NULL CHECK (request_ttl_minutes BETWEEN 1 AND 60),
      saml_enabled BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_saml_request_cache (
      request_id TEXT PRIMARY KEY,
      request_value TEXT NOT NULL,
      claimed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS app_saml_request_cache_created_idx
      ON app_saml_request_cache (created_at);

    CREATE TABLE IF NOT EXISTS traffic_boards (
      id TEXT PRIMARY KEY,
      snapshot_json JSONB,
      schema_version INTEGER,
      active_period_id TEXT,
      active_tile_unit_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS traffic_skills (
      board_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json JSONB NOT NULL,
      PRIMARY KEY (board_id, id),
      FOREIGN KEY (board_id) REFERENCES traffic_boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS traffic_periods (
      board_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json JSONB NOT NULL,
      PRIMARY KEY (board_id, id),
      FOREIGN KEY (board_id) REFERENCES traffic_boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS traffic_tile_units (
      board_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json JSONB NOT NULL,
      PRIMARY KEY (board_id, id),
      FOREIGN KEY (board_id) REFERENCES traffic_boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS traffic_people (
      board_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json JSONB NOT NULL,
      PRIMARY KEY (board_id, id),
      FOREIGN KEY (board_id) REFERENCES traffic_boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS traffic_projects (
      board_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json JSONB NOT NULL,
      PRIMARY KEY (board_id, id),
      FOREIGN KEY (board_id) REFERENCES traffic_boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS traffic_project_requirements (
      board_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json JSONB NOT NULL,
      PRIMARY KEY (board_id, project_id, id),
      FOREIGN KEY (board_id, project_id) REFERENCES traffic_projects(board_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS traffic_project_revenue_plans (
      board_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      period_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json JSONB NOT NULL,
      PRIMARY KEY (board_id, project_id, period_id),
      FOREIGN KEY (board_id, project_id) REFERENCES traffic_projects(board_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS traffic_project_invoices (
      board_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json JSONB NOT NULL,
      PRIMARY KEY (board_id, project_id, id),
      FOREIGN KEY (board_id, project_id) REFERENCES traffic_projects(board_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS traffic_allocations (
      board_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json JSONB NOT NULL,
      PRIMARY KEY (board_id, id),
      FOREIGN KEY (board_id) REFERENCES traffic_boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS traffic_weekly_allocations (
      board_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json JSONB NOT NULL,
      PRIMARY KEY (board_id, id),
      FOREIGN KEY (board_id) REFERENCES traffic_boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS traffic_planning_rules (
      board_id TEXT NOT NULL,
      id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      payload_json JSONB NOT NULL,
      PRIMARY KEY (board_id, id),
      FOREIGN KEY (board_id) REFERENCES traffic_boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS traffic_audit_log (
      id SERIAL PRIMARY KEY,
      board_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json JSONB NOT NULL,
      actor_id TEXT,
      command_id TEXT,
      source_system TEXT,
      source_record_id TEXT,
      idempotency_key TEXT,
      diff_summary TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (board_id) REFERENCES traffic_boards(id) ON DELETE CASCADE
    );
  `);

  await pool.query('ALTER TABLE app_access_users ADD COLUMN IF NOT EXISTS saml_name_id TEXT');
  await pool.query('ALTER TABLE app_saml_request_cache ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS app_access_users_saml_name_id_idx
      ON app_access_users (saml_name_id)
      WHERE saml_name_id IS NOT NULL
  `);
  await pool.query('ALTER TABLE traffic_boards ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1');
  await pool.query('ALTER TABLE traffic_audit_log ADD COLUMN IF NOT EXISTS actor_id TEXT');
  await pool.query('ALTER TABLE traffic_audit_log ADD COLUMN IF NOT EXISTS command_id TEXT');
  await pool.query('ALTER TABLE traffic_audit_log ADD COLUMN IF NOT EXISTS source_system TEXT');
  await pool.query('ALTER TABLE traffic_audit_log ADD COLUMN IF NOT EXISTS source_record_id TEXT');
  await pool.query('ALTER TABLE traffic_audit_log ADD COLUMN IF NOT EXISTS idempotency_key TEXT');
  await pool.query('ALTER TABLE traffic_audit_log ADD COLUMN IF NOT EXISTS diff_summary TEXT');
}
