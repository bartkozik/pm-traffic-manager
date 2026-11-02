import {
  authSessionResponseSchema,
  samlAuthenticationRequestSchema,
} from '@ptm/contracts';
import type { FastifyInstance } from 'fastify';
import { AuthFlowError, AuthService, type AuthErrorCode } from './auth.service.js';

export async function registerAuthRoutes(app: FastifyInstance, authService: AuthService) {
  app.get('/api/auth/session', async (request, reply) => {
    return reply.send(authSessionResponseSchema.parse(await authService.getSessionResponse(request.headers.cookie)));
  });

  app.get('/api/auth/verify', async (request, reply) => {
    if (
      !authService.enabled ||
      await authService.isRequestAuthorized(request.headers.cookie, request.headers.authorization)
    ) {
      return reply.status(204).send();
    }

    return reply.status(401).send({
      code: 'AUTH_REQUIRED',
      message: 'SAML authentication is required.',
    });
  });

  app.get('/api/auth/saml/authn', async (request, reply) => {
    try {
      const query = request.query as { returnTo?: string };
      const authenticationRequest = await authService.createAuthenticationRequest(query.returnTo);
      return reply.send(samlAuthenticationRequestSchema.parse(authenticationRequest));
    } catch (error) {
      const code = getAuthErrorCode(error);
      request.log.warn(getAuthLogContext(error), 'Unable to start SAML authentication');
      return reply.status(code === 'saml_failed' ? 502 : 503).send({
        code: code.toUpperCase(),
        message: 'Nie udało się rozpocząć logowania SAML.',
      });
    }
  });

  app.get('/api/auth/saml/metadata.xml', async (request, reply) => {
    try {
      return reply.type('application/samlmetadata+xml').send(authService.getServiceProviderMetadata());
    } catch (error) {
      const code = getAuthErrorCode(error);
      request.log.warn(getAuthLogContext(error), 'Unable to generate SAML service provider metadata');
      return reply.status(503).send({
        code: code.toUpperCase(),
        message: 'Metadane SAML nie są dostępne.',
      });
    }
  });

  app.post('/api/auth/saml/acs', async (request, reply) => {
    const body = request.body as { RelayState?: unknown; SAMLResponse?: unknown } | undefined;
    try {
      const result = await authService.completeLogin({
        relayState: getStringValue(body?.RelayState),
        samlResponse: getStringValue(body?.SAMLResponse),
      });
      reply.header('Set-Cookie', result.sessionCookie);
      return reply.redirect(authService.getWebAppRedirect(result.returnTo));
    } catch (error) {
      const code = getAuthErrorCode(error);
      request.log.warn(getAuthLogContext(error), 'SAML authentication failed');
      reply.header('Set-Cookie', authService.getLogoutCookie());
      return reply.redirect(authService.getWebAppRedirect('/', code));
    }
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.header('Set-Cookie', authService.getLogoutCookie());
    return reply.status(204).send();
  });
}

function getAuthErrorCode(error: unknown): AuthErrorCode {
  return error instanceof AuthFlowError ? error.code : 'saml_failed';
}

function getAuthLogContext(error: unknown) {
  const cause = error instanceof AuthFlowError ? error.cause : error;
  return {
    code: getAuthErrorCode(error),
    reason: cause instanceof Error ? cause.message.slice(0, 300) : undefined,
  };
}

function getStringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}
