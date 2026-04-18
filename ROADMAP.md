# Monolith Docs Roadmap

High-level feature and delivery status lives here. Detailed execution state lives in the linked initiative docs under `.ai/`.

## Active

_None._

## Complete

### Production Hardening

- Status: `completed` (2026-04-18)
- Summary: Security hardening, multi-consumer architecture, Cloudflare Tunnel infrastructure, and integration verification all landed and running in production. CRM and Connect round-trip documents live.
- Plan: `.ai/initiatives/complete/production-hardening/plan.md`
- Guidance: `.ai/initiatives/complete/production-hardening/guidance.md`

## Planning

### Standalone App

- Status: `planning`
- Summary: Full standalone subscriber-facing surface with Platform SSO, database, provisioning, events, tRPC, and frontend.
- Plan: `.ai/initiatives/planning/standalone-app/plan.md`
- Guidance: `.ai/initiatives/planning/standalone-app/guidance.md`

## Archive

### Monolith Docs Foundation And Integration

- Status: `archived`
- Summary: Original umbrella initiative. Phases 1-4 landed the API scaffold, OnlyOffice integration, GCS support, and hosted deployment scripts. Remaining follow-on work moved into dedicated initiatives.
- Plan: `.ai/initiatives/archive/monolith-docs/plan.md`
- Guidance: `.ai/initiatives/archive/monolith-docs/guidance.md`
- Follow-on initiatives:
  - `production-hardening`
  - `standalone-app`
