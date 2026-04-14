# Monolith Docs AI Workspace

This directory is the active home for AI operational state in this repo.

## Layout

- `registry.yml` — machine-readable initiative index
- `initiatives/active/` — in-progress initiatives
- `initiatives/planning/` — planned initiatives
- `initiatives/complete/` — completed initiatives
- `initiatives/archive/` — absorbed, superseded, or historical initiative references
- `backlog.yml` — optional atomic task backlog
- `iddp/` — review and commit-gating files

## Rules

- Keep initiative execution truth in each initiative `plan.md`.
- Keep durable initiative-specific decisions in each initiative `guidance.md`.
- Use `ROADMAP.md` for the high-level human-readable summary.
- Keep `.ai/registry.yml` in sync when initiative lane, status, blockers, or parent/child relationships change.
- This workflow does not use a repo-level current file, session ledger, or handoff file.
- Manual reviews can be triggered at any time.
- Stop coding at checkpoint boundaries and run the checkpoint review before continuing.
- Checkpoint reviews default to Codex for a single reviewer. When two reviewers are needed, use Codex + Sonnet. Add Kimi when the checkpoint is frontend-heavy and the extra UI review is worthwhile.
- Phase close-outs always require multiple reviewers. Default to Codex + Sonnet, and add Kimi for frontend-heavy work when useful.
- Doc sync is required before any commit and at every phase close-out. Update the initiative plan, `.ai/registry.yml`, and `ROADMAP.md` when reality changed.
- Commits always require explicit user approval. Do not auto-commit after a passing review.
- The repo does not use commit-ready stamps or approval stamp files in the active workflow.
- Do not recreate the old docs-based control-plane sprawl in this directory.
