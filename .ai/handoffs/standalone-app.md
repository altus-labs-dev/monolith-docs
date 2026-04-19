# Standalone App Handoff

Updated: 2026-04-19
Initiative: `standalone-app`
Lane: `active`
Status: `in_progress`
Current checkpoint: `Phase 0 (SA-0.0 through SA-0.5)`

## Current State

Phase 0 is locally code-complete for the repo restructure:

- pnpm + Turbo workspace landed
- `api/` moved to `apps/api/`
- `packages/db/` Prisma 7.7 scaffold landed
- `apps/web/` placeholder landed
- repo docs and control-plane files updated to the new layout
- GCE deploy scripts now deploy explicit refs and record current/previous SHAs
- the fresh-VM `deploy-ref` bug in `infrastructure/gce/startup.sh` is fixed

Checkpoint review status is still `FAIL` because the required external Phase 0 evidence is not captured yet. See:

- `.ai/initiatives/active/standalone-app/reviews/review-phase-0-attempt-1.md`
- `.ai/initiatives/active/standalone-app/reviews/review-phase-0-attempt-2.md`

Pre-deploy safety review status is now `PASS`. See:

- `.ai/initiatives/active/standalone-app/reviews/review-phase-0-predeploy-codex.md`
- `.ai/initiatives/active/standalone-app/reviews/review-phase-0-predeploy-codex-attempt-2.md`

## Verification Already Run

- `node scripts/validate-ai-workspace.mjs`
- `node scripts/run-turbo.mjs typecheck`
- `node scripts/run-turbo.mjs lint`
- `node scripts/run-turbo.mjs test`
- `pnpm --filter @monolith-docs/db run generate`
- `pnpm --filter @monolith-docs/db exec prisma --version`
- `docker compose build`
- `docker compose up -d`
- `curl http://localhost:3020/health`
- `curl http://localhost:3020/api/status`
- `docker compose down && docker compose up -d`

## Open Gates Before Phase 0 Can Close

- Real CRM consumer round-trip verification against a committed SHA
- Real Connect consumer round-trip verification against a committed SHA
- Dev GCE deploy of the committed SHA using `infrastructure/gce/deploy.sh`
- Remote health and Track A/Track C evidence capture on the dev deployment
- Rollback dry run on dev and recipe capture in the handoff and/or `ERRORS.md`
- Cross-project sync of `C:\Dev\monolith-platform\docs\ecosystem\integration-status\monolith-docs.yaml` if the Phase 0 path/tooling changes affect it

## Next Steps

1. Run or refresh a focused pre-deploy safety review for the local Phase 0 state; do not deploy code with unresolved local review findings.
2. When that pre-deploy review is clean enough, create a deployable checkpoint commit and push that SHA.
3. Deploy that reviewed SHA with `./infrastructure/gce/deploy.sh dev <sha>`.
4. Run the required consumer-path and remote deploy checks, then capture the rollback recipe and finish the checkpoint closeout review.
