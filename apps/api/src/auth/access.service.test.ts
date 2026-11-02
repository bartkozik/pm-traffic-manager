import type { AuthUser } from '@ptm/contracts';
import { describe, expect, it } from 'vitest';
import {
  AccessEmailOutsideWorkspaceError,
  AccessManagementForbiddenError,
  AccessManagementService,
  CannotModifyOwnAccessError,
} from './access.service.js';
import { InMemoryAccessUserRepository } from './inMemoryAccess.repository.testSupport.js';
import { InMemorySamlConfigurationRepository } from './inMemorySamlConfiguration.repository.testSupport.js';
import { createTestAuthConfig, testSamlConfiguration } from './saml.testSupport.js';
import { InvalidSamlConfigurationError } from './samlConfiguration.validation.js';

const admin: AuthUser = {
  email: 'admin@example.test',
  name: 'Admin',
  organizationDomain: 'example.test',
  role: 'admin',
  subject: 'admin@example.test',
};

describe('AccessManagementService', () => {
  it('lets an administrator add, promote, block and reactivate Workspace users', async () => {
    const repository = new InMemoryAccessUserRepository([
      { email: admin.email, role: 'admin' },
    ]);
    const service = createService(repository);

    const created = await service.createUser(admin, {
      email: ' New.User@example.test ',
      role: 'member',
    });
    expect(created).toMatchObject({
      email: 'new.user@example.test',
      role: 'member',
      status: 'active',
    });

    await expect(service.updateUser(admin, created.email, { role: 'admin' }))
      .resolves.toMatchObject({ role: 'admin' });
    await expect(service.updateUser(admin, created.email, { status: 'disabled' }))
      .resolves.toMatchObject({ status: 'disabled' });
    await expect(service.updateUser(admin, created.email, { status: 'active' }))
      .resolves.toMatchObject({ status: 'active' });
  });

  it('keeps access and SAML configuration management inside the admin role', async () => {
    const repository = new InMemoryAccessUserRepository([
      { email: admin.email, role: 'admin' },
    ]);
    const service = createService(repository);
    const member = { ...admin, email: 'member@example.test', role: 'member' as const };

    await expect(service.createUser(member, {
      email: 'someone@example.test',
      role: 'member',
    })).rejects.toBeInstanceOf(AccessManagementForbiddenError);
    await expect(service.updateUser(member, admin.email, { role: 'member' }))
      .rejects.toBeInstanceOf(AccessManagementForbiddenError);
    await expect(service.updateSamlConfiguration(member, testSamlConfiguration))
      .rejects.toBeInstanceOf(AccessManagementForbiddenError);
    await expect(service.createUser(admin, {
      email: 'someone@gmail.com',
      role: 'member',
    })).rejects.toBeInstanceOf(AccessEmailOutsideWorkspaceError);
  });

  it('lets an administrator update the non-secret IdP configuration', async () => {
    const service = createService(new InMemoryAccessUserRepository([
      { email: admin.email, role: 'admin' },
    ]));

    const configuration = await service.updateSamlConfiguration(admin, {
      ...testSamlConfiguration,
      idpSsoUrl: 'https://accounts.google.test/new-saml-url',
      requestTtlMinutes: 10,
    });

    expect(configuration).toMatchObject({
      configured: true,
      configurationSource: 'database',
      idpSsoUrl: 'https://accounts.google.test/new-saml-url',
      requestTtlMinutes: 10,
      samlEnabled: true,
    });
    expect(configuration.spPrivateKeyConfigured).toBe(true);
    expect(configuration).not.toHaveProperty('spPrivateKey');
    expect(configuration).not.toHaveProperty('sessionSecret');
  });

  it('rejects invalid certificates and insecure IdP endpoints before storing them', async () => {
    const service = createService(new InMemoryAccessUserRepository([
      { email: admin.email, role: 'admin' },
    ]));

    await expect(service.updateSamlConfiguration(admin, {
      ...testSamlConfiguration,
      idpCertificate: 'not-a-certificate',
    })).rejects.toBeInstanceOf(InvalidSamlConfigurationError);
    await expect(service.updateSamlConfiguration(admin, {
      ...testSamlConfiguration,
      idpSsoUrl: 'http://accounts.google.test/saml',
    })).rejects.toBeInstanceOf(InvalidSamlConfigurationError);
  });

  it('prevents an administrator from disabling or demoting their own account', async () => {
    const service = createService(new InMemoryAccessUserRepository([
      { email: admin.email, role: 'admin' },
    ]));

    await expect(service.updateUser(admin, admin.email, { status: 'disabled' }))
      .rejects.toBeInstanceOf(CannotModifyOwnAccessError);
    await expect(service.updateUser(admin, admin.email, { role: 'member' }))
      .rejects.toBeInstanceOf(CannotModifyOwnAccessError);
  });
});

function createService(repository: InMemoryAccessUserRepository) {
  return new AccessManagementService(
    repository,
    new InMemorySamlConfigurationRepository(testSamlConfiguration),
    createTestAuthConfig()
  );
}
