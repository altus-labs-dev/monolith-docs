function parseCorsOrigins(raw: string | undefined): string[] | true {
  if (!raw || raw === '*') return true; // fastify/cors uses `true` for wildcard
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export const config = {
  port: Number(process.env['PORT'] ?? 3020),
  host: process.env['HOST'] ?? '0.0.0.0',
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  // OnlyOffice DocumentServer
  onlyofficeUrl: process.env['ONLYOFFICE_URL'] ?? 'http://onlyoffice:80',
  onlyofficePublicUrl: process.env['ONLYOFFICE_PUBLIC_URL'] ?? 'http://localhost:8080',
  onlyofficeJwtSecret: process.env['ONLYOFFICE_JWT_SECRET'] ?? 'secret',

  // Public URL (used for editor page URLs shown to the user)
  apiPublicUrl: process.env['API_PUBLIC_URL'] ?? 'http://localhost:3020',

  // Internal URL (used for OnlyOffice callback — must be reachable from the OnlyOffice container)
  apiInternalUrl: process.env['API_INTERNAL_URL'] ?? 'http://api:3020',

  // GCS — optional, only needed if Docs generates its own signed URLs
  gcsProjectId: process.env['GCS_PROJECT_ID'] ?? '',
  gcsBucket: process.env['GCS_BUCKET'] ?? '',

  // Signed URL TTL (default 4 hours — long enough for an editing session)
  signedUrlTtlMs: Number(process.env['SIGNED_URL_TTL_MS'] ?? 4 * 60 * 60 * 1000),

  // CORS — comma-separated list of allowed origins; wildcard only valid in dev
  corsOrigins: parseCorsOrigins(process.env['CORS_ORIGINS']),

  // Rate limiting (per IP, per window)
  rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
  rateLimitWindowMs: Number(process.env['RATE_LIMIT_WINDOW_MS'] ?? 60_000),

  // Session lifecycle
  sessionTtlMs: Number(process.env['SESSION_TTL_MS'] ?? 24 * 60 * 60 * 1000),
  sessionCleanupIntervalMs: Number(process.env['SESSION_CLEANUP_INTERVAL_MS'] ?? 15 * 60 * 1000),
} as const;
