# Project Conventions — Monolith Docs

## Product Identity

- **Name:** Monolith Docs
- **Purpose:** Open-source, self-hosted document editing platform built on OnlyOffice DocumentServer with a thin Node.js API layer.
- **License:** AGPL 3.0 (required by OnlyOffice)
- **Repo:** `C:\Dev\monolith-docs`
- **Remote:** `https://github.com/altus-labs-dev/monolith-docs`

## Ecosystem Position

Monolith Docs is part of the Monolith product suite (CRM, Connect, Docs, Platform). It runs as a standalone service. Consuming apps integrate over API — never by embedding.

- **Primary consumer:** Monolith CRM (`C:\Dev\monolith-crm`)
- **Planned consumer:** Fastmail Connect (`C:\Dev\monolith-connect`)
- **Central auth/billing hub (future):** Monolith Platform (`C:\Dev\monolith-platform`)
- **Ecosystem coordination:** `C:\Dev\monolith-platform\docs\ecosystem\`

## Architecture

| Layer | Technology |
|-------|-----------|
| Document Engine | OnlyOffice DocumentServer 8.3 (Docker) |
| API | Node.js + Fastify + TypeScript |
| Storage | Google Cloud Storage via signed URLs |
| Auth | Consumer-issued JWT/HMAC tokens, hostname-bound |
| Infrastructure | GCE VM + Docker Compose + Cloudflare Tunnel |
| Local Dev | `docker-compose.yml` (OnlyOffice + API) |

### Key Architecture Decisions

- OnlyOffice is stateful (internal PostgreSQL, Redis, RabbitMQ) — runs on GCE, not Cloud Run
- Three-hostname architecture: `app.monolithdocs.com` (public editor), `connect.monolithdocs.com` (Fastmail tunnel), `crm.monolithdocs.com` (CRM tunnel)
- AGPL boundary: all code in this repo is open source; proprietary integration logic lives in consumer repos
- Multi-consumer model: each consumer identified by hostname + auth credentials
- Files are never stored permanently — signed URL round-trips only

## Stack Patterns

- **Package manager:** npm (workspace root + `api/` workspace)
- **Languages:** TypeScript, Shell, Markdown
- **Testing:** Vitest
- **Linting:** ESLint (flat config)
- **Build:** TypeScript compiler (`tsc`)

## Validation Commands

```bash
npm --prefix api run typecheck    # Type checking
npm --prefix api run lint         # Linting
npm --prefix api test             # Unit tests (Vitest)
docker compose config             # Docker Compose validation
bash -n <script>                  # Shell script syntax check
```

## GCP Infrastructure

| Resource | Dev | Prod |
|----------|-----|------|
| Project | `monolith-dev-489423` | `monolith-crm` |
| VM | `monolith-docs-dev` | `monolith-docs-prod` |
| VM type | e2-medium | e2-standard-2 |
| Region | us-central1 | us-central1 |

## Integration Contract

```text
Consumer → Monolith Docs:
  POST /api/open    { fileUrl, callbackUrl, token, user }
  → Returns: { editorUrl }

Monolith Docs → Consumer (callback on save):
  POST {callbackUrl}   { status, downloadUrl }
```

## Conventions

- No business logic in this repo — business rules live in consumer apps
- Stateless API — all state lives in OnlyOffice internals
- No `any` type — use `unknown` and narrow
- No `console.log` — use structured logging
- Update docs in the same session as code/infrastructure changes
- Shared-surface changes are contract-first
