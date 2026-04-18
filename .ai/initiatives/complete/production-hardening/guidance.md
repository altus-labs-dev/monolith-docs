# Production Hardening — Architecture Guidance

Initiative ID: `production-hardening`
Created: 2026-03-24

---

## Overview

This initiative hardens Monolith Docs for production SaaS deployment. It closes all security gaps identified in the March 2026 audit, implements the three-hostname architecture with Cloudflare Tunnel, and prepares the service for multi-consumer operation.

## Consumers

Monolith Docs serves three consumer profiles with different auth, network, and storage models:

| Consumer | Auth | Network | File Source | Save Flow |
|----------|------|---------|-------------|-----------|
| **Connect for Fastmail** | HMAC JWT (HS256, 5min TTL, shared secret) | Cloudflare Tunnel (`connect.monolithdocs.com`) | Upload via `/api/files/upload` | Standalone — user downloads |
| **Monolith CRM** | JWKS JWT (RS256, validated against CRM public key) | Cloudflare Tunnel (`crm.monolithdocs.com`) | GCS signed URLs from CRM FilesService | Callback → CRM stores to tenant GCS |
| **Direct subscribers** (future) | User accounts + sessions | First-party app + API (`app.monolithdocs.com`, `api.monolithdocs.com`) | Platform storage | Platform-managed storage + thumbnails |

## Headless Deployment Architecture

```text
GCE Instance:
  cloudflared tunnel (outbound to Cloudflare edge):
    connect.monolithdocs.com  →  localhost:3020  (Fastmail Connect billing API)
    crm.monolithdocs.com      →  localhost:3020  (Monolith CRM backend)

  nginx (inbound :443, Cloudflare origin cert):
    app.monolithdocs.com
      /editor/*   →  localhost:3020  (public, session-bound)
      /health     →  localhost:3020  (public)
      /*          →  localhost:8080  (OnlyOffice assets + WebSocket)
      /api/*      →  BLOCKED (403)

  Docker services bound to 127.0.0.1 only
  GCE firewall: port 443 only
```

This document defines the hardening model for the current headless consumer surface. The standalone initiative adds a first-party app/API split (`app.` + `api.`) for Docs subscribers, but that must not expose the existing headless consumer API on the public app hostname.

### DNS (Cloudflare)

- `app.monolithdocs.com` — A record → GCE external IP (orange-cloud proxied)
- `api.monolithdocs.com` — A record → GCE external IP (orange-cloud proxied) for first-party standalone auth/tRPC/internal routes
- `connect.monolithdocs.com` — CNAME → `<tunnel-id>.cfargotunnel.com` (proxied)
- `crm.monolithdocs.com` — CNAME → `<tunnel-id>.cfargotunnel.com` (proxied)

### Network Security Model

- The headless consumer API is never exposed to the public internet. Consumer `/api/*` calls arrive through Cloudflare Tunnel on `connect.` and `crm.`.
- The public app hostname (`app.monolithdocs.com`) serves editor pages, health checks, and browser-facing standalone UI.
- NGINX blocks consumer `/api/*` on the public app hostname with a 403.
- First-party standalone API routes (`/auth/*`, `/trpc`, `/internal/*`) belong on `api.monolithdocs.com`, not on the headless tunnel hostnames.
- Docker ports are bound to `127.0.0.1` — not accessible from outside the VM.
- The GCE firewall only opens port 443.

### Why Tunnel, Not IP Allowlisting

- CRM runs on GCP but its outbound IP may change (Cloud Run, GKE).
- No firewall rules to maintain for API consumers.
- Cloudflare provides DDoS protection and WAF on tunnel endpoints.
- The tunnel is outbound-only from GCE — no inbound firewall rule needed.

## Auth Model

Consumer auth is hostname-aware. A request arriving at `connect.monolithdocs.com` can only authenticate as the `fastmail-connect` consumer, never as `monolith-crm`, and vice versa.

### Auth Modes

| Mode | Algorithm | Consumer | Details |
|------|-----------|----------|---------|
| `hmac` | HS256 | Fastmail Connect | Shared secret, 5-minute TTL, `iss: "connect-billing-api"` |
| `jwks` | RS256 | Monolith CRM | Public key from JWKS endpoint, `aud: "monolith-docs"` |
| `api-key` | n/a | Dev only | Simple bearer token, rejected in production |

### Consumer Config (Environment Variable)

```json
[
  {
    "id": "fastmail-connect",
    "name": "Connect for Fastmail",
    "auth": { "mode": "hmac", "secret": "<32+ char secret>", "issuer": "connect-billing-api" },
    "hostname": "connect.monolithdocs.com",
    "allowedCallbackDomains": []
  },
  {
    "id": "monolith-crm",
    "name": "Monolith CRM",
    "auth": { "mode": "jwks", "jwksUrl": "https://api.monolithcrm.com/.well-known/jwks.json", "audience": "monolith-docs", "issuer": "monolith-crm" },
    "hostname": "crm.monolithdocs.com",
    "allowedCallbackDomains": ["api.monolithcrm.com"]
  }
]
```

### OnlyOffice Callback Auth

OnlyOffice signs callback request bodies with the shared `ONLYOFFICE_JWT_SECRET` when `JWT_ENABLED=true`. The callback endpoint verifies this JWT before processing — it is not behind consumer auth.

## TLS Model

- Cloudflare origin certificates for `app.monolithdocs.com` (15-year validity, no renewal).
- Tunnel endpoints (`connect.`, `crm.`) get TLS from Cloudflare automatically.
- No Certbot needed.

## Security Requirements

### Production Startup Enforcement

- Refuse to start if `ONLYOFFICE_JWT_SECRET` is a default/weak value
- Refuse to start without consumer configuration
- Refuse to start without explicit CORS origins
- API key auth mode rejected in production

### Endpoint Security

- All `/api/*` endpoints require consumer auth (except callback which has OnlyOffice JWT)
- File uploads require consumer auth and file type validation (office formats only)
- File serving uses unguessable UUIDs (no directory listing)
- Callback domain enforcement: `callbackUrl` validated against consumer's `allowedCallbackDomains`
- Request body validation via Fastify JSON schemas

### Session Security

- 24-hour TTL with `lastActivityAt` tracking
- Automatic cleanup interval
- Consumer isolation — `/api/sessions` scoped to requesting consumer
- Session creation and expiry logged

### Network Security

- CORS locked to explicit origins in production
- Rate limiting on all endpoints (callback exempt)
- Security headers: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- SSRF protection in GCS transfer (private IP rejection, fetch timeout)

## Non-Negotiables

1. **AGPL compliance** — all code in this repo is open source.
2. **Clean API boundary** — consuming apps integrate via REST API only.
3. **Zero public consumer API surface** — headless consumer API calls go through Cloudflare Tunnel; any public first-party app API must stay separate from the consumer REST surface.
4. **JWT auth on all endpoints** — consumer JWT for API calls, OnlyOffice JWT for callbacks.
5. **No default secrets in production** — startup validation enforces this.
6. **Backward compatible local dev** — `docker compose up` must work with minimal config.

## Relationship to Other Initiatives

- `monolith-docs` initiative (Phases 1-4): completed the API scaffold, OnlyOffice integration, GCS storage, and GCE deployment scripts. This initiative hardens that work for production.
- Phase 5 (Consumer Integration) from the original plan: this initiative replaces the security portions. Integration testing (Phase 5.4-5.5) becomes Phase I here.
- Phase 6 (Open Source Prep) remains as a separate future initiative.
