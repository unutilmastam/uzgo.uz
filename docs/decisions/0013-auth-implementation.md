# 0013 — Authentication implementation details (Phase 3)

- Status: Accepted
- Date: 2026-10-14
- Builds on: 0004 (phone OTP + database sessions)

## Decision

- **Hashing:** OTP codes and client IPs are stored as HMAC-SHA256 with
  `AUTH_SECRET` (a leaked database alone cannot brute-force 6-digit codes or
  reveal IPs). Session tokens are 256-bit random and stored as SHA-256.
- **Limits live in PostgreSQL** (counting `OtpCode` rows per phone and per IP
  hash), so they survive restarts and work with several API instances. A
  per-phone advisory lock serialises concurrent requests. Burst limits per IP
  use `@nestjs/throttler` in memory (Redis only via a later ADR).
- **Deny by default:** a global guard requires a session unless a route is
  `@Public()`; roles via `@Roles()`. Roles and user status are loaded from the
  database on every request (no stale permissions in tokens).
- **CSRF:** SameSite=Lax + origin guard on state-changing requests.
- **Cookie:** `__Host-` prefix in production; 30-day absolute expiry.
- **Test support:** a `FakeSmsProvider` and a `GET /__test__/last-otp` route let
  Playwright log in for real; both are refused outside `NODE_ENV=test`.
- **Phone numbers:** `libphonenumber-js` (max metadata) on the server; the web
  only bounds input length/characters.
- **Seeds:** reference data only. The first super admin is granted from the
  server console (`user:grant-role`), never seeded.
- **Scripts** (`prisma/seed.ts`, `scripts/*.ts`) run with `tsx`, because the
  generated Prisma client uses `.js` import specifiers for TypeScript files.

## Consequences

- `AUTH_SECRET` rotation invalidates pending codes (not sessions).
- A real SMS provider adapter is required before launch (open decision).
- Staff TOTP is still to be implemented before production.
