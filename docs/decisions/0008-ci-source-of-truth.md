# 0008 — GitHub Actions CI as source of truth

- Status: Accepted
- Date: 2026-10-14
- Source: docs/SPEC.md CLAUDE.md, §4

## Context

The owner has no computer and works from a phone with Claude Code in the cloud. Docker and local services may not be available in the session.

## Decision

GitHub Actions CI (install with frozen lockfile, format check, lint, typecheck, migrations against a PostgreSQL service, tests, build) is the authoritative quality gate. Every phase must keep main green. Local checks are run when possible and reported honestly.

## Consequences

Each phase ends with a pushed commit and a CI result. Failing CI blocks the next phase. Deployments must also be triggerable from GitHub.
