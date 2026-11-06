import formbody from '@fastify/formbody';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerAuthRoutes } from './auth.router.js';
import { AuthService } from './auth.service.js';
import { createAllowedAccessRepository } from './inMemoryAccess.repository.testSupport.js';
import { FakeSamlIdentityProvider, createTestAuthConfig } from './saml.testSupport.js';

describe('auth routes', () => {
  const apps = new Set<FastifyInstance>();

  afterEach(async () => {
    await Promise.all([...apps].map((app) => app.close()));
    apps.clear();
  });

  it('creates an AuthnRequest, completes the SAML POST and exposes the authenticated session', async () => {
    const authService = new AuthService(
      createTestAuthConfig(),
      createAllowedAccessRepository('anna@example.test', 'admin'),
      new FakeSamlIdentityProvider()
    );
    const app = Fastify();
    apps.add(app);
    await app.register(formbody);
    await registerAuthRoutes(app, authService);

    const unauthorizedVerifyResponse = await app.inject({ method: 'GET', url: '/api/auth/verify' });
    expect(unauthorizedVerifyResponse.statusCode).toBe(401);

    const loginResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/saml/authn?returnTo=%2Fdiablo-board%2Fptm-mvp',
    });
    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.json()).toEqual({
      relayState: '/diablo-board/ptm-mvp',
      samlRequest: 'base64-saml-request',
      ssoUrl: 'https://accounts.google.test/saml',
    });

    const callbackResponse = await app.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: new URLSearchParams({
        RelayState: '/diablo-board/ptm-mvp',
        SAMLResponse: 'signed-saml-response',
      }).toString(),
      url: '/api/auth/saml/acs',
    });
    expect(callbackResponse.statusCode).toBe(302);
    expect(callbackResponse.headers.location).toBe('http://localhost:5173/diablo-board/ptm-mvp');

    const sessionCookie = firstCookie(callbackResponse.headers['set-cookie']);
    expect(sessionCookie).toMatch(/^ptm_session=/);

    const sessionResponse = await app.inject({
      headers: { cookie: sessionCookie },
      method: 'GET',
      url: '/api/auth/session',
    });
    expect(sessionResponse.json()).toMatchObject({
      authenticated: true,
      authEnabled: true,
      user: { email: 'anna@example.test', role: 'admin' },
      workspaceDomain: 'example.test',
    });

    const authorizedVerifyResponse = await app.inject({
      headers: { cookie: sessionCookie },
      method: 'GET',
      url: '/api/auth/verify',
    });
    expect(authorizedVerifyResponse.statusCode).toBe(204);
  });

  it('publishes signed service-provider metadata', async () => {
    const app = Fastify();
    apps.add(app);
    await registerAuthRoutes(app, new AuthService(
      createTestAuthConfig(),
      createAllowedAccessRepository(),
      new FakeSamlIdentityProvider()
    ));

    const response = await app.inject({ method: 'GET', url: '/api/auth/saml/metadata.xml' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/samlmetadata+xml');
    expect(response.payload).toContain('EntityDescriptor');
  });

  it('redirects an invalid callback to a safe login error', async () => {
    const app = Fastify();
    apps.add(app);
    await app.register(formbody);
    await registerAuthRoutes(app, new AuthService(
      createTestAuthConfig(),
      createAllowedAccessRepository(),
      new FakeSamlIdentityProvider()
    ));

    const response = await app.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: new URLSearchParams({ RelayState: '/' }).toString(),
      url: '/api/auth/saml/acs',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('http://localhost:5173/login?auth_error=invalid_response');
    expect(response.payload).not.toContain('SAMLResponse');
  });
});

function firstCookie(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value || '';
  return firstValue.split(';', 1)[0];
}
