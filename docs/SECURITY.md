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
- **Staff second factor (TOTP, Phase 5, ADR 0016):** RFC 6238 codes from an
  authenticator app; secrets AES-256-GCM encrypted (`TOTP_ENCRYPTION_KEY`);
  replay refused; 5 wrong codes → 15 min lock (audited `auth.totp_locked`);
  verified per session for 12 h. All `/admin/*` routes need it.
  `STAFF_TOTP_REQUIRED=false` is rejected in production. A super admin can
  reset a lost factor (`auth.totp_reset`, all sessions revoked).
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
- **Seller isolation (Phase 5):** every `/seller/stores/:storeId/...` call
  checks `StoreMember`; non-members get 404. Team management is owner-only;
  suspended/rejected stores are read-only.
- **Back office (Phase 5):** moderators review stores and products; admins also
  manage catalogue, users (block = sessions revoked), orders and the audit
  viewer; staff accounts can only be blocked or reset by a super admin; nobody
  acts on their own account.

## CSRF

`SameSite=Lax` cookies plus an origin guard: every state-changing request
(POST/PUT/PATCH/DELETE) must carry an allow-listed `Origin` or `Referer`;
without either it is accepted only if it carries no cookies at all.

## Commerce rules (Phase 4)

- **Prices, totals and stock are decided on the server only.** The cart stores
  quantities, never prices; checkout recomputes everything and rejects a total
  the customer did not see (`PRICE_CHANGED`). Request schemas are strict, so
  extra fields such as a price are rejected.
- **Idempotent checkout:** the `Idempotency-Key` row is inserted in the same
  transaction as the order (`ON CONFLICT DO NOTHING`), so concurrent duplicates
  wait and then replay the stored response; a reused key with a different body
  is refused.
- **No overselling:** conditional stock decrements + `CHECK (stock >= 0)`.
- **Isolation:** customers see only their orders; sellers only shipments of
  stores they are members of; foreign ids answer 404 (no existence leak).
- **Guest cart cookie:** random token, only its SHA-256 is stored;
  `HttpOnly; SameSite=Lax`, `__Host-` prefix in production; merged into the
  user cart at login and then invalidated.
- **Storage:** server-generated keys only; path containment; media responses
  with `nosniff` and a sandbox CSP; SVG is not an accepted image type.
- **Search:** user input is normalised to `[a-z0-9 ]` tokens and passed as
  bound parameters (no SQL or tsquery injection).
- **Orders are permanent:** database triggers forbid deleting orders,
  shipments and items and changing items and order events.

## Payments, money and callbacks (Phase 6, ADR 0017–0019)

- **Provider callbacks** (`/payments/payme`, `/payments/click/*`) are public
  routes authenticated by the provider's secret: Payme Basic auth
  (`Paycom:<KEY>`), Click MD5 `sign_string` with `SECRET_KEY`; both compared in
  constant time. Optional Payme source-IP allow-list (`PAYME_ALLOWED_IPS`).
  They are not rate-limited per IP and always answer in the provider's format.
- **Amounts** come only from the server: the provider's amount must equal the
  order total exactly (Payme tiyin integers; Click soʻm strings converted with
  integer arithmetic). Clients never send prices.
- **Idempotency and races**: unique provider transaction ids; attempt rows are
  locked (`FOR UPDATE`) before state changes; at most one captured payment per
  order (partial unique index); duplicate callbacks return the same answer.
- **Stock and expiry**: online orders hold stock until `paymentDueAt`; a job
  cancels unpaid orders (leaving open provider transactions to time out).
- **Simulated provider** `DEV_ONLINE` only with `DEV_PAYMENTS_ENABLED`, which env
  validation refuses in production; its page is labelled as a test.
- **Ledger** is double-entry, append-only, and the database rejects any
  unbalanced journal at commit. Refunds and payouts are never deleted; one open
  refund per shipment. Bank details: audit keeps only the last 4 digits.
- **Notifications** carry no address or name; failures are retried and logged
  with masked phones only.

## Uploads (Phase 5)

Product images: one file per request, ≤ 8 MB, kept in memory (never on disk
before validation), decoded by libvips with a 40 MP pixel limit, auto-rotated,
resized to ≤ 1600 px and re-encoded to WebP — this strips EXIF/GPS and any
payload hidden in the file. SVG and anything not decodable is refused.
Storage keys are random; the media route sends `nosniff` and a sandbox CSP.

## Audit log

`AuditEvent` rows: `user.created`, `auth.login`, `auth.logout`,
`auth.logout_all`, `auth.otp_locked`, `user.profile_updated`, `role.granted`,
`role.revoked`; Phase 5: `auth.totp_enabled`, `auth.totp_locked`,
`auth.totp_reset`, `store.applied|approved|rejected|suspended|reactivated`,
`store.member_added|member_removed`, `product.created|updated|submitted|
archived|restored|image_added|image_removed|approved|rejected`,
`variant.created|updated` (price changes record from/to),
`category.*`, `attribute.*`, `user.blocked|unblocked`. The admin viewer shows
masked phones and never IP hashes. A PostgreSQL trigger rejects UPDATE and DELETE on the table.
In production the API connects as `uzgo_app`, which cannot TRUNCATE, alter
tables or disable triggers (ADR 0021).

## HTTP hardening

Security headers (Helmet-style: HSTS, CSP, X-Content-Type-Options,
Referrer-Policy, frame-ancestors), strict CORS allow-list from env, JSON body
limit (e.g. 1 MB; uploads separately limited), no stack traces in production
responses. HTML pages carry a per-request nonce CSP (ADR 0021); Caddy adds
HSTS (1 year), removes `Server`, redirects HTTP→HTTPS and `www.`→apex, and caps
request bodies at 25 MB.

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

## Phase 7 security review (2026-10-15)

Scope: the code (API, web), the production stack (`deploy/`), CI and
dependencies, checked against the threat model above. Method: reading the
code paths, the API test suite (206 tests, also run as the least-privilege
DB role), browser e2e (34 tests incl. axe and CSP), the stack smoke test in CI
(HTTPS, headers, test routes, DB role, backup/restore, rollback) and
`pnpm audit`.

| #   | Finding                                                                                                                              | Severity            | Status                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | --------------------------------------------------------- |
| 1   | API used the DB owner role: a compromised app could TRUNCATE or drop the triggers protecting orders, ledger and audit log            | High                | Fixed — `uzgo_app` role (ADR 0021)                        |
| 2   | Server-rendered pages reached the API from one container IP, so all visitors shared one rate-limit bucket (site-wide 429 under load) | High (availability) | Fixed — internal token + forwarded visitor IP             |
| 3   | No `script-src` in CSP: an XSS bug would run freely                                                                                  | Medium              | Fixed — nonce CSP, e2e check                              |
| 4   | Unlimited unpaid online orders could hold a seller's whole stock                                                                     | Medium              | Fixed — max 3 unpaid per customer, checkout 10/min per IP |
| 5   | `robots.txt` was prerendered at build time (wrong domain/indexing switch in the image)                                               | Low                 | Fixed — rendered at request time                          |
| 6   | Next.js data cache kept API responses across restarts/restores                                                                       | Low                 | Fixed — cache on tmpfs in production                      |
| 7   | 5xx errors and failing jobs were only logged                                                                                         | Low                 | Fixed — throttled Telegram alerts without personal data   |
| 8   | `braces` ReDoS via `@next/eslint-plugin-next` (lint time only)                                                                       | Accepted            | Reviewed exception in `pnpm-workspace.yaml`               |

Checked without findings: OTP limits and hashing; session and cart cookies
(`__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`); origin guard; RBAC and
store isolation (API tests per boundary); staff TOTP; server-side prices and
totals; idempotent checkout; Payme/Click authentication, amount checks and
row locking; upload re-encoding; audit log; log redaction; test-only routes
(404 in production, checked in the smoke test); Swagger off in production;
PostgreSQL not reachable from outside; containers non-root, read-only,
without capabilities; secrets only in env files with mode 600.

### Rate limits (per client IP unless stated)

| Route                             | Limit                          | Notes                                                                                                |
| --------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| All API routes (default)          | 120 / min                      | In memory; SSR calls counted per visitor (ADR 0021)                                                  |
| `POST /auth/otp/request`          | 5 / min                        | Plus per phone 5 / hour and 10 / day, resend cooldown 60 s, per IP `OTP_IP_HOURLY_LIMIT` (20 / hour) |
| `POST /auth/otp/verify`           | 10 / min                       | Plus 5 attempts per code, code TTL 180 s                                                             |
| `POST /auth/totp/setup            | enable                         | verify`                                                                                              | 5 / min | Plus lock for 15 min after 5 failures |
| `POST /checkout`                  | 10 / min                       | Plus max 3 unpaid online orders per customer                                                         |
| `POST /seller/stores` (apply)     | 5 / min                        |                                                                                                      |
| `POST /seller/stores/:id/members` | 10 / min                       |                                                                                                      |
| Product image upload              | 30 / min                       | One file ≤ 8 MB per request                                                                          |
| Payme / Click callbacks           | not limited                    | Authenticated by provider secret; optional Payme IP allow-list                                       |
| Request body                      | 1 MB JSON (API), 25 MB (Caddy) |                                                                                                      |

### Remaining risks and owner actions

- Legal review of data residency, offer and privacy texts (drafts published,
  marked as drafts); register the personal-data database if required.
- Payme/Click sandbox certification before live payments; Eskiz templates.
- Single server: availability depends on one VPS (backups + runbook tested).
- In-memory rate limits reset on restart and do not span several API
  instances (Redis ADR when scaling out).
- GitHub: enable secret scanning, branch protection and a required reviewer
  on the `production` environment (RUNBOOK §2).
