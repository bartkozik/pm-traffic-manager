import type { UpdateAppSamlConfigurationRequest } from '@ptm/contracts';
import type {
  SamlConfigurationRecord,
  SamlConfigurationRepository,
} from './samlConfiguration.repository.js';

export class InMemorySamlConfigurationRepository implements SamlConfigurationRepository {
  private configuration?: SamlConfigurationRecord;

  constructor(seed?: UpdateAppSamlConfigurationRequest) {
    if (seed) this.configuration = createRecord(seed);
  }

  async getConfiguration() {
    return this.configuration ? { ...this.configuration } : undefined;
  }

  async seedConfiguration(configuration: UpdateAppSamlConfigurationRequest | undefined) {
    if (!this.configuration && configuration) this.configuration = createRecord(configuration);
  }

  async upsertConfiguration(configuration: UpdateAppSamlConfigurationRequest) {
    const createdAt = this.configuration?.createdAt;
    this.configuration = createRecord(configuration, createdAt);
    return { ...this.configuration };
  }
}

function createRecord(
  configuration: UpdateAppSamlConfigurationRequest,
  createdAt = new Date().toISOString()
): SamlConfigurationRecord {
  return {
    ...configuration,
    createdAt,
    updatedAt: new Date().toISOString(),
  };
}
