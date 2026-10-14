# 0002 — Prisma lives only in apps/api

- Status: Accepted
- Date: 2026-10-14
- Source: docs/SPEC.md §5

## Context
Only the API accesses the database. A root-level prisma folder suggested shared DB access and conflicted between phases.

## Decision
The single Prisma schema, migrations and seed live in apps/api/prisma. The web app never imports Prisma; it talks to the API.

## Consequences
Clear ownership of data. Web needs the API running for data, including in server components.
