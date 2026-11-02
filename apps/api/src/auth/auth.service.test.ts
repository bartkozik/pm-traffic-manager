import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service.js';
import { createAllowedAccessRepository } from './inMemoryAccess.repository.testSupport.js';
import {
  FakeSamlIdentityProvider,
  createTestAuthConfig,
  testSamlIdentity,
} from './saml.testSupport.js';

describe('AuthService', () => {
  it('creates a verified session for an allowed Workspace account', async () => {
    const provider = new FakeSamlIdentityProvider();
    const service = new AuthService(
      createTestAuthConfig(),
      createAllowedAccessRepository(),
      provider,
      { now: () => 1_800_000_000_000 }
    );
    const request = await service.createAuthenticationRequest('/diablo-board/ptm-mvp?view=month');

    const result = await service.completeLogin({
      relayState: request.relayState,
      samlResponse: 'signed-saml-response',
    });

    expect(result.returnTo).toBe('/diablo-board/ptm-mvp?view=month');
    expect(result.user).toMatchObject({
      email: 'anna@example.test',
      organizationDomain: 'example.test',
      name: "Avery Kowalska",
      role: 'member',
    });
    expect(await service.getSession(result.sessionCookie)).toEqual(result.user);
    expect(await service.getRequestActor(result.sessionCookie)).toBe('anna@example.test');
  });

  it('rejects a valid organization user who is not on the allowlist', async () => {
    const provider = new FakeSamlIdentityProvider({
      ...testSamlIdentity,
      email: 'outsider@example.test',
      nameId: 'outsider@example.test',
    });
    const service = new AuthService(createTestAuthConfig(), createAllowedAccessRepository(), provider);

    await expect(service.completeLogin({ samlResponse: 'signed-saml-response' }))
      .rejects.toMatchObject({ code: 'unauthorized_email' });
  });

  it('rejects an identity from outside the configured Workspace', async () => {
    const provider = new FakeSamlIdentityProvider({
      ...testSamlIdentity,
      email: 'anna@gmail.com',
      nameId: 'anna@gmail.com',
    });
    const service = new AuthService(createTestAuthConfig(), createAllowedAccessRepository(), provider);

    await expect(service.completeLogin({ samlResponse: 'signed-saml-response' }))
      .rejects.toMatchObject({ code: 'wrong_workspace' });
  });

  it('rejects missing SAML responses and tampered session cookies', async () => {
    const service = new AuthService(
      createTestAuthConfig(),
      createAllowedAccessRepository(),
      new FakeSamlIdentityProvider()
    );

    await expect(service.completeLogin({})).rejects.toMatchObject({ code: 'invalid_response' });
    expect(await service.getSession('ptm_session=invalid.signature')).toBeUndefined();
  });

  it('maps provider validation failures to a safe SAML error', async () => {
    const service = new AuthService(
      createTestAuthConfig(),
      createAllowedAccessRepository(),
      new FakeSamlIdentityProvider(testSamlIdentity, new Error('sensitive XML detail'))
    );

    await expect(service.completeLogin({ samlResponse: 'invalid-response' }))
      .rejects.toMatchObject({ code: 'saml_failed', message: 'SAML identity could not be verified.' });
  });

  it('supports a dedicated bearer token for the local MCP client', async () => {
    const service = new AuthService(
      createTestAuthConfig({ serviceToken: 'mcp-secret-token' }),
      createAllowedAccessRepository(),
      new FakeSamlIdentityProvider()
    );

    expect(await service.getRequestActor(undefined, 'Bearer mcp-secret-token')).toBe('ptm-mcp-agent');
    expect(await service.isRequestAuthorized(undefined, 'Bearer wrong-token')).toBe(false);
  });

  it('expires signed sessions at the configured deadline', async () => {
    let now = 1_800_000_000_000;
    const service = new AuthService(
      createTestAuthConfig({ sessionTtlHours: 1 }),
      createAllowedAccessRepository(),
      new FakeSamlIdentityProvider(),
      { now: () => now }
    );
    const result = await service.completeLogin({ samlResponse: 'signed-saml-response' });

    expect(service.getSessionExpiresAt(result.sessionCookie)).toBe(now + 60 * 60 * 1000);
    now += 60 * 60 * 1000;
    expect(await service.getSession(result.sessionCookie)).toBeUndefined();
  });

  it('invalidates an existing session when database access is disabled', async () => {
    const accessRepository = createAllowedAccessRepository();
    const service = new AuthService(
      createTestAuthConfig(),
      accessRepository,
      new FakeSamlIdentityProvider()
    );
    const result = await service.completeLogin({ samlResponse: 'signed-saml-response' });

    await accessRepository.updateUser(
      'anna@example.test',
      { status: 'disabled' },
      'admin@example.test'
    );

    expect(await service.getSession(result.sessionCookie)).toBeUndefined();
    expect(await service.isRequestAuthorized(result.sessionCookie)).toBe(false);
  });

  it('sanitizes external return paths', async () => {
    const provider = new FakeSamlIdentityProvider();
    const service = new AuthService(createTestAuthConfig(), createAllowedAccessRepository(), provider);

    await service.createAuthenticationRequest('//malicious.example/path');

    expect(provider.requestedReturnTo).toBe('/');
    expect(service.getWebAppRedirect('//malicious.example/path')).toBe('http://localhost:5173/');
  });
});
