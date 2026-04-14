# Standalone App — Execution Plan

## Initiative ID: `standalone-app`

## Abbreviation: `SA`

## Critical Constraint

The existing headless API (`/api/documents/open`, `/editor/:key`, `/api/documents/callback`, `/api/files/*`, `/api/sessions`, `/health`, `/api/status`) and the consumer auth system (`auth.ts`, `consumers.ts`) MUST remain fully functional and unmodified throughout all phases. CRM and Connect integrations are not touched.

Implementation note: preserving headless behavior requires an auth/routing refactor so standalone routes do not pass through the current global consumer-auth plugin.

---

## Phase 1: Database and infrastructure foundation

**Goal:** Add PostgreSQL, Prisma, and Redis to the repo. Establish the tenant/user data model and RLS. No auth, no frontend — just the data layer.

### SA-1.1 Add PostgreSQL and Redis to docker-compose

- Add `postgres` service (PostgreSQL 16, port 5432, `monolith_docs_dev` database)
- Add `redis` service (Redis 7, port 6379)
- Add persistent volumes for both
- Wire `DATABASE_URL` and `REDIS_URL` env vars into the `api` service
- Verify existing services (OnlyOffice, API) still start and function
- Status: Pending
- Acceptance: `docker compose up -d` starts all 4 services, existing health checks pass, `psql` connects to Postgres, `redis-cli ping` returns PONG

### SA-1.2 Add Prisma and define schema

- Add `packages/db/` workspace with Prisma client + migration tooling
- Add root workspace entry for `packages/db`
- Define schema with RLS-compatible tables:
  - `Tenant` (id, slug, name, status, platform_tenant_id [unique], firebase_tenant_id, plan_slug, created_at, updated_at)
  - `User` (id, tenant_id, email, first_name, last_name, role, status, platform_user_id, platform_sync_version, created_at, updated_at)
  - `LegalEntity` (id, tenant_id, platform_id, name, entity_type, record_number, display_name, ein, trade_name, incorporation_state, incorporation_country, platform_sync_version)
  - `BusinessUnit` (id, tenant_id, platform_id, legal_entity_id, short_code, name, business_unit_type, is_default, street, city, state, postal_code, country, email, phone, time_zone, display_name, record_number, platform_sync_version)
  - `BusinessUnitAffiliation` (id, tenant_id, user_id, business_unit_id, platform_id, role, relationship_type, is_primary, is_active, work_email, work_phone, platform_sync_version)
  - `RecentDocument` (id, tenant_id, user_id, platform_file_id, document_key, file_name, document_type, last_opened_at, created_at)
  - `EventInbox` (id, event_id [unique], event_type, tenant_id, source, status, payload, received_at, processed_at, attempts, last_error)
  - `EventOutbox` (id, event_id, event_type, tenant_id, source, payload, status, created_at, published_at, publish_attempts, last_error)
- Composite unique constraints: `User(tenant_id, platform_user_id)`, `User(tenant_id, email)`
- All tables include `tenant_id` for RLS
- Status: Pending
- Acceptance: `prisma migrate dev` creates migration, `prisma generate` succeeds, types importable from `@monolith-docs/db`

### SA-1.3 Add RLS policies

- SQL migration to enable RLS on all tenant-scoped tables
- Policy: `tenant_id = current_setting('app.current_tenant')::text`
- `withTenant(tenantId, callback)` utility that wraps Prisma interactive transactions with `SET LOCAL app.current_tenant`
- Status: Pending
- Acceptance: Direct query without `SET LOCAL` returns no rows; query with correct tenant returns expected rows

### SA-1.4 Add `@monolith-platform/sdk` dependency

- Configure `.npmrc` for Artifact Registry (`us-west1-npm.pkg.dev/monolith-platform/platform-npm/`)
- Install `@monolith-platform/sdk` in `api/`
- Create `api/src/platform/client.ts` — singleton `PlatformClient` init on startup
  - Reads `PLATFORM_SERVICE_KEY`, `PLATFORM_API_URL`, `GCP_PROJECT_ID` from env
  - Configures `events.source = 'docs'`
  - Exposes `getClient()` (nullable) and `getClientOrThrow()`
  - Warns if service key not configured (dev mode)
- Add env vars to docker-compose `api` service
- Status: Pending
- Acceptance: API starts with and without `PLATFORM_SERVICE_KEY`; `getClient()` returns client when configured, null when not

### SA-1.5 Isolate standalone auth/routing from headless consumer auth

- Refactor Fastify registration so the current consumer auth plugin only applies to the headless route surface
- Register standalone routes (`/auth/*`, `/trpc`) under a separate plugin scope with cookie-based Platform session auth
- Add `@fastify/cookie` and wire cookie parsing before standalone auth hooks
- Preserve current headless route behavior and consumer auth semantics
- Status: Pending
- Acceptance: `/api/*` headless routes still require consumer auth as before; `/auth/me` and `/trpc/*` no longer fail consumer bearer-token auth before Platform session auth runs

---

## Phase 2: Platform SSO authentication

**Goal:** Users can sign in via Platform SSO and get a Docs session. No frontend yet — tested via direct HTTP calls.

### SA-2.1 Session service

- Create `api/src/platform/session.ts`
- HS256 JWT signing/verification with `DOCS_SESSION_SECRET` env var
- Payload: `{ platformUserId, platformTenantId, tenantSlug, email, role }`
- 24-hour expiry, issuer `monolith-docs`
- `sign(payload)` → JWT string
- `verify(token)` → payload or throws
- Status: Pending
- Acceptance: Unit tests for sign/verify, expired token rejection, tampered token rejection

### SA-2.2 Auth callback route

- Create `api/src/routes/auth.ts`
- `GET /auth/callback?code=<code>` — exchanges code with Platform API (`POST /auth/exchange`)
  - Server-side only, never client-side
  - On success: sign Docs JWT, set `docs_session` httpOnly cookie, redirect to frontend
  - On failure: redirect to frontend with error
- `GET /auth/me` — returns current user from session cookie (or 401)
- `POST /auth/logout` — clears session cookie
- Register routes in `app.ts` (public paths, no consumer auth)
- Cookie settings: httpOnly, secure (prod), sameSite none (prod) / lax (dev), maxAge 24h
- Redirect URI must match Platform registration exactly: `https://api.monolithdocs.com/auth/callback` in production
- Status: Pending
- Acceptance: Manual test: hit callback with valid code → cookie set → `/auth/me` returns user. Invalid code → error redirect. Logout → cookie cleared.

### SA-2.3 Platform auth hook (Fastify)

- Create `api/src/platform/auth-hook.ts`
- `platformAuthHook` — Fastify `onRequest` hook
  - Reads `docs_session` cookie
  - Verifies JWT via session service
  - Sets `request.platformUserId`, `request.platformTenantId`, `request.authSource`
  - Returns 401 if missing/invalid (for protected routes)
- Only applied to `/trpc` and `/auth/me` routes — NOT to existing headless routes
- Status: Pending
- Acceptance: Protected route returns 401 without cookie, 200 with valid cookie. Existing headless routes unaffected.

### SA-2.4 Tenant context hook (Fastify)

- Create `api/src/platform/tenant-hook.ts`
- `tenantContextHook` — Fastify `preHandler` hook
  - Resolves local tenant by `platform_tenant_id` (unscoped query)
  - Resolves local user by `(tenant_id, platform_user_id)` with `withTenant()`
  - Fetches active business unit affiliations
  - Resolves `businessUnitId` from `X-Business-Unit-Id` header or primary affiliation
  - Sets `request.tenantId`, `request.userId`, `request.userRole`, `request.businessUnitId`
  - Returns 403 if tenant not found, user not found, or user suspended
- Status: Pending
- Acceptance: With valid session + provisioned tenant/user → context populated. Missing tenant → 403. Suspended user → 403.

### SA-2.5 Register callback URL with Platform

- Register `https://api.monolithdocs.com/auth/callback` (prod) and `http://localhost:3020/auth/callback` (dev) in Platform's `Product.allowed_redirect_uris` for the Docs product
- Create Docs service key in Platform, store in `CREDENTIALS.md`
- Status: Pending
- Acceptance: Platform allows redirect to registered URLs

---

## Phase 3: Provisioning and event infrastructure

**Goal:** Platform can provision tenants into Docs. Docs receives and processes Platform events.

### SA-3.1 Provisioning endpoint

- Create `api/src/routes/provision.ts`
- `POST /internal/provision` — service key auth via `Authorization: ServiceKey <key>`
  - Validates service key (bcrypt hash lookup or SDK verification)
  - Parses `ProvisionRequest` body (tenant, owner, users, org structure, plan)
  - Idempotent: if tenant with same `platform_tenant_id` exists, verify and return success
  - Creates: Tenant + all Users + LegalEntities + BusinessUnits + Affiliations
  - All within a single transaction
  - Returns `{ success: true }` or `{ success: false, error: "..." }`
  - 30-second timeout
- Register in `app.ts` (not behind consumer auth or platform auth — uses service key)
- Status: Pending
- Acceptance: POST with valid service key + payload creates tenant with all related records. Repeat call is idempotent. Invalid key returns 401.

### SA-3.2 Event receiver endpoint

- Create `api/src/platform/event-receiver.ts`
- `POST /internal/events` — receives Pub/Sub push messages
  - Public route (Pub/Sub authenticates via OIDC)
  - Production: verify OIDC JWT from `Authorization: Bearer <token>` against `https://oauth2.googleapis.com/tokeninfo`
  - Decode base64-encoded Pub/Sub message body
  - Parse `PlatformEventEnvelope` (validate eventId, eventType, tenantId, source)
  - Dedup via `EventInbox` table (check event_id, skip if already processed)
  - Insert to inbox with status `enqueued`
  - Process inline via event handler (SA-3.3)
  - Always return 204 (ack to Pub/Sub regardless of processing outcome)
- Status: Pending
- Acceptance: Valid Pub/Sub push message → stored in inbox → processed → 204. Duplicate message → idempotent 204. Invalid payload → logged, 204.

### SA-3.3 Event handler (sovereignty sync)

- Create `api/src/platform/event-handler.ts`
- Dispatches by `eventType` to specific handlers
- All handlers resolve local tenant by `platform_tenant_id` first (skip if not found)
- Version conflict resolution: skip write if `incoming.version <= stored.platform_sync_version`

- **Tenant events:**
  - `platform.tenant.deactivated` → update tenant status
  - `platform.tenant.suspended` → update tenant status
  - `platform.tenant.reactivated` → update tenant status
  - `platform.tenant.deleted` → mark tenant deleted

- **User events:**
  - `platform.user.invited` → create user with status `invited`
  - `platform.user.activated` → update status to `active`
  - `platform.user.deactivated` → update status to `suspended`
  - `platform.user.updated` → merge changes (name, email)
  - `platform.user.role.changed` → update role

- **Seat events:**
  - `platform.seat.granted` → create or activate user for Docs product
  - `platform.seat.revoked` → suspend user for Docs product

- **Subscription events:**
  - `platform.subscription.created` → update tenant plan_slug
  - `platform.subscription.changed` → update plan_slug, invalidate entitlement cache
  - `platform.subscription.cancelled` → update tenant status, invalidate cache

- **Org structure events:**
  - `platform.org.legal_entity.*` → CRUD local LegalEntity records
  - `platform.org.business_unit.*` → CRUD local BusinessUnit records
  - `platform.org.affiliation.*` → CRUD local BusinessUnitAffiliation records

- Status: Pending
- Acceptance: Each event type creates/updates correct records. Version conflicts are handled. Missing tenant skips gracefully.

### SA-3.4 Event outbox publisher

- Create `api/src/platform/outbox-publisher.ts`
- Notify-driven batch publisher (not interval-polled)
- `notify()` method triggers `setImmediate` publish batch
- Batch size: 50 rows, max 10 attempts per row
- Publishes via `platform.events.publish()` from SDK
- Startup sweep on init: publish any unpublished rows from prior crashes
- Helper: `enqueueEvent(tx, { eventType, tenantId, data, businessUnitId? })` — writes to outbox within caller's transaction

- Status: Pending
- Acceptance: Enqueued event is published within seconds. Failed publish retries up to 10 times. Startup sweep catches orphaned rows.

### SA-3.5 Entitlement checking

- Create `api/src/platform/entitlements.ts`
- Two layers (matching CRM/Connect pattern):
  - `EntitlementService` class — for use in route handlers
  - `requireDocsEntitlement(platformTenantId)` standalone function — for tRPC middleware
- 60-second TTL cache per tenant
- Allowed statuses: `active`, `trialing`, `past_due`
- Fail-open on Platform errors (log warning, allow access)
- `invalidateEntitlementCache(tenantId)` — called by event handler on subscription events

- Status: Pending
- Acceptance: First call hits Platform API. Second call within 60s uses cache. Subscription event invalidates cache. Platform down → access allowed.

---

## Phase 4: tRPC router and API layer

**Goal:** Frontend-facing API for dashboard, document operations, and user data. Tested via HTTP before frontend exists.

### SA-4.1 tRPC setup on Fastify

- Install `@trpc/server` with Fastify adapter
- Create `api/src/trpc/init.ts`
  - Context builder: extract `tenantId`, `platformTenantId`, `userId`, `userRole`, `businessUnitId` from request (set by hooks in Phase 2)
  - `publicProcedure` — no auth required
  - `protectedProcedure` — requires tenantId + userId, checks entitlement
  - `adminProcedure` — requires admin/owner role
- Mount at `/trpc` in `app.ts` with platform auth + tenant context hooks applied
- Existing routes at `/api/*` are NOT affected

- Status: Pending
- Acceptance: `POST /trpc/health.check` returns OK. Protected procedure returns 401 without session. Existing `/api/*` routes still work.

### SA-4.2 Dashboard procedures

- `dashboard.recentDocs` — list recent documents for current user (from RecentDocument table)
- `dashboard.stats` — document count, active sessions (optional v1)
- `documents.create` — create new blank document (Word/Excel/PowerPoint)
  - Creates document session via existing session manager
  - Creates backing file in Platform storage and stores `platform_file_id`
  - Records in RecentDocument
  - Enqueues `docs.document.created` event
  - Returns `{ editorUrl, key }`
- `documents.uploadAndOpen` — upload file from desktop, open in editor
  - Accepts multipart file or upload metadata flow from frontend
  - Stores via Platform storage (`requestUploadUrl` + client upload + `confirmUpload`)
  - Uses Platform-provided thumbnails (`getThumbnailUrl`) for recent-doc / dashboard previews
  - Creates document session
  - Records in RecentDocument
  - Returns `{ editorUrl, key }`

- Status: Pending
- Acceptance: Create document returns valid editorUrl that opens OnlyOffice. Upload opens document. Recent docs list shows opened documents.

### SA-4.3 User and tenant procedures

- `user.me` — current user profile from session
- `user.preferences` — get/set user preferences (theme, density — stored in Redis)
- `tenant.info` — current tenant name, plan, status

- Status: Pending
- Acceptance: All procedures return correct data scoped to authenticated user/tenant.

---

## Phase 5: Next.js frontend

**Goal:** User-facing web app at monolithdocs.com with dashboard, document creation, and editor.

### SA-5.1 Scaffold Next.js app

- Create `web/` directory: Next.js 15, React 19, App Router, TypeScript
- Add to root workspace
- Install `@monolith-platform/ui` from Artifact Registry
- Configure Tailwind 4 with Platform UI theme variables (VS Code Modern scheme)
- Configure `next.config.ts` with API proxy for `/trpc` and `/auth` routes
- Add `web` service to docker-compose (port 3000, depends on api)

- Status: Pending
- Acceptance: `npm run dev` in `web/` starts Next.js on port 3000. Platform UI components render with correct theme.

### SA-5.2 Auth flow in frontend

- `PlatformAuthContext` provider
  - On mount: call `https://api.monolithdocs.com/auth/me` to check for existing session
  - If no session: redirect to Platform login gateway with `redirect_uri=https://api.monolithdocs.com/auth/callback`
  - After SSO callback: `/auth/me` returns user → context populated
  - `signOut()` calls `/auth/logout` → clears cookie → redirects to login
- Protected layout wrapper: redirects unauthenticated users to login

- Status: Pending
- Acceptance: Unauthenticated visit → redirect to Platform login. After login → dashboard loads. Sign out → back to login.

### SA-5.3 tRPC client setup

- Configure tRPC client with `httpBatchLink` pointing at `/trpc`
- Headers middleware: no token needed (session is in httpOnly cookie, sent automatically)
- Integrate with React Query for caching
- Type-safe hooks: `trpc.dashboard.recentDocs.useQuery()`, etc.

- Status: Pending
- Acceptance: tRPC queries return data. Type errors caught at compile time. React Query caching works.

### SA-5.4 App shell (header, navigation, layout)

- Root layout with theme provider (light/dark/system, density)
- `PreferencesContext` — stored in localStorage as `monolith-preferences` (same key as CRM/Connect)
- Header: 56px, left: logo/nav, right: app switcher (Grid3X3), notifications (Bell), user profile dropdown
- Profile dropdown: name, email, tenant, theme switcher, density selector, sign out
- App switcher: links to CRM, Connect, Docs, Platform portal
- Responsive layout

- Status: Pending
- Acceptance: Header matches CRM/Connect visually. Theme toggle works. App switcher shows all Monolith products. Density settings apply.

### SA-5.5 Dashboard page

- Document type picker: create new Word, Excel, or PowerPoint document (icons + labels)
- Upload from desktop: file input accepting allowed document types
- Recent documents list: type icon, file name, last opened timestamp, Platform thumbnail when available, click to reopen
- Empty state for new users

- Status: Pending
- Acceptance: Create new document → opens editor in new tab/page. Upload file → opens editor. Recent docs populate after opening documents.

### SA-5.6 Editor page integration

- Route: `/editor/[key]` in Next.js
- Wraps the existing OnlyOffice embed page (`/editor/:key` from Fastify)
- Can either iframe the existing editor page or render the OnlyOffice config directly
- Back-to-dashboard navigation
- Save status indicator

- Status: Pending
- Acceptance: Editor loads and is fully functional. Document edits save correctly. User can navigate back to dashboard.

---

## Phase 6: Infrastructure and deployment

**Goal:** Production deployment with all services running.

### SA-6.1 Docker Compose finalization

- All services: OnlyOffice, API, PostgreSQL, Redis, Next.js frontend
- Health checks for all services
- Environment variable documentation in `.env.example`
- Dev vs. prod compose profiles if needed

- Status: Pending
- Acceptance: `docker compose up -d` starts everything. All health checks pass.

### SA-6.2 NGINX routing update

- Route `app.monolithdocs.com` to Next.js frontend (port 3000)
- Route `api.monolithdocs.com` to Fastify API (port 3020)
- On `api.monolithdocs.com`, proxy `/trpc`, `/auth/*`, `/internal/*` to API
- On `app.monolithdocs.com`, keep blocking consumer `/api/*`
- Keep `/editor/*` on the existing Docs API surface without changing current headless consumer behavior
- Static asset caching for Next.js
- CSP headers for OnlyOffice + Platform login domain
- WebSocket support for OnlyOffice (existing, unchanged)

- Status: Pending
- Acceptance: Frontend loads at app.monolithdocs.com. `api.monolithdocs.com` serves auth/tRPC/internal routes. Existing headless consumer API remains isolated to `connect.` and `crm.` and is not exposed on `app.`

### SA-6.3 GCE deployment updates

- Update `infrastructure/gce/startup.sh` for PostgreSQL + Redis
- Update `infrastructure/gce/deploy.sh` for frontend build
- Add Prisma migration step to deployment
- Environment configs for dev and prod

- Status: Pending
- Acceptance: Deploy script provisions full stack on GCE VM.

### SA-6.4 Platform integration registration

- Register Docs product in Platform (if not already)
- Create production service key, store in `CREDENTIALS.md`
- Register provisioning URL: `https://api.monolithdocs.com/internal/provision`
- Register auth callback URLs (dev + prod)
- Create Pub/Sub topic `monolith-docs-events`
- Create Pub/Sub push subscription for Platform events → `https://api.monolithdocs.com/internal/events`
- Update Platform integration status: `C:\Dev\monolith-platform\docs\ecosystem\integration-status\monolith-docs.yaml`

- Status: Pending
- Acceptance: Platform can provision tenants into Docs. Events flow bidirectionally. Auth SSO redirects work.

---

## Phase 7: STOR-7 coordination and Docs-specific storage follow-up

**Goal:** Align standalone Docs storage adoption with Platform's STOR-7 track and close any Docs-specific gaps that remain after the initial standalone cut.

### SA-7.1 Track Docs work against Platform STOR-7

- Mirror Docs storage adoption against `C:\Dev\monolith-platform\.ai\ecosystem\initiatives\active\tenant-storage\plan.md` Phase 7
- Record any Docs-specific OnlyOffice compatibility decisions required for upload/download URL usage, save flows, or preview handling
- Headless API file upload (`/api/files/upload`) remains unchanged unless a separate Docs storage decision explicitly expands STOR-7 into headless flows

- Status: Pending
- Acceptance: Docs standalone storage plan stays aligned with Platform STOR-7 and any remaining Docs-specific compatibility work is explicitly documented instead of hidden in the standalone plan

---

## Future (not in this initiative)

- Cloud storage browsing (GDrive, OneDrive, Dropbox)
- Template gallery / marketplace
- CRM file browsing from standalone dashboard
- Collaboration features (shared editing sessions, comments)
- Document versioning / history
- Migrate `@monolith-platform/ui` if Platform publishes breaking changes
- Advanced entitlement features (document limits, storage quotas, AI features)

---

## Sequencing and dependencies

```text
Phase 1 (database) ──────────────────┐
                                      ├─→ Phase 3 (provisioning + events)
Phase 2 (auth) ──────────────────────┤
                                      ├─→ Phase 4 (tRPC router)
                                      │         │
                                      │         ▼
                                      ├─→ Phase 5 (frontend)
                                      │         │
                                      │         ▼
                                      └─→ Phase 6 (deployment)
                                                │
                                                ▼
                                      Phase 7 (STOR-7 coordination + Docs follow-up)
```

Phases 1 and 2 can be worked in parallel (no dependencies between them).
Phase 3 depends on Phase 1 (database).
Phase 4 depends on Phases 1, 2, and 3.
Phase 5 depends on Phase 4.
Phase 6 depends on Phase 5.
Phase 7 depends on Platform STOR-7 coordination, not on storage availability.
