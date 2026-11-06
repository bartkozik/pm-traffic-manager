import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerApiSecurityHooks } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { createAllowedAccessRepository } from './inMemoryAccess.repository.testSupport.js';
import { FakeSamlIdentityProvider, createTestAuthConfig } from './saml.testSupport.js';

describe('API auth guard', () => {
  const apps = new Set<FastifyInstance>();

  afterEach(async () => {
    await Promise.all([...apps].map((app) => app.close()));
    apps.clear();
  });

  it('protects business routes while keeping health and SAML routes public', async () => {
    const app = createApp();

    expect((await app.inject({ method: 'GET', url: '/api/boards/ptm-mvp' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/session' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/saml/authn' })).statusCode).not.toBe(401);
  });

  it('allows the configured MCP service token and credentialed CORS', async () => {
    const app = createApp();
    const response = await app.inject({
      headers: {
        authorization: 'Bearer mcp-service-token',
        origin: 'http://localhost:5173',
      },
      method: 'GET',
      url: '/api/boards/ptm-mvp',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  function createApp() {
    const app = Fastify();
    apps.add(app);
    const authService = new AuthService(
      createTestAuthConfig({ serviceToken: 'mcp-service-token' }),
      createAllowedAccessRepository(),
      new FakeSamlIdentityProvider()
    );
    registerApiSecurityHooks(app, authService, 'http://localhost:5173');
    app.get('/api/health', async () => ({ ok: true }));
    app.get('/api/auth/session', async () => ({ authenticated: false }));
    app.get('/api/auth/saml/authn', async () => ({ ok: true }));
    app.get('/api/boards/:boardId', async () => ({ ok: true }));
    return app;
  }
});
