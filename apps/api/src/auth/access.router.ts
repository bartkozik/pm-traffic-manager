import {
  appAccessUserSchema,
  appAccessUsersResponseSchema,
  appSamlConfigurationSchema,
  createAppAccessUserRequestSchema,
  updateAppSamlConfigurationRequestSchema,
  updateAppAccessUserRequestSchema,
} from '@ptm/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import {
  AccessUserAlreadyExistsError,
  AccessUserNotFoundError,
  LastActiveAdminError,
} from './access.repository.js';
import {
  AccessEmailOutsideWorkspaceError,
  AccessManagementForbiddenError,
  AccessManagementService,
  CannotModifyOwnAccessError,
} from './access.service.js';
import type { AuthService } from './auth.service.js';
import { InvalidSamlConfigurationError } from './samlConfiguration.validation.js';

export async function registerAccessManagementRoutes(
  app: FastifyInstance,
  authService: AuthService,
  service: AccessManagementService,
  options: { onAccessDisabled?: (email: string) => void } = {}
) {
  app.get('/api/access/users', async (request, reply) => {
    const actor = await authService.getSession(request.headers.cookie);
    if (!actor) return sendAccessError(reply, new AccessManagementForbiddenError());
    try {
      return reply.send(appAccessUsersResponseSchema.parse(await service.getOverview(actor)));
    } catch (error) {
      return sendAccessError(reply, error);
    }
  });

  app.post('/api/access/users', async (request, reply) => {
    const actor = await authService.getSession(request.headers.cookie);
    if (!actor) return sendAccessError(reply, new AccessManagementForbiddenError());
    try {
      const input = createAppAccessUserRequestSchema.parse(request.body);
      const user = await service.createUser(actor, input);
      return reply.status(201).send(appAccessUserSchema.parse(user));
    } catch (error) {
      return sendAccessError(reply, error);
    }
  });

  app.patch('/api/access/users/:email', async (request, reply) => {
    const actor = await authService.getSession(request.headers.cookie);
    if (!actor) return sendAccessError(reply, new AccessManagementForbiddenError());
    try {
      const params = request.params as { email: string };
      const input = updateAppAccessUserRequestSchema.parse(request.body);
      const user = await service.updateUser(actor, decodeURIComponent(params.email), input);
      if (user.status === 'disabled') options.onAccessDisabled?.(user.email);
      return reply.send(appAccessUserSchema.parse(user));
    } catch (error) {
      return sendAccessError(reply, error);
    }
  });

  app.put('/api/access/saml-configuration', async (request, reply) => {
    const actor = await authService.getSession(request.headers.cookie);
    if (!actor) return sendAccessError(reply, new AccessManagementForbiddenError());
    try {
      const input = updateAppSamlConfigurationRequestSchema.parse(request.body);
      const configuration = await service.updateSamlConfiguration(actor, input);
      return reply.send(appSamlConfigurationSchema.parse(configuration));
    } catch (error) {
      return sendAccessError(reply, error);
    }
  });
}

function sendAccessError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    return reply.status(400).send({ code: 'INVALID_ACCESS_REQUEST', message: 'Invalid access request.' });
  }
  if (error instanceof AccessManagementForbiddenError) {
    return reply.status(403).send({ code: 'ADMIN_REQUIRED', message: error.message });
  }
  if (error instanceof AccessEmailOutsideWorkspaceError) {
    return reply.status(400).send({ code: 'EMAIL_OUTSIDE_WORKSPACE', message: error.message });
  }
  if (error instanceof AccessUserAlreadyExistsError) {
    return reply.status(409).send({ code: 'ACCESS_ALREADY_EXISTS', message: error.message });
  }
  if (error instanceof AccessUserNotFoundError) {
    return reply.status(404).send({ code: 'ACCESS_NOT_FOUND', message: error.message });
  }
  if (error instanceof LastActiveAdminError) {
    return reply.status(409).send({ code: 'LAST_ACTIVE_ADMIN', message: error.message });
  }
  if (error instanceof CannotModifyOwnAccessError) {
    return reply.status(409).send({ code: 'CANNOT_MODIFY_SELF', message: error.message });
  }
  if (error instanceof InvalidSamlConfigurationError) {
    return reply.status(400).send({ code: 'INVALID_SAML_CONFIGURATION', message: error.message });
  }
  throw error;
}
