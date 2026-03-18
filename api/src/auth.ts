import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { findConsumerByApiKey, getConsumers, getJwksConsumers } from './consumers.js';
import type { Consumer, JwksAuth } from './consumers.js';

declare module 'fastify' {
  interface FastifyRequest {
    consumer?: Consumer;
    consumerId?: string;
  }
}

const jwksClients = new Map<string, jwksClient.JwksClient>();

function getJwksClient(jwksUrl: string): jwksClient.JwksClient {
  let client = jwksClients.get(jwksUrl);
  if (!client) {
    client = jwksClient({ jwksUri: jwksUrl, cache: true, rateLimit: true });
    jwksClients.set(jwksUrl, client);
  }
  return client;
}

async function verifyJwksToken(token: string, auth: JwksAuth): Promise<jwt.JwtPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      (header, callback) => {
        const client = getJwksClient(auth.jwksUrl);
        client.getSigningKey(header.kid, (err, key) => {
          if (err || !key) return callback(err ?? new Error('No signing key found'));
          callback(null, key.getPublicKey());
        });
      },
      {
        audience: auth.audience,
        issuer: auth.issuer,
      },
      (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded as jwt.JwtPayload);
      },
    );
  });
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('consumer', undefined);
  app.decorateRequest('consumerId', undefined);

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health, status, editor pages, static files, and callback (OnlyOffice calls this)
    const skipPaths = ['/health', '/api/status', '/api/documents/callback'];
    if (
      skipPaths.some(p => req.url === p) ||
      req.url.startsWith('/editor/') ||
      req.url.startsWith('/files/')
    ) {
      return;
    }

    // Skip auth entirely if no consumers configured (local dev mode)
    if (getConsumers().length === 0) {
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return reply.status(401).send({ error: 'Missing Authorization header' });
    }

    // API key: "Bearer <api-key>"
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);

      // Try API key first
      const consumer = findConsumerByApiKey(token);
      if (consumer) {
        req.consumer = consumer;
        req.consumerId = consumer.id;
        return;
      }

      // Try JWKS consumers
      const jwksConsumers = getJwksConsumers();
      for (const c of jwksConsumers) {
        if (c.auth.mode !== 'jwks') continue;
        try {
          await verifyJwksToken(token, c.auth);
          req.consumer = c;
          req.consumerId = c.id;
          return;
        } catch {
          // Try next consumer
        }
      }
    }

    return reply.status(401).send({ error: 'Invalid or expired credentials' });
  });
}
