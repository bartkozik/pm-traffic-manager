import { FastifyInstance } from 'fastify';
import { AuthService } from '../../auth/auth.service.js';
import {
  executeTrafficBoardCommandRequestSchema,
  currencyCodeSchema,
  fxRateSnapshotSchema,
  isoDateSchema,
  moveTrafficAllocationsRequestSchema,
  opportunityCheckResponseSchema,
  saveTrafficSnapshotRequestSchema,
  TrafficCommandMetadata,
  trafficBoardIdSchema,
  trafficBoardResponseSchema,
} from '@ptm/contracts';
import { getTrafficBoardCommandAuditAction } from '@ptm/domain';
import { TrafficBoardRealtimeHub } from '../realtime/trafficBoardRealtime.js';
import { FxRateNotFoundError, FxRateProviderError, NbpFxRateProvider } from '../services/fxRate.service.js';
import { OpportunityCheckModelError, OpportunityCheckService } from '../services/opportunityCheck.service.js';
import { TrafficBoardConflictError, TrafficBoardService } from '../services/trafficBoard.service.js';

export async function registerTrafficBoardRoutes(
  app: FastifyInstance,
  service: TrafficBoardService,
  opportunityCheckService: OpportunityCheckService,
  fxRateProvider: NbpFxRateProvider,
  realtimeHub?: TrafficBoardRealtimeHub,
  authService?: AuthService
) {
  app.get('/api/fx-rates/pln', async (request, reply) => {
    const query = request.query as { currency?: string; date?: string };
    const currency = currencyCodeSchema.parse(query.currency);
    const date = isoDateSchema.parse(query.date);

    try {
      return reply.send(fxRateSnapshotSchema.parse(await fxRateProvider.getAverageRateToPln(currency, date)));
    } catch (error) {
      if (error instanceof FxRateNotFoundError) {
        return reply.status(404).send({
          code: 'FX_RATE_NOT_FOUND',
          message: error.message,
        });
      }
      if (error instanceof FxRateProviderError) {
        request.log.warn({ error: error.message }, 'FX rate provider failed');
        return reply.status(502).send({
          code: 'FX_RATE_PROVIDER_FAILED',
          message: error.message,
        });
      }
      throw error;
    }
  });

  app.get('/api/boards/:boardId', async (request, reply) => {
    const params = request.params as { boardId: string };
    const boardId = trafficBoardIdSchema.parse(params.boardId);
    const response = trafficBoardResponseSchema.parse(await service.getOrCreate(boardId));
    return reply.send(response);
  });

  app.put('/api/boards/:boardId', async (request, reply) => {
    const params = request.params as { boardId: string };
    const boardId = trafficBoardIdSchema.parse(params.boardId);
    const body = saveTrafficSnapshotRequestSchema.parse(request.body);
    try {
      const response = trafficBoardResponseSchema.parse(await service.save(boardId, body.snapshot, {
        baseUpdatedAt: body.baseUpdatedAt,
      }));
      realtimeHub?.broadcastBoardUpdated(response, 'board_snapshot_saved');
      return reply.send(response);
    } catch (error) {
      if (error instanceof TrafficBoardConflictError) {
        const response = trafficBoardResponseSchema.parse(error.current);
        return reply.status(409).send({
          code: 'TRAFFIC_BOARD_CONFLICT',
          message: 'Traffic board changed since this snapshot was loaded.',
          current: response,
        });
      }
      throw error;
    }
  });

  app.post('/api/boards/:boardId/allocations/move', async (request, reply) => {
    const params = request.params as { boardId: string };
    const boardId = trafficBoardIdSchema.parse(params.boardId);
    const body = moveTrafficAllocationsRequestSchema.parse(request.body);
    const response = trafficBoardResponseSchema.parse(await service.moveAllocations(boardId, body.periodId, body.moves));
    realtimeHub?.broadcastBoardUpdated(response, 'allocations_moved');
    return reply.send(response);
  });

  app.post('/api/boards/:boardId/commands', async (request, reply) => {
    const params = request.params as { boardId: string };
    const boardId = trafficBoardIdSchema.parse(params.boardId);
    const body = executeTrafficBoardCommandRequestSchema.parse(request.body);
    const response = trafficBoardResponseSchema.parse(await service.executeCommand(
      boardId,
      body.command,
      createCommandAuditContext(
        body,
        await authService?.getRequestActor(request.headers.cookie, request.headers.authorization)
      )
    ));
    realtimeHub?.broadcastBoardUpdated(response, getTrafficBoardCommandAuditAction(body.command), body.commandId);
    return reply.send(response);
  });

  app.post('/api/boards/:boardId/reset', async (request, reply) => {
    const params = request.params as { boardId: string };
    const boardId = trafficBoardIdSchema.parse(params.boardId);
    const response = trafficBoardResponseSchema.parse(await service.reset(boardId));
    realtimeHub?.broadcastBoardUpdated(response, 'board_reset');
    return reply.send(response);
  });

  app.post('/api/boards/:boardId/periods/:periodId/ai-opportunity-check', async (request, reply) => {
    const params = request.params as { boardId: string; periodId: string };
    const boardId = trafficBoardIdSchema.parse(params.boardId);
    const periodId = params.periodId;
    const board = await service.getOrCreate(boardId);
    try {
      const response = opportunityCheckResponseSchema.parse(await opportunityCheckService.check(board, periodId));
      return reply.send(response);
    } catch (error) {
      if (error instanceof OpportunityCheckModelError) {
        request.log.warn({ error: error.message }, 'AI opportunity check failed');
        return reply.status(502).send({
          code: 'AI_CHECK_MODEL_FAILED',
          message: error.message,
        });
      }
      throw error;
    }
  });
}

function createCommandAuditContext(body: {
  actorId?: string;
  commandId: string;
  metadata?: TrafficCommandMetadata;
}, authenticatedActorId?: string): TrafficCommandMetadata {
  return {
    ...body.metadata,
    actorId: authenticatedActorId || body.metadata?.actorId || body.actorId,
    commandId: body.metadata?.commandId || body.commandId,
  };
}
