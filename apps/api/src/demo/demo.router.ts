import type { FastifyInstance } from 'fastify';
import { DemoError, DemoRepository, demoSessionResponse } from './demo.repository.js';
import type { TrafficBoardRealtimeHub } from '../traffic/realtime/trafficBoardRealtime.js';

export function registerDemoRoutes(app: FastifyInstance, repository: DemoRepository, origin: string, aiAvailable: boolean, realtime: TrafficBoardRealtimeHub) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DemoError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
    const statusCode = error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.code(statusCode < 500 ? statusCode : 500).send({ code: 'DEMO_REQUEST_FAILED', message: 'The demo request could not be completed.' });
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const path = new URL(request.url, 'http://localhost').pathname;
    const sessionRoute = path === '/api/demo/session';
    const boardMatch = path.match(/^\/api\/boards\/([^/]+)(?:\/(?:commands|allocations\/move|periods\/[^/]+\/ai-opportunity-check))?$/);
    if (path === '/api/health') return;
    if (!sessionRoute && path !== '/api/demo/reset' && !boardMatch && path !== '/api/fx-rates/pln') return reply.code(404).send({ message: 'Not found.' });
    if (request.headers.origin && request.headers.origin !== origin) throw new DemoError(403, 'DEMO_ORIGIN_REQUIRED', 'Use the demo from its own website.');
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.origin !== origin) throw new DemoError(403, 'DEMO_ORIGIN_REQUIRED', 'Use the demo from its own website.');
    if (sessionRoute && request.method === 'POST') return;
    await repository.authenticate(request.headers.cookie, boardMatch?.[1]);
  });
  app.get('/api/demo/session', async (request) => demoSessionResponse(await repository.authenticate(request.headers.cookie), aiAvailable));
  app.post('/api/demo/session', async (request, reply) => {
    try { return demoSessionResponse(await repository.authenticate(request.headers.cookie), aiAvailable); }
    catch (error) { if (!(error instanceof DemoError) || error.statusCode !== 401) throw error; }
    const { session, token } = await repository.create(request.ip);
    reply.header('Set-Cookie', `__Host-ptm-demo=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`);
    return demoSessionResponse(session, aiAvailable);
  });
  app.post('/api/demo/reset', async (request) => {
    const session = await repository.authenticate(request.headers.cookie);
    const next = await repository.reset(session.token_hash);
    realtime.disconnectActor(session.token_hash);
    return demoSessionResponse(next, aiAvailable);
  });
  const timer = setInterval(() => { void repository.cleanup().catch(() => app.log.error('Demo session cleanup failed.')); }, 60000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}
