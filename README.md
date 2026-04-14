# Monolith Docs

Open-source document editing service built on [OnlyOffice DocumentServer](https://www.onlyoffice.com/developer-edition.aspx). It provides browser-based DOCX editing with real-time collaboration and integrates with external applications over a lightweight API boundary.

## Quick Start

**Prerequisites:** Docker, Docker Compose, Node.js 22+

```bash
git clone https://github.com/altus-labs-dev/monolith-docs.git
cd monolith-docs
cp .env.example .env
docker compose up -d

# or develop the API locally
npm install
npm run dev
```

Once running:

- **API health:** <http://localhost:3020/health>
- **OnlyOffice editor:** <http://localhost:8080>
- **Combined status:** <http://localhost:3020/api/status>

## Architecture

```text
monolith-docs/
├── api/                  Thin Node.js + Fastify API layer
│   └── src/
│       ├── routes/       Health, document, upload, and callback endpoints
│       ├── auth.ts       Consumer auth and hostname enforcement
│       ├── consumers.ts  Consumer config resolution
│       ├── storage.ts    Signed URL and GCS integration
│       └── server.ts     Entry point
├── infrastructure/       GCP deployment scripts and hosted env config
├── docs/                 Technical and architectural docs
└── .ai/                  Initiative tracking and review workflow
```

| Component | Purpose |
| --------- | ------- |
| **OnlyOffice DocumentServer** | Core document editing engine |
| **API** | Auth, GCS integration, callback handling, health checks |
| **Infrastructure** | GCE deployment and hosted service config |

## Integration Model

Monolith Docs runs as a separate service. Consuming apps integrate via API:

```text
Consumer App → POST /api/documents/open → { editorUrl }
User edits document in Monolith Docs
Monolith Docs → POST {callbackUrl} → Consumer stores updated file
```

## Development

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
docker compose config
```

## Current Source Of Truth

- `CLAUDE.md` — repo-wide engineering rules and architecture constraints
- `ROADMAP.md` — high-level delivery and feature status
- `.ai/registry.yml` — machine-readable initiative index
- `.ai/initiatives/<lane>/<initiative-id>/guidance.md` — initiative-specific constraints
- `.ai/initiatives/<lane>/<initiative-id>/plan.md` — initiative execution status and acceptance criteria

## AI Skills

Use the lightweight `.ai` control plane with these skills:

- `/control-plane setup` — onboard a new repo or migrate an old repo to the new `.ai` structure
- `/control-plane audit` — inspect the repo for stale control-plane files, drift, or inconsistencies
- `/control-plane fix` — repair control-plane issues found in the audit
- `/initiative create` — create a new tracked initiative with `guidance.md` and `plan.md`
- `/initiative checkpoint` — stop at a checkpoint boundary, run verification, run checkpoint review, run doc sync, then ask whether to commit
- `/initiative review` — manually trigger a review without committing
- `/initiative phase-close` — run a multi-reviewer phase closeout, doc sync, then ask whether to commit
- `/initiative doc-sync` — reconcile `plan.md`, `.ai/registry.yml`, and `ROADMAP.md` without implying review passed
- `/tests audit|design|run|coverage` — inspect and run the verification stack
- `/kimi-coworker` — optional extra reviewer or implementer for frontend-heavy work

Reviewer defaults:

- single-reviewer checkpoint: `codex`
- multi-reviewer checkpoint or phase closeout: `codex` + `sonnet`
- frontend-heavy review: add `kimi` when useful

Commit policy:

- every commit requires explicit user approval
- doc sync runs before any approved commit
- the repo does not use commit-ready stamp files

## License

[AGPL-3.0](LICENSE) — required because OnlyOffice DocumentServer is AGPL-licensed. All source code in this repo is open source.

## Notes

- The active AI workflow lives under `.ai/`, not `docs/`.
- `docs/` is reserved for technical, architectural, and product documentation.
