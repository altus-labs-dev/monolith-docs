import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { authPlugin } from './auth.js';
import { healthRoutes } from './routes/health.js';
import { documentRoutes } from './routes/documents.js';
import { fileRoutes } from './routes/files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function buildApp() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  app.register(cors);
  app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
  app.register(authPlugin);

  // Serve test fixture files at /files/ (used for local dev/testing)
  app.register(fastifyStatic, {
    root: path.join(__dirname, 'fixtures'),
    prefix: '/files/',
    decorateReply: false,
  });

  app.register(healthRoutes);
  app.register(documentRoutes);
  app.register(fileRoutes);

  return app;
}
