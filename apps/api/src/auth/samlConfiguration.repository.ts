import type {
  AppSamlConfiguration,
  UpdateAppSamlConfigurationRequest,
} from '@ptm/contracts';

export interface SamlConfigurationRecord extends UpdateAppSamlConfigurationRequest {
  createdAt: string;
  updatedAt: string;
}

export interface SamlConfigurationRepository {
  getConfiguration(): Promise<SamlConfigurationRecord | undefined>;
  seedConfiguration(configuration: UpdateAppSamlConfigurationRequest | undefined): Promise<void>;
  upsertConfiguration(
    configuration: UpdateAppSamlConfigurationRequest,
    actorEmail: string
  ): Promise<SamlConfigurationRecord>;
}

export type SamlConfigurationStatusBase = Omit<
  AppSamlConfiguration,
  | 'configured'
  | 'configurationSource'
  | 'idpCertificate'
  | 'idpEntityId'
  | 'idpSsoUrl'
  | 'requestTtlMinutes'
  | 'samlEnabled'
  | 'updatedAt'
>;
