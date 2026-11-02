import type {
  AppAccessUsersResponse,
  AppAccessUser,
  AppSamlConfiguration,
  AuthUser,
  CreateAppAccessUserRequest,
  UpdateAppAccessUserRequest,
  UpdateAppSamlConfigurationRequest,
} from '@ptm/contracts';
import type { AuthConfig } from '../config.js';
import type { AccessUserRecord, AccessUserRepository } from './access.repository.js';
import type {
  SamlConfigurationRecord,
  SamlConfigurationRepository,
} from './samlConfiguration.repository.js';
import { assertValidSamlIdentityProviderConfiguration } from './samlConfiguration.validation.js';

export class AccessManagementForbiddenError extends Error {
  constructor() {
    super('Administrator access is required.');
    this.name = 'AccessManagementForbiddenError';
  }
}

export class AccessEmailOutsideWorkspaceError extends Error {
  constructor(email: string) {
    super(`${email} is outside the configured Workspace domain.`);
    this.name = 'AccessEmailOutsideWorkspaceError';
  }
}

export class CannotModifyOwnAccessError extends Error {
  constructor() {
    super('Administrators cannot disable or demote their own account.');
    this.name = 'CannotModifyOwnAccessError';
  }
}

export class AccessManagementService {
  constructor(
    private readonly repository: AccessUserRepository,
    private readonly samlConfigurationRepository: SamlConfigurationRepository,
    private readonly authConfig: AuthConfig
  ) {}

  async getOverview(actor: AuthUser): Promise<AppAccessUsersResponse> {
    this.assertAdmin(actor);
    const [configuration, users] = await Promise.all([
      this.samlConfigurationRepository.getConfiguration(),
      this.repository.listUsers(),
    ]);
    return {
      samlConfiguration: createSamlConfigurationStatus(this.authConfig, configuration),
      users: users.map(toPublicAccessUser),
    };
  }

  async listUsers(actor: AuthUser): Promise<AppAccessUser[]> {
    this.assertAdmin(actor);
    return (await this.repository.listUsers()).map(toPublicAccessUser);
  }

  async createUser(
    actor: AuthUser,
    input: CreateAppAccessUserRequest
  ): Promise<AppAccessUser> {
    this.assertAdmin(actor);
    const email = normalizeEmail(input.email);
    this.assertWorkspaceEmail(email);
    return toPublicAccessUser(await this.repository.createUser({
      email,
      role: input.role,
    }, actor.email));
  }

  async updateUser(
    actor: AuthUser,
    emailValue: string,
    patch: UpdateAppAccessUserRequest
  ): Promise<AppAccessUser> {
    this.assertAdmin(actor);
    const email = normalizeEmail(emailValue);
    this.assertWorkspaceEmail(email);
    if (
      email === normalizeEmail(actor.email) &&
      (patch.role === 'member' || patch.status === 'disabled')
    ) {
      throw new CannotModifyOwnAccessError();
    }
    return toPublicAccessUser(await this.repository.updateUser(email, patch, actor.email));
  }

  async updateSamlConfiguration(
    actor: AuthUser,
    input: UpdateAppSamlConfigurationRequest
  ): Promise<AppSamlConfiguration> {
    this.assertAdmin(actor);
    assertValidSamlIdentityProviderConfiguration(input);
    const configuration = await this.samlConfigurationRepository.upsertConfiguration(input, actor.email);
    return createSamlConfigurationStatus(this.authConfig, configuration);
  }

  private assertAdmin(actor: AuthUser) {
    if (actor.role !== 'admin') throw new AccessManagementForbiddenError();
  }

  private assertWorkspaceEmail(email: string) {
    if (getEmailDomain(email) !== this.authConfig.workspaceDomain) {
      throw new AccessEmailOutsideWorkspaceError(email);
    }
  }
}

export function createSamlConfigurationStatus(
  config: AuthConfig,
  record?: SamlConfigurationRecord
): AppSamlConfiguration {
  const sessionSecretConfigured = Boolean(config.sessionSecret);
  const spCertificateConfigured = Boolean(config.samlSpCertificate);
  const spPrivateKeyConfigured = Boolean(config.samlSpPrivateKey);
  const idpConfigured = Boolean(
    record?.idpCertificate &&
    record.idpEntityId &&
    record.idpSsoUrl
  );
  const configured = Boolean(
    config.enabled &&
    idpConfigured &&
    sessionSecretConfigured &&
    spCertificateConfigured &&
    spPrivateKeyConfigured &&
    config.samlSpEntityId &&
    config.workspaceDomain
  );

  return {
    acsUrl: config.samlAcsUrl,
    authEnabled: config.enabled,
    configured,
    configurationSource: record ? 'database' : 'missing',
    cookieSecure: config.cookieSecure,
    idpCertificate: record?.idpCertificate || '',
    idpEntityId: record?.idpEntityId || '',
    idpSsoUrl: record?.idpSsoUrl || '',
    metadataUrl: config.samlMetadataUrl,
    requestTtlMinutes: record?.requestTtlMinutes || 5,
    samlEnabled: record?.samlEnabled || false,
    sessionSecretConfigured,
    sessionTtlHours: config.sessionTtlHours,
    spCertificateConfigured,
    spEntityId: config.samlSpEntityId,
    spPrivateKeyConfigured,
    updatedAt: record?.updatedAt,
    webAppUrl: config.webAppUrl,
    workspaceDomain: config.workspaceDomain,
  };
}

function toPublicAccessUser(user: AccessUserRecord): AppAccessUser {
  return {
    createdAt: user.createdAt,
    email: user.email,
    lastLoginAt: user.lastLoginAt,
    name: user.name,
    role: user.role,
    status: user.status,
    updatedAt: user.updatedAt,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getEmailDomain(email: string) {
  const separatorIndex = email.lastIndexOf('@');
  return separatorIndex > 0 ? email.slice(separatorIndex + 1) : '';
}
