import type { UpdateAppSamlConfigurationRequest } from '@ptm/contracts';
import type { Pool, QueryResultRow } from 'pg';
import type {
  SamlConfigurationRecord,
  SamlConfigurationRepository,
} from './samlConfiguration.repository.js';

interface SamlConfigurationRow extends QueryResultRow {
  created_at: Date | string;
  idp_certificate: string;
  idp_entity_id: string;
  idp_sso_url: string;
  request_ttl_minutes: number;
  saml_enabled: boolean;
  updated_at: Date | string;
}

export class PostgresSamlConfigurationRepository implements SamlConfigurationRepository {
  constructor(private readonly pool: Pool) {}

  async getConfiguration(): Promise<SamlConfigurationRecord | undefined> {
    const result = await this.pool.query<SamlConfigurationRow>(`
      SELECT ${SAML_CONFIGURATION_COLUMNS}
      FROM app_saml_configuration
      WHERE id = 1
    `);
    return result.rows[0] ? mapSamlConfiguration(result.rows[0]) : undefined;
  }

  async seedConfiguration(configuration: UpdateAppSamlConfigurationRequest | undefined): Promise<void> {
    if (!configuration) return;
    await this.pool.query(`
      INSERT INTO app_saml_configuration (
        id,
        idp_certificate,
        idp_entity_id,
        idp_sso_url,
        request_ttl_minutes,
        saml_enabled
      )
      VALUES (1, $1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING
    `, configurationValues(configuration));
  }

  async upsertConfiguration(
    configuration: UpdateAppSamlConfigurationRequest,
    actorEmail: string
  ): Promise<SamlConfigurationRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM app_access_settings WHERE id = 1 FOR UPDATE');
      const previousResult = await client.query<SamlConfigurationRow>(`
        SELECT ${SAML_CONFIGURATION_COLUMNS}
        FROM app_saml_configuration
        WHERE id = 1
      `);
      const result = await client.query<SamlConfigurationRow>(`
        INSERT INTO app_saml_configuration (
          id,
          idp_certificate,
          idp_entity_id,
          idp_sso_url,
          request_ttl_minutes,
          saml_enabled
        )
        VALUES (1, $1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          idp_certificate = EXCLUDED.idp_certificate,
          idp_entity_id = EXCLUDED.idp_entity_id,
          idp_sso_url = EXCLUDED.idp_sso_url,
          request_ttl_minutes = EXCLUDED.request_ttl_minutes,
          saml_enabled = EXCLUDED.saml_enabled,
          updated_at = NOW()
        RETURNING ${SAML_CONFIGURATION_COLUMNS}
      `, configurationValues(configuration));
      const previous = previousResult.rows[0]
        ? mapSamlConfiguration(previousResult.rows[0])
        : undefined;
      await client.query(`
        INSERT INTO app_access_audit (actor_email, target_email, action, details_json)
        VALUES ($1, 'saml-configuration', 'saml_configuration_updated', $2::JSONB)
      `, [actorEmail.trim().toLowerCase(), JSON.stringify({
        from: previous ? summarizeConfiguration(previous) : null,
        to: summarizeConfiguration(configuration),
        idpCertificateChanged: previous?.idpCertificate !== configuration.idpCertificate,
      })]);
      await client.query('COMMIT');
      return mapSamlConfiguration(result.rows[0]);
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

const SAML_CONFIGURATION_COLUMNS = `
  idp_certificate,
  idp_entity_id,
  idp_sso_url,
  request_ttl_minutes,
  saml_enabled,
  created_at,
  updated_at
`;

function configurationValues(configuration: UpdateAppSamlConfigurationRequest) {
  return [
    configuration.idpCertificate.trim(),
    configuration.idpEntityId.trim(),
    configuration.idpSsoUrl.trim(),
    configuration.requestTtlMinutes,
    configuration.samlEnabled,
  ];
}

function mapSamlConfiguration(row: SamlConfigurationRow): SamlConfigurationRecord {
  return {
    createdAt: toIsoString(row.created_at),
    idpCertificate: row.idp_certificate,
    idpEntityId: row.idp_entity_id,
    idpSsoUrl: row.idp_sso_url,
    requestTtlMinutes: row.request_ttl_minutes,
    samlEnabled: row.saml_enabled,
    updatedAt: toIsoString(row.updated_at),
  };
}

function summarizeConfiguration(configuration: UpdateAppSamlConfigurationRequest) {
  return {
    idpEntityId: configuration.idpEntityId,
    idpSsoUrl: configuration.idpSsoUrl,
    requestTtlMinutes: configuration.requestTtlMinutes,
    samlEnabled: configuration.samlEnabled,
  };
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
