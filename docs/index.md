# Documentation Index

The `docs/` directory now holds technical and product documentation, not the active AI control plane.

## What Lives Here

- `docs/adr/` — architecture decision records
- `docs/guides/` — durable operational guides, including Cloud SQL proxy port assignments
- architecture and implementation reference docs
- durable product or integration notes that are not active initiative state

## What Does Not Live Here Anymore

The active AI workflow now lives under `.ai/`:

- `.ai/registry.yml` — initiative index
- `.ai/initiatives/` — active, planning, complete, and archive initiative docs
- `.ai/backlog.yml` — optional atomic task backlog
- `.ai/iddp/` — review and commit-gating policy

## Source Of Truth

- `CLAUDE.md` owns repo-wide engineering conventions.
- `ROADMAP.md` owns the high-level feature and delivery summary.
- `.ai/registry.yml` owns the machine-readable initiative index.
- `.ai/initiatives/<lane>/<id>/guidance.md` owns durable initiative-specific constraints.
- `.ai/initiatives/<lane>/<id>/plan.md` owns execution status and acceptance criteria.
