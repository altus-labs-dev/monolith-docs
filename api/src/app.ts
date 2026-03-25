import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { authPlugin } from './auth.js';
import { healthRoutes } from './routes/health.js';
import { documentRoutes } from './routes/documents.js';
import { fileRoutes } from './routes/files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = config.nodeEnv === 'production';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
  });

  app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

  app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    allowList: (req) => req.url === '/api/documents/callback',
  });

  app.register(authPlugin);

  // Security headers
  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-XSS-Protection', '0');

    if (isProduction) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // CSP: restrictive for API, none for editor (OnlyOffice needs inline scripts + eval)
    if (req.url.startsWith('/editor/')) {
      // OnlyOffice editor requires inline scripts, eval, iframes — don't set CSP
    } else if (req.url.startsWith('/api/')) {
      reply.header('Content-Security-Policy', "default-src 'none'");
    }
  });

  // Serve test fixture files at /files/ — dev/test only
  if (!isProduction) {
    app.register(fastifyStatic, {
      root: path.join(__dirname, 'fixtures'),
      prefix: '/files/',
      decorateReply: false,
    });
  }

  app.register(healthRoutes);
  app.register(documentRoutes);
  app.register(fileRoutes);

  return app;
}
