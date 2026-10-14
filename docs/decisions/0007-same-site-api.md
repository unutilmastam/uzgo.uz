# 0007 — Same-site API under /api

- Status: Accepted
- Date: 2026-10-14
- Source: docs/SPEC.md §7

## Context

Cross-site API calls complicate cookies (third-party cookie blocking), CORS and CSRF.

## Decision

The browser reaches the API on the same site under /api (Next.js rewrite in development, reverse proxy in production). Server components call the API server-to-server via an internal URL. API prefix /api/v1.

## Consequences

First-party cookies, simple CORS allow-list, CSRF handled by SameSite + Origin check. The production proxy must route /api correctly.
