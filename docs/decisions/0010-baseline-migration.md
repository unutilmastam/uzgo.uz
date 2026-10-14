# 0010 — Empty baseline migration in Phase 1

- Status: Accepted
- Date: 2026-10-14
- Source: docs/PROMPTS.md Phase 1, item 6

## Context

Phase 1 must prove the migration pipeline (CI runs `prisma migrate deploy`)
but business models start only in Phase 3.

## Decision

`apps/api/prisma/migrations/20261014000000_init` is a hand-written migration
that creates no tables (`SELECT 1`). No `_meta` table is added. Applying it makes
Prisma create its `_prisma_migrations` history table, which proves connection,
permissions and the deploy step. CI also runs `prisma migrate diff --exit-code`
to fail if the schema and migrations ever drift apart.

## Consequences

The first real tables arrive in the Phase 3 migration. Nothing to clean up.
