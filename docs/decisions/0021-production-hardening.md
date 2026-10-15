# 0021 — Production hardening from the Phase 7 security review

- Status: Accepted
- Date: 2026-10-15
- Builds on: 0011 (security baseline), 0020 (production hosting)

## Context

The Phase 7 review (SECURITY.md → "Phase 7 security review") checked the code
and the production stack against the threat model. Five gaps needed a design
decision rather than a one-line fix.

## Decisions

1. **Least-privilege database role.** Migrations and backups run as the
   owner `uzgo`; the API connects as `uzgo_app`, which may only read and write
   rows (`SELECT/INSERT/UPDATE/DELETE`, sequences). It cannot change the
   schema, `TRUNCATE`, read the migration history, or drop/disable the
   triggers that make orders, the ledger and the audit log append-only.
   `deploy/scripts/app-role.sql` is applied idempotently on every deploy and
   after every restore; backups are taken without grants. The full API test
   suite (206 tests) passes when run as this role.
2. **Per-visitor rate limits for server rendering.** Next.js server-side
   calls reach the API from the web container, so all visitors shared one
   120/min bucket. The web server now sends `x-uzgo-internal-token`
   (`INTERNAL_API_TOKEN`, required in production) and the visitor IP from
   Caddy's `X-Forwarded-For`; the throttler counts the call against that IP.
   Without a valid token the forwarded IP is ignored (no spoofing).
3. **Nonce Content-Security-Policy** on every HTML page, generated per request
   in `proxy.ts`: `script-src 'self' 'nonce-…' 'strict-dynamic'`, no
   `unsafe-eval`/`unsafe-inline` scripts, `frame-ancestors 'none'`,
   `object-src 'none'`, `form-action 'self'`. Zod runs `jitless` in the
   browser so it does not probe `eval`. An e2e test fails on any violation.
4. **Stock hoarding limit.** A customer may have at most 3 online orders
   awaiting payment (`TOO_MANY_UNPAID_ORDERS`, 409); checkout is limited to 10
   requests per minute per IP.
5. **Operator alerts** for unhandled 5xx errors and failing jobs go to an ops
   Telegram chat, throttled (one per fingerprint per 10 min, ≤ 20 per hour)
   and with route pattern, error class and request id only.

## Consequences

- `APP_DB_PASSWORD` and `INTERNAL_API_TOKEN` are new production secrets.
- A future feature needing DDL at runtime (none planned) would need its own ADR.
- Rate limiting stays in memory (single API instance); a second instance needs
  a shared store (Redis) — separate ADR.
