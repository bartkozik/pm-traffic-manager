import formbody from '@fastify/formbody';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerAccessManagementRoutes } from './access.router.js';
import { AccessManagementService } from './access.service.js';
import { registerAuthRoutes } from './auth.router.js';
import { AuthService } from './auth.service.js';
import { InMemoryAccessUserRepository } from './inMemoryAccess.repository.testSupport.js';
import { InMemorySamlConfigurationRepository } from './inMemorySamlConfiguration.repository.testSupport.js';
import {
  FakeSamlIdentityProvider,
  createTestAuthConfig,
  testSamlConfiguration,
  testSamlIdentity,
} from './saml.testSupport.js';

describe('access management routes', () => {
  const apps = new Set<ReturnType<typeof Fastify>>();

  afterEach(async () => {
    await Promise.all([...apps].map((app) => app.close()));
    apps.clear();
  });

  it('lets an authenticated administrator manage Workspace access and SAML configuration', async () => {
    const repository = new InMemoryAccessUserRepository([
      { email: 'admin@example.test', role: 'admin' },
    ]);
    const samlRepository = new InMemorySamlConfigurationRepository(testSamlConfiguration);
    const authConfig = createTestAuthConfig();
    const provider = new FakeSamlIdentityProvider({
      ...testSamlIdentity,
      email: 'admin@example.test',
      name: 'Admin User',
      nameId: 'admin@example.test',
    });
    const authService = new AuthService(authConfig, repository, provider);
    const app = Fastify();
    apps.add(app);
    await app.register(formbody);
    await registerAuthRoutes(app, authService);
    await registerAccessManagementRoutes(
      app,
      authService,
      new AccessManagementService(repository, samlRepository, authConfig)
    );
    const sessionCookie = await login(app);

    const createResponse = await app.inject({
      body: { email: 'new.user@example.test' },
      headers: { cookie: sessionCookie },
      method: 'POST',
      url: '/api/access/users',
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      email: 'new.user@example.test',
      role: 'member',
      status: 'active',
    });

    const updateResponse = await app.inject({
      body: { status: 'disabled' },
      headers: { cookie: sessionCookie },
      method: 'PATCH',
      url: '/api/access/users/new.user%40example.test',
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({ status: 'disabled' });

    const samlResponse = await app.inject({
      body: { ...testSamlConfiguration, requestTtlMinutes: 12 },
      headers: { cookie: sessionCookie },
      method: 'PUT',
      url: '/api/access/saml-configuration',
    });
    expect(samlResponse.statusCode).toBe(200);
    expect(samlResponse.json()).toMatchObject({
      configured: true,
      configurationSource: 'database',
      requestTtlMinutes: 12,
      samlEnabled: true,
    });

    const listResponse = await app.inject({
      headers: { cookie: sessionCookie },
      method: 'GET',
      url: '/api/access/users',
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().users).toHaveLength(2);
    expect(listResponse.json().samlConfiguration).toMatchObject({
      acsUrl: 'http://localhost:4000/api/auth/saml/acs',
      authEnabled: true,
      configured: true,
      idpEntityId: testSamlConfiguration.idpEntityId,
      metadataUrl: 'http://localhost:4000/api/auth/saml/metadata.xml',
      requestTtlMinutes: 12,
      spPrivateKeyConfigured: true,
      workspaceDomain: 'example.test',
    });
    expect(listResponse.payload).not.toContain('test-sp-private-key');
    expect(listResponse.payload).not.toContain('a-secure-session-secret');

    const invalidSamlResponse = await app.inject({
      body: { ...testSamlConfiguration, idpCertificate: 'not-a-certificate' },
      headers: { cookie: sessionCookie },
      method: 'PUT',
      url: '/api/access/saml-configuration',
    });
    expect(invalidSamlResponse.statusCode).toBe(400);
    expect(invalidSamlResponse.json()).toMatchObject({ code: 'INVALID_SAML_CONFIGURATION' });
  });

  it('does not expose or mutate access configuration for a member', async () => {
    const repository = new InMemoryAccessUserRepository([
      { email: 'member@example.test', role: 'member' },
    ]);
    const samlRepository = new InMemorySamlConfigurationRepository(testSamlConfiguration);
    const authConfig = createTestAuthConfig();
    const authService = new AuthService(
      authConfig,
      repository,
      new FakeSamlIdentityProvider({
        ...testSamlIdentity,
        email: 'member@example.test',
        nameId: 'member@example.test',
      })
    );
    const app = Fastify();
    apps.add(app);
    await app.register(formbody);
    await registerAuthRoutes(app, authService);
    await registerAccessManagementRoutes(
      app,
      authService,
      new AccessManagementService(repository, samlRepository, authConfig)
    );
    const sessionCookie = await login(app);

    const responses = await Promise.all([
      app.inject({
        headers: { cookie: sessionCookie },
        method: 'GET',
        url: '/api/access/users',
      }),
      app.inject({
        body: { email: 'new.user@example.test', role: 'admin' },
        headers: { cookie: sessionCookie },
        method: 'POST',
        url: '/api/access/users',
      }),
      app.inject({
        body: { role: 'admin' },
        headers: { cookie: sessionCookie },
        method: 'PATCH',
        url: '/api/access/users/member%40example.test',
      }),
      app.inject({
        body: testSamlConfiguration,
        headers: { cookie: sessionCookie },
        method: 'PUT',
        url: '/api/access/saml-configuration',
      }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        code: 'ADMIN_REQUIRED',
        message: 'Administrator access is required.',
      });
    }
    expect(responses[0].payload).not.toContain('samlConfiguration');
    expect(await repository.listUsers()).toHaveLength(1);
  });
});

async function login(app: ReturnType<typeof Fastify>) {
  const requestResponse = await app.inject({ method: 'GET', url: '/api/auth/saml/authn' });
  const authenticationRequest = requestResponse.json();
  const callbackResponse = await app.inject({
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
    payload: new URLSearchParams({
      RelayState: authenticationRequest.relayState,
      SAMLResponse: 'signed-saml-response',
    }).toString(),
    url: '/api/auth/saml/acs',
  });
  const sessionCookie = firstCookie(callbackResponse.headers['set-cookie']);
  if (!sessionCookie.startsWith('ptm_session=')) {
    throw new Error('Authentication test did not receive a session cookie.');
  }
  return sessionCookie;
}

function firstCookie(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value || '';
  return firstValue.split(';', 1)[0];
}
