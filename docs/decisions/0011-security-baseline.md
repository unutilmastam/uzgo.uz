# 0011 — Security baseline from Phase 1 ("security first")

- Status: Accepted
- Date: 2026-10-14
- Source: owner's instruction (2026-10-14): UZGO is a serious, large-scale
  project and security comes first; docs/SPEC.md §17

## Context

Security is cheapest when it is part of the foundation, not added before launch.

## Decision

Phase 1 already enforces:

- **Config:** Zod-validated env, app refuses to start on invalid config; error
  messages name variables but never echo values; production requires https
  CORS origins and turns Swagger off by default.
- **HTTP (API):** Helmet headers with `default-src 'none'` CSP for JSON,
  exact-match CORS allow-list with credentials, JSON body limit (default 1 MB),
  `trust proxy` explicit, no `X-Powered-By`, standard error shape without stack
  traces or internals.
- **HTTP (web):** `X-Frame-Options: DENY`, `frame-ancestors 'none'`,
  `nosniff`, strict referrer and permissions policy, no `X-Powered-By`. A full
  nonce-based CSP is added in Phase 7.
- **Logging:** pino JSON logs with request id; cookies, authorization headers,
  tokens, OTP codes, passwords and card fields redacted; query strings not
  logged; `maskPhone()` for phone numbers.
- **Request id:** incoming `X-Request-Id` accepted only if it matches a safe
  pattern (no log injection), otherwise a UUID is generated.
- **Database:** Docker Compose binds PostgreSQL to `127.0.0.1` only.
- **Supply chain:** exact dependency versions + lockfile with
  `--frozen-lockfile`; dependency install scripts blocked except an allow-list
  (`allowBuilds`); `pnpm audit` in CI (accepted findings listed with reasons in
  `pnpm-workspace.yaml`); GitHub Actions pinned to commit SHAs with read-only
  token permissions; Dependabot; dependency review on PRs; CodeQL
  (`security-extended`) on every push/PR and weekly.

Rate limiting, auth, CSRF origin checks, RBAC and audit log arrive with the
features that need them (Phase 3), as planned in docs/SECURITY.md.

## Consequences

Slightly more CI time. Every accepted audit finding must be re-reviewed each
phase. Owner should also enable GitHub secret scanning + push protection and
branch protection on `main` (repository settings — cannot be done from code).
