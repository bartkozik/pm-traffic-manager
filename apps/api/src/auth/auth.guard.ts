import type { FastifyInstance } from 'fastify';
import type { AuthService } from './auth.service.js';
import { isAllowedBrowserOrigin } from './browserOrigin.js';

export function registerApiSecurityHooks(
  app: FastifyInstance,
  authService: AuthService,
  corsOrigin: string
) {
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    const allowedOrigin = origin && isAllowedBrowserOrigin(origin, corsOrigin)
      ? origin
      : corsOrigin;
    reply.header('Access-Control-Allow-Origin', allowedOrigin);
    reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header('Access-Control-Allow-Headers', 'content-type, authorization');
    reply.header('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,OPTIONS');
    reply.header('Vary', 'Origin');

    if (
      authService.enabled &&
      request.method !== 'OPTIONS' &&
      !isPublicApiPath(request.raw.url) &&
      !await authService.isRequestAuthorized(request.headers.cookie, request.headers.authorization)
    ) {
      return reply.status(401).send({
        code: 'AUTH_REQUIRED',
        message: 'SAML authentication is required.',
      });
    }
  });
}

function isPublicApiPath(rawUrl: string | undefined) {
  const pathname = new URL(rawUrl || '/', 'http://localhost').pathname;
  return PUBLIC_API_PATHS.has(pathname);
}

const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/auth/session',
  '/api/auth/verify',
  '/api/auth/saml/authn',
  '/api/auth/saml/acs',
  '/api/auth/saml/metadata.xml',
  '/api/auth/logout',
]);
