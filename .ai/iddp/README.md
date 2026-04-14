# IDDP Policy

This repo uses a lightweight Initiative-Driven Development Protocol.

## Rules

- Non-trivial work should be tracked in `.ai/initiatives/`.
- Checkpoint work stops for review before coding continues past the checkpoint boundary.
- Checkpoint review defaults to `codex`; add `sonnet` when needed and add `kimi` for frontend-heavy review when useful.
- Phase close-outs default to multi-reviewer review with `codex` + `sonnet`.
- Doc sync is required before any commit and at every phase close-out.
- Every commit requires explicit user approval.
- Commit-ready stamps and approval stamp files are not part of the active workflow.

## Enforcement

- `scripts/validate-ai-workspace.mjs` validates the active `.ai` workspace shape.
- `.githooks/pre-commit` blocks commits when the repo regresses to the retired docs-based control plane.
