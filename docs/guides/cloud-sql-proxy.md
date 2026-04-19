# Cloud SQL Proxy

This repo participates in the shared Monolith local Cloud SQL proxy port convention.

If older notes or session memory disagree with this file, trust this file and the Platform repo's canonical guide at `C:\Dev\monolith-platform\docs\guides\cloud-sql-proxy.md`.

## Port Assignment

- Docs reserved Cloud SQL proxy port: `6543`
- Platform Cloud SQL proxy port: `6540`

## Cross-Repo Proxy Map

| Repo | Proxy Port | Status |
|------|------------|--------|
| Platform | `6540` | active |
| CRM | `6541` | reserved |
| Connect | `6542` | reserved |
| Docs | `6543` | reserved for Docs-owned Cloud SQL sessions |

## Usage Notes

- Use `6543` for Docs-owned Cloud SQL proxy sessions.
- Use `6540` when a Docs workflow needs direct access to the Platform database.
- Do not use `5432`-`5434` for Monolith Cloud SQL proxy ports.

## Command Templates

Docs-owned Cloud SQL session:

```powershell
~/cloud-sql-proxy.exe <DOCS_INSTANCE_CONNECTION_NAME> --port=6543
```

Platform database session from Docs:

```powershell
~/cloud-sql-proxy.exe monolith-platform:us-west1:platform-db --port=6540
```

If ADC is stale, refresh it first:

```powershell
gcloud auth login --update-adc
```