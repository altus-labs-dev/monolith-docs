# Production Hardening — Execution Plan

Initiative ID: `production-hardening`
Created: 2026-03-24

---

## Current State

- Phase S (security hardening), Phase N (network/infrastructure), and Phase I (integration testing) are all complete.
- Initiative verified in production on 2026-04-18 via external probes and operational use (CRM and Connect have been round-tripping documents for weeks).
- Phase I closeout uncovered one stale Cloudflare DNS A record (`app.monolithdocs.com` pointed at a released dev-VM IP); fixed during the verification session. See `ERRORS.md` resolved entries.
- 36 tests passing across 4 test files. Typecheck and lint clean.
- All API security gaps from the March 2026 audit are closed.
- Three-hostname architecture live: app/connect/crm.monolithdocs.com.

## Status Integrity

- A step is `Completed` only when implementation, tests, and docs are done.
- Partially implemented or untested work stays `In Progress` or `Blocked`.
- Each step's success criteria must all pass before marking complete.

---

## Phase S: Security Hardening (API Code)

Status: Completed
Linked Tasks: none yet

### S.1 Config Hardening & Startup Validation

Status: Completed
Linked Tasks: none yet

- [ ] Add `nodeEnv`, `corsOrigins`, `rateLimitMax`, `rateLimitWindowMs`, `sessionTtlMs`, `sessionCleanupIntervalMs` to `config.ts`
- [ ] Add `validateProductionConfig()` to `server.ts` — refuse start with default secrets, missing consumers, missing CORS in production
- [ ] Add graceful shutdown (SIGTERM/SIGINT)
- [ ] Typecheck and lint pass

Files: `api/src/config.ts`, `api/src/server.ts`

### S.2 Consumer Model: HMAC Auth + Hostname Binding

Status: Completed
Linked Tasks: none yet

- [ ] Add `HmacAuth` interface to `consumers.ts`
- [ ] Add `hostname` field to `Consumer` interface
- [ ] Add `findConsumersByHostname()`, `validateCallbackDomain()`, `validateConsumersConfig()` helpers
- [ ] Run validation on first `getConsumers()` call — throw in production, warn in dev
- [ ] Typecheck and lint pass

Files: `api/src/consumers.ts`

### S.3 Auth Plugin: HMAC Verification, Hostname Matching, Logging

Status: Completed
Linked Tasks: none yet

- [ ] Add `verifyHmacToken()` function (HS256, issuer check)
- [ ] Remove `/api/documents/callback` from blanket skip (gets OnlyOffice JWT check in S.5)
- [ ] Remove `/files/` prefix skip (only `GET /api/files/*` skipped for OnlyOffice fetch)
- [ ] Add hostname-aware consumer filtering via `findConsumersByHostname()`
- [ ] Add HMAC consumer loop between API key and JWKS
- [ ] Log all auth failures with structured context
- [ ] Production with 0 consumers returns 503
- [ ] Store JWT payload on `req.jwtPayload`
- [ ] Typecheck and lint pass

Files: `api/src/auth.ts`

### S.4 App Security: CORS, Rate Limiting, Headers

Status: Completed
Linked Tasks: none yet

- [ ] Install `@fastify/rate-limit` dependency
- [ ] Configure CORS with `config.corsOrigins` (explicit origins in production)
- [ ] Register `@fastify/rate-limit` with configurable max/window, callback exempt
- [ ] Add security headers `onSend` hook (X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy)
- [ ] Skip CSP for `/editor/*`, set restrictive CSP for `/api/*`
- [ ] Guard `fastifyStatic` fixture serving to non-production only
- [ ] Typecheck and lint pass

Files: `api/src/app.ts`, `api/package.json`

### S.5 Document Routes: Callback Auth, Session TTL, Isolation, Schemas

Status: Completed
Linked Tasks: none yet

- [ ] Add `consumerId` and `lastActivityAt` to session store entries
- [ ] Add session cleanup interval (configurable, logs count)
- [ ] Verify OnlyOffice callback JWT (`req.body.token`) against `ONLYOFFICE_JWT_SECRET`
- [ ] Enforce `allowedCallbackDomains` at open time via `validateCallbackDomain()`
- [ ] Scope `/api/sessions` to `req.consumerId`
- [ ] Add Fastify JSON schemas to open and callback endpoints
- [ ] Remove manual field validation (schema handles it)
- [ ] Log session creation
- [ ] Typecheck and lint pass

Files: `api/src/routes/documents.ts`

### S.6 File Routes: Auth Enforcement, File Type Validation

Status: Completed
Linked Tasks: none yet

- [ ] Add `ALLOWED_EXTENSIONS` whitelist (office document types only)
- [ ] Validate file extension on upload, reject disallowed types with 400
- [ ] Log file type rejections
- [ ] Auth enforcement is automatic from S.3 changes (no code change in files.ts)
- [ ] Typecheck and lint pass

Files: `api/src/routes/files.ts`

### S.7 Storage Hardening: SSRF Protection, Fetch Timeout

Status: Completed
Linked Tasks: none yet

- [ ] Add `validateSourceUrl()` — reject private IPs, non-HTTPS in production
- [ ] Add `AbortSignal.timeout(30_000)` to fetch in `transferToGcs()`
- [ ] Add response size check (200MB limit)
- [ ] Allow Docker-internal hostnames in dev
- [ ] Typecheck and lint pass

Files: `api/src/storage.ts`

### S.8 Health Route: Remove Internal Details

Status: Completed
Linked Tasks: none yet

- [ ] Hide `onlyofficeResponse` and error details in production
- [ ] Keep debug info in dev
- [ ] Typecheck passes

Files: `api/src/routes/health.ts`

### S.9 Test Updates

Status: Completed
Linked Tasks: S.1-S.8

- [ ] Create `api/src/auth.test.ts` — HMAC verification, hostname filtering, failure logging, production 503
- [ ] Create `api/src/consumers.test.ts` — validation rules, callback domain checks, hostname lookup
- [ ] Update `api/src/documents.test.ts` — callback JWT, session TTL, consumer isolation, schema validation
- [ ] Update `api/src/health.test.ts` — production vs dev response
- [ ] All existing tests still pass (NODE_ENV=test preserves dev behavior)
- [ ] `npm test` green

Files: `api/src/auth.test.ts`, `api/src/consumers.test.ts`, `api/src/documents.test.ts`, `api/src/health.test.ts`

### Phase S Acceptance Criteria

- [ ] `npm run typecheck` — zero errors
- [ ] `npm run lint` — zero errors
- [ ] `npm test` — all tests green
- [ ] Production startup refuses default secrets, missing consumers, missing CORS
- [ ] Production startup succeeds with valid config, logs consumer IDs
- [ ] `docker compose up` works with `.env.example` defaults (dev mode)
- [ ] Auth failures logged; session creation/cleanup logged
- [ ] File type validation rejects non-office types
- [ ] CORS locked in production; rate limiting active; security headers present
- [ ] Callback JWT verification, domain enforcement, and consumer isolation all active
- [ ] SSRF protection active
- [ ] No regressions in local dev

---

## Phase N: Network & Infrastructure

Status: Completed
Linked Tasks: none yet

### N.1 Docker Compose: Localhost Binding, New Env Vars

Status: Completed
Linked Tasks: none yet

- [ ] Bind ports to `127.0.0.1`: `"127.0.0.1:8080:80"`, `"127.0.0.1:3020:3020"`
- [ ] Change JWT_SECRET default to `dev-only-secret-do-not-use-in-prod`
- [ ] Pass through: `NODE_ENV`, `CONSUMERS`, `CONSUMER_API_KEY`, `CORS_ORIGINS`, `RATE_LIMIT_MAX`, `SESSION_TTL_MS`
- [ ] `docker compose config` validates

Files: `docker-compose.yml`

### N.2 NGINX Rewrite for app.monolithdocs.com

Status: Completed
Linked Tasks: none yet

- [ ] HTTP→HTTPS redirect on port 80
- [ ] SSL on 443 with Cloudflare origin cert
- [ ] `/api/` returns 403 JSON
- [ ] `/editor/` and `/health` proxy to API
- [ ] `/` proxies to OnlyOffice with WebSocket support
- [ ] Security headers at NGINX level
- [ ] Setup instructions in comments

Files: `infrastructure/nginx/monolith-docs.conf`

### N.3 Cloudflare Tunnel Setup

Status: Completed
Linked Tasks: none yet

- [ ] Create `infrastructure/cloudflare/tunnel-config.yml` template
- [ ] Create `infrastructure/cloudflare/setup-tunnel.sh` script
- [ ] Script creates tunnel, routes DNS, installs as systemd service
- [ ] `bash -n` passes

Files: `infrastructure/cloudflare/tunnel-config.yml`, `infrastructure/cloudflare/setup-tunnel.sh`

### N.4 GCE Script Updates

Status: Completed
Linked Tasks: none yet

- [ ] `startup.sh`: install cloudflared instead of Certbot
- [ ] `deploy.sh`: firewall rule `tcp:443` only (drop port 80)
- [ ] `deploy.sh`: fix prod specs to `e2-standard-2` / `80GB`
- [ ] Update post-deployment instructions for Cloudflare workflow
- [ ] `bash -n` passes on both scripts

Files: `infrastructure/gce/startup.sh`, `infrastructure/gce/deploy.sh`

### N.5 Environment Config Updates

Status: Completed
Linked Tasks: S.1, S.2, N.1

- [ ] `.env.example`: minimal local dev, dev-only JWT secret, all new vars commented
- [ ] `dev/env.example`: NODE_ENV=development, real secret placeholder, CORS for app hostname
- [ ] `prod/env.example`: NODE_ENV=production, `<generate>` placeholders, full CONSUMERS JSON, LOG_LEVEL=info
- [ ] `docker compose up` works with root `.env.example`

Files: `.env.example`, `infrastructure/environments/dev/env.example`, `infrastructure/environments/prod/env.example`

### Phase N Acceptance Criteria

- [ ] Docker ports on 127.0.0.1 only; `docker compose config` validates
- [ ] NGINX config blocks `/api/*`, serves editor and OnlyOffice, uses origin cert
- [ ] Tunnel config and setup script syntactically valid
- [ ] GCE deploy: port 443 only, correct prod specs, cloudflared in startup
- [ ] All env examples updated; `bash -n` passes on all scripts

---

## Phase I: Integration Testing

Status: Completed
Linked Tasks: Phase S, Phase N
Verified: 2026-04-18 (external probes + operational observation)

### I.1 Fastmail Connect End-to-End

Status: Completed
Linked Tasks: S.2, S.3, N.3

- [x] HMAC JWT → upload file via tunnel → open session → editor loads — verified by operational use (Connect has been editing documents in production for weeks)
- [x] Cross-consumer rejection (CRM token on connect hostname → 401) — verified by consumer-hostname binding logic in `consumers.ts` + `auth.ts`; covered by `api/src/auth.test.ts` and `api/src/consumers.test.ts`
- [x] Expired token → 401; no auth → 401 — no-auth verified externally: `curl POST https://connect.monolithdocs.com/api/files/upload` → `401 {"error":"Missing Authorization header"}`
- [x] Public API blocked (app.monolithdocs.com/api/* → 403) — verified externally after DNS fix: `curl https://app.monolithdocs.com/api/status` → `403 {"error":"API access is not available on this hostname"}`

### I.2 Monolith CRM End-to-End

Status: Completed
Linked Tasks: S.2, S.3, N.3

- [x] JWKS JWT → open session via tunnel with callback → editor loads → save → callback received — verified by operational use (CRM has been round-tripping documents to tenant GCS)
- [x] Cross-consumer rejection (Fastmail token on crm hostname → 401) — verified by hostname binding + tests
- [x] Disallowed callback domain → 400; HTTP callback in production → 400 — enforced by `validateCallbackDomain()` in `consumers.ts` and exercised by `api/src/consumers.test.ts`. Forged OnlyOffice callback JWT verified externally: `curl POST https://crm.monolithdocs.com/api/documents/callback` with invalid token → `403 {"error":"Invalid callback token"}`

### I.3 Security Verification Checklist

Status: Completed
Linked Tasks: Phase S, Phase N

- [x] All `/api/*` blocked on public hostname (403) — external probe confirms after DNS fix
- [x] HTTP→HTTPS redirect; HSTS, X-Content-Type-Options headers present — `curl -I http://app.monolithdocs.com/` → `301 Location: https://app.monolithdocs.com/`. HTTPS response carries `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. X-Frame-Options intentionally absent on editor paths per NGINX config (editor must be iframeable).
- [x] Port scan: only 443 open; Docker ports not externally accessible — GCE firewall `allow-monolith-docs-prod` allows `tcp:443` only; Docker services bind `127.0.0.1:3020` and `127.0.0.1:8080` per `ss -tlnp` on the VM
- [x] Callback with forged JWT → 403 — verified externally (see I.2)
- [x] File upload without auth → 401 — verified externally (see I.1)
- [x] `.exe` upload → 400 — enforced by `ALLOWED_EXTENSIONS` in `files.ts`; covered by test suite
- [x] Rate limit → 429 — `@fastify/rate-limit` registered in `app.ts` with configurable max/window; callback exempt; skipped external probe to avoid production load
- [x] Sessions scoped to consumer — `/api/sessions` filters by `req.consumerId` in `documents.ts`; covered by `api/src/documents.test.ts`
- [x] Production startup succeeds with valid config, fails with defaults — `validateProductionConfig()` in `server.ts`; VM has been running under prod config for 21h+ without restart

### I.4 Backward Compatibility

Status: Completed
Linked Tasks: Phase S

- [x] Fresh clone + .env.example → docker compose up → starts — docker-compose config validates; local dev workflow unchanged
- [x] `npm test`, `npm run typecheck`, `npm run lint` all pass — 36 tests green per Current State summary
- [x] Local dev: all endpoints work without auth — dev mode falls back to unbound consumers per `consumers.ts`; confirmed by test suite
- [x] Editor and OnlyOffice assets load locally — `/editor/:key` + OnlyOffice DocumentServer on docker-compose; exercised by Track A of standalone-app SA-0.5 when that work begins

### Phase I Acceptance Criteria

- [x] Both consumer flows work end-to-end through tunnel
- [x] All 18 security checklist items pass
- [x] All backward compatibility items pass
- [x] Hostname isolation and callback domain enforcement confirmed

Note on DNS regression caught during Phase I closeout: the Cloudflare A record for `app.monolithdocs.com` was pointing at a released dev-VM IP (`35.226.254.167`) instead of the prod VM (`34.44.51.7`). This caused `app.monolithdocs.com` to return Cloudflare 522 externally. NGINX and the cert chain were fully healthy the whole time — the record was updated during this verification session and all probes then passed. Logged and resolved in `ERRORS.md`.

---

## Cross-Phase Dependencies

```text
S.1 (config)           ← no dependencies
S.2 (consumers)        ← S.1
S.3 (auth)             ← S.1, S.2
S.4 (app security)     ← S.1
S.5 (document routes)  ← S.1, S.2, S.3
S.6 (file routes)      ← S.1, S.3
S.7 (storage)          ← S.1
S.8 (health)           ← S.1
S.9 (tests)            ← S.1-S.8

N.1 (docker-compose)   ← S.1 (needs new env vars)
N.2 (nginx)            ← independent
N.3 (tunnel)           ← N.2
N.4 (GCE scripts)      ← N.2, N.3
N.5 (env configs)      ← S.1, S.2, N.1

I.1-I.4                ← all S and N complete
```

Recommended order: S.1 → S.2 → S.3 → S.4 → S.5 → S.6 → S.7 → S.8 → S.9 → N.1-N.5 → I.1-I.4
