import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok' });
  });

  app.get('/api/status', async (_req, reply) => {
    try {
      const res = await fetch(`${config.onlyofficeUrl}/healthcheck`);
      const text = await res.text();
      return reply.send({
        api: 'ok',
        onlyoffice: res.ok ? 'ok' : 'unhealthy',
        onlyofficeResponse: text,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      return reply.send({
        api: 'ok',
        onlyoffice: 'unreachable',
        error: message,
      });
    }
  });
}
