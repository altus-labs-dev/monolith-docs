# Monolith Docs

Open-source document editing service built on [OnlyOffice DocumentServer](https://www.onlyoffice.com/developer-edition.aspx). Provides browser-based DOCX editing with real-time collaboration, designed to integrate with external applications via a lightweight REST API.

## Quick Start

**Prerequisites:** Docker, Docker Compose, Node.js 22+

```bash
# Clone the repo
git clone https://github.com/altus-labs-dev/monolith-docs.git
cd monolith-docs

# Copy environment config
cp .env.example .env

# Start all services (OnlyOffice + API)
docker compose up -d

# Or develop the API locally (install deps first)
npm install
npm run dev
```

Once running:

- **API health:** <http://localhost:3010/health>
- **OnlyOffice editor:** <http://localhost:8080>
- **Combined status:** <http://localhost:3020/api/status>

## Architecture

```text
monolith-docs/
├── api/                  Thin Node.js + Fastify API layer
│   └── src/
│       ├── routes/       Health, document open/save/callback endpoints
│       ├── config.ts     Environment configuration
│       ├── app.ts        Fastify app builder
│       └── server.ts     Entry point
├── docker-compose.yml    Local dev (OnlyOffice + API)
├── infrastructure/       GCP deployment scripts (planned)
└── docs/                 Planning and architecture docs
```

| Component | Purpose |
| --------- | ------- |
| **OnlyOffice DocumentServer** | Core document editing engine (Docker container) |
| **API** | Auth, GCS integration, callback handling, health checks |
| **Infrastructure** | GCE VM deployment (OnlyOffice is stateful) |

## Integration Model

Monolith Docs runs as a separate service. Consuming apps integrate via API:

```text
Consumer App → POST /api/documents/open → { editorUrl }
User edits document in Monolith Docs
Monolith Docs → POST {callbackUrl} → Consumer stores updated file
```

## Development

```bash
npm install          # Install all workspace dependencies
npm run dev          # Start API in dev mode (tsx watch)
npm run build        # Build API
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm test             # Run tests
```

## License

[AGPL-3.0](LICENSE) — required because OnlyOffice DocumentServer is AGPL-licensed. All source code in this repo is open source. See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.
