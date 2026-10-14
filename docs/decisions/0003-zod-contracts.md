# 0003 — Zod contracts shared by web and API

- Status: Accepted
- Date: 2026-10-14
- Source: docs/SPEC.md §4

## Context

Separate class-validator DTOs on the API and form schemas on the web would duplicate validation and drift apart.

## Decision

packages/contracts holds Zod schemas and inferred TypeScript types. The API validates input with a Zod validation pipe; the web uses the same schemas for forms and response parsing. OpenAPI is generated from them.

## Consequences

One source of truth. Requires a Zod → OpenAPI bridge in the API (chosen in Phase 1/4 with current stable versions).
