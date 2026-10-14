# SECURITY

Security is built progressively from Phase 1. This document is the threat model
summary and the rules every phase follows.

Owner's directive: **security first**. Baseline already in place from Phase 1:
`docs/decisions/0011-security-baseline.md`.

## Owner actions on GitHub (settings, not code)

- Enable secret scanning and push protection.
- Protect `main`: require the CI and CodeQL checks to pass.
- Enable two-factor authentication on the GitHub account.

## Assets

Customer personal data (phone, name, addresses, order history); sessions; seller
data and money balances; admin access; product catalogue integrity; payment
callbacks (Phase 6).

## Threat model (summary)

| Threat                                             | Mitigation                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Account takeover via OTP brute force / SMS pumping | 6-digit hashed codes, 2–5 min TTL, max attempts per code, resend cooldown, rate limit per phone and per IP, daily cap, generic messages |
| Session theft                                      | Opaque random token, only hash stored, `HttpOnly; Secure; SameSite=Lax` cookie, expiry, revocation, logout-all                          |
| CSRF                                               | SameSite cookie + Origin/Referer check on state-changing requests; same-site API                                                        |
| XSS                                                | React escaping, no raw HTML from users, CSP headers, sanitised rich text if ever added                                                  |
| Seller accessing another seller's data (IDOR)      | Server-side guards + ownership checks in services; tests per endpoint                                                                   |
| Price/total tampering                              | All prices, totals, stock decided on the server; cart recalculated at checkout                                                          |
| Overselling / race conditions                      | Conditional stock updates in transactions, `CHECK (stock >= 0)`, concurrency tests                                                      |
| Duplicate orders/payments                          | Idempotency keys                                                                                                                        |
| Fake payment success                               | Accept only verified server callbacks / status queries; signature + amount check; idempotent                                            |
| Malicious uploads                                  | Type/size allow-list, image re-encode, random storage keys, no user paths, served from storage domain                                   |
| Admin compromise                                   | No default admin in production, TOTP second factor for staff, audit log, least privilege                                                |
| Data leaks via logs                                | Masking of secrets, tokens, OTP codes, full phones, card data                                                                           |
| Dependency vulnerabilities                         | Lockfile, `pnpm audit`/dependency review in CI, secret scanning                                                                         |
| Abuse / scraping / DoS (app level)                 | Rate limits, body size limits; network-level DoS handled by hosting/proxy                                                               |

## Authentication rules (implemented in Phase 3)

Customers log in with **phone + one-time SMS code** (ADR 0004, 0013).

| Rule            | Value                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code            | 6 digits from a CSPRNG; stored only as `HMAC-SHA256(AUTH_SECRET, phone:code)`                                                                                     |
| Lifetime        | 180 s; single use (atomic consume — concurrent verifications cannot both succeed)                                                                                 |
| Wrong attempts  | 5 per code, then the code is locked (audited `auth.otp_locked`)                                                                                                   |
| Resend cooldown | 60 s per phone                                                                                                                                                    |
| Per phone       | 5 codes / hour, 10 / day                                                                                                                                          |
| Per IP          | `OTP_IP_HOURLY_LIMIT` codes / hour (default 20) + 5 requests / min burst limit                                                                                    |
| Verify endpoint | 10 requests / min per IP                                                                                                                                          |
| Concurrency     | requests for one phone are serialised with a PostgreSQL advisory lock                                                                                             |
| Errors          | one generic `INVALID_CODE` for wrong / expired / used / locked codes; the request endpoint answers the same for known and unknown phones (no account enumeration) |
| Phones          | normalised to E.164 with libphonenumber; DB `CHECK` enforces E.164                                                                                                |

- **SMS adapters:** `DevSmsProvider` prints the code to the console and refuses
  to exist unless `NODE_ENV=development`; `FakeSmsProvider` (in-memory) only
  with `NODE_ENV=test`. Env validation rejects both in production, so a real
  provider must be configured before launch (open decision).
- **Sessions:** 256-bit random opaque token; only its SHA-256 is stored.
  Cookie `__Host-uzgo_session` in production (`uzgo_session` in dev),
  `HttpOnly; Secure (prod); SameSite=Lax; Path=/`, 30-day absolute expiry.
  Logout revokes the session; logout-all revokes every session of the user.
  Blocked or deleted users lose access immediately (checked on every request).
- **Roles** are read from the database on every request, so granting or
  revoking takes effect immediately.
- **First super admin:** no default admin exists. After the owner logs in once:
  `pnpm --filter @uzgo/api user:grant-role +998XXXXXXXXX SUPER_ADMIN` on the
  server (audited `role.granted`, `via: cli`).
- **Staff second factor (TOTP):** still required before production (Phase 5/7).
- **Privacy:** client IPs are stored only as HMACs; audit metadata holds field
  names and masked phones, never personal values or codes.

## Authorisation (RBAC)

Roles: `CUSTOMER`, `SELLER_OWNER`, `SELLER_STAFF` (scoped per store via
membership, Phase 5), `MODERATOR`, `ADMIN`, `SUPER_ADMIN`.

- A global guard denies every route unless it is marked `@Public()`;
  `@Roles(...)` adds role checks. UI hiding is cosmetic only.
- Only `SUPER_ADMIN` can grant or revoke `ADMIN`/`SUPER_ADMIN`; nobody can
  change their own roles. All role changes are audited.
- Services add ownership checks (store membership, order owner) from Phase 4.

## CSRF

`SameSite=Lax` cookies plus an origin guard: every state-changing request
(POST/PUT/PATCH/DELETE) must carry an allow-listed `Origin` or `Referer`;
without either it is accepted only if it carries no cookies at all.

## Audit log

`AuditEvent` rows: `user.created`, `auth.login`, `auth.logout`,
`auth.logout_all`, `auth.otp_locked`, `user.profile_updated`, `role.granted`,
`role.revoked`. A PostgreSQL trigger rejects UPDATE and DELETE on the table.
(Before production: run the app with a DB role without TRUNCATE on it.)

## HTTP hardening

Security headers (Helmet-style: HSTS, CSP, X-Content-Type-Options,
Referrer-Policy, frame-ancestors), strict CORS allow-list from env, JSON body
limit (e.g. 1 MB; uploads separately limited), no stack traces in production
responses.

## Logging and masking

Structured JSON logs with `requestId`. Never log: secrets, session tokens, OTP
codes, card data, full phone numbers (`+99890*****67`), full addresses.
Audit log for admin, moderator and sensitive seller actions (append-only).

## Data retention (draft — verify with lawyer)

See `DATABASE.md` → Deletion and retention. Personal data minimised; account
deletion anonymises personal fields while keeping order/financial records
required by law.

## Personal-data residency (legal risk)

Uzbekistan's personal data law requires personal data of citizens of
Uzbekistan collected/processed via the internet to be stored on servers
physically located in Uzbekistan, and personal-data databases to be
registered. **To verify with a lawyer before launch.** Impact: production
database and backups (and probably object storage with personal data) should be
hosted in Uzbekistan. See `DEPLOYMENT.md`.

Other legal items to verify before public launch: public offer / terms,
privacy policy and consent, consumer-protection return rules, seller agreements,
fiscal receipt requirements for online payments.

## Secrets

No real secrets in git; `.env.example` with placeholders only. Production
secrets in the host's secret store / env. Rotate on suspicion.
