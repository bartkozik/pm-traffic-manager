import formbody from '@fastify/formbody';
import Fastify, { FastifyInstance } from 'fastify';
import { createBootstrapAccessUsers } from './auth/access.defaults.js';
import { registerAccessManagementRoutes } from './auth/access.router.js';
import { AccessManagementService } from './auth/access.service.js';
import { PostgresAccessUserRepository } from './auth/postgresAccess.repository.js';
import { PostgresSamlConfigurationRepository } from './auth/postgresSamlConfiguration.repository.js';
import { PostgresSamlRequestCache } from './auth/postgresSamlRequestCache.js';
import { SamlWorkspaceIdentityProvider } from './auth/samlIdentity.provider.js';
import { AuthService } from './auth/auth.service.js';
import { registerAuthRoutes } from './auth/auth.router.js';
import { registerApiSecurityHooks } from './auth/auth.guard.js';
import { ApiConfig } from './config.js';
import { createPostgresPool, initializePostgresDatabase } from './db/postgres.js';
import { PostgresTrafficBoardRepository } from './traffic/repositories/postgresTrafficBoard.repository.js';
import { TrafficBoardRealtimeHub } from './traffic/realtime/trafficBoardRealtime.js';
import { registerTrafficBoardRoutes } from './traffic/routers/trafficBoard.router.js';
import { NbpFxRateProvider } from './traffic/services/fxRate.service.js';
import { OpportunityCheckService } from './traffic/services/opportunityCheck.service.js';
import { TrafficBoardService } from './traffic/services/trafficBoard.service.js';

export async function buildApp(config: ApiConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      serializers: {
        req(request) {
          return {
            host: request.hostname,
            method: request.method,
            remoteAddress: request.ip,
            remotePort: request.socket.remotePort,
            url: stripQueryString(request.url),
          };
        },
      },
    },
  });
  const pool = createPostgresPool(config.databaseUrl);
  await initializePostgresDatabase(pool);
  await app.register(formbody);
  const accessRepository = new PostgresAccessUserRepository(pool);
  const samlConfigurationRepository = new PostgresSamlConfigurationRepository(pool);
  await accessRepository.seedUsers(createBootstrapAccessUsers(config.auth.allowedEmails));
  await samlConfigurationRepository.seedConfiguration(config.auth.samlBootstrap);
  const samlProvider = new SamlWorkspaceIdentityProvider(
    config.auth,
    samlConfigurationRepository,
    (expirationMs) => new PostgresSamlRequestCache(pool, expirationMs)
  );
  const authService = new AuthService(config.auth, accessRepository, samlProvider);
  const accessManagementService = new AccessManagementService(
    accessRepository,
    samlConfigurationRepository,
    config.auth
  );
  const boardService = new TrafficBoardService(new PostgresTrafficBoardRepository(pool));
  const opportunityCheckService = new OpportunityCheckService({
    anthropicApiKey: config.anthropicApiKey,
    model: config.aiModel,
    openAiApiKey: config.openAiApiKey,
    provider: config.aiProvider,
  });
  const fxRateProvider = new NbpFxRateProvider(config.fxRateProviderBaseUrl);
  const realtimeHub = new TrafficBoardRealtimeHub(boardService, authService, config.corsOrigin);
  realtimeHub.attach(app);
  registerApiSecurityHooks(app, authService, config.corsOrigin);

  app.options('*', async (_request, reply) => {
    return reply.status(204).send();
  });

  app.get('/api/health', async () => ({
    ok: true,
    database: 'postgres',
    databaseUrl: sanitizeDatabaseUrl(config.databaseUrl),
  }));

  await registerAuthRoutes(app, authService);
  await registerAccessManagementRoutes(app, authService, accessManagementService, {
    onAccessDisabled: (email) => realtimeHub.disconnectActor(email),
  });

  await registerTrafficBoardRoutes(app, boardService, opportunityCheckService, fxRateProvider, realtimeHub, authService);

  app.addHook('onClose', async () => {
    await pool.end();
  });

  return app;
}

export function stripQueryString(url: string) {
  return url.split('?', 1)[0];
}

function sanitizeDatabaseUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return 'configured';
  }
}
