import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { isTrustedDemoProxy } from './demoProxy.js';

describe('demo proxy trust', () => {
  it.each(['172.18.0.2', '10.0.0.2', '192.168.0.2', '127.0.0.1', '::1', '::ffff:172.18.0.2'])('trusts only the nearest private peer %s', (address) => {
    expect(isTrustedDemoProxy(address, 0)).toBe(true);
    expect(isTrustedDemoProxy(address, 1)).toBe(false);
  });
  it.each(['203.0.113.3', '172.15.0.2', '172.32.0.2', '192.169.0.2', '::ffff:203.0.113.3', '172.18.0.999', 'invalid'])('rejects untrusted peer %s', (address) => {
    expect(isTrustedDemoProxy(address, 0)).toBe(false);
  });
  it('ignores forwarded client addresses from a direct public peer', async () => {
    const app = Fastify({ trustProxy: isTrustedDemoProxy });
    app.get('/', async (request) => ({ ip: request.ip }));
    try {
      const direct = await app.inject({ url: '/', remoteAddress: '203.0.113.3', headers: { 'x-forwarded-for': '198.51.100.4' } });
      expect(direct.json().ip).toBe('203.0.113.3');
      const proxied = await app.inject({ url: '/', remoteAddress: '172.18.0.2', headers: { 'x-forwarded-for': '198.51.100.5, 198.51.100.4' } });
      expect(proxied.json().ip).toBe('198.51.100.4');
    } finally { await app.close(); }
  });
});
