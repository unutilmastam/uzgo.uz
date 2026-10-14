# SECURITY

Security is built progressively from Phase 1. This document is the threat model
summary and the rules every phase follows.

## Assets
Customer personal data (phone, name, addresses, order history); sessions; seller
data and money balances; admin access; product catalogue integrity; payment
callbacks (Phase 6).

## Threat model (summary)
| Threat | Mitigation |
|---|---|
| Account takeover via OTP brute force / SMS pumping | 6-digit hashed codes, 2–5 min TTL, max attempts per code, resend cooldown, rate limit per phone and per IP, daily cap, generic messages |
| Session theft | Opaque random token, only hash stored, `HttpOnly; Secure; SameSite=Lax` cookie, expiry, revocation, logout-all |
| CSRF | SameSite cookie + Origin/Referer check on state-changing requests; same-site API |
| XSS | React escaping, no raw HTML from users, CSP headers, sanitised rich text if ever added |
| Seller accessing another seller's data (IDOR) | Server-side guards + ownership checks in services; tests per endpoint |
| Price/total tampering | All prices, totals, stock decided on the server; cart recalculated at checkout |
| Overselling / race conditions | Conditional stock updates in transactions, `CHECK (stock >= 0)`, concurrency tests |
| Duplicate orders/payments | Idempotency keys |
| Fake payment success | Accept only verified server callbacks / status queries; signature + amount check; idempotent |
| Malicious uploads | Type/size allow-list, image re-encode, random storage keys, no user paths, served from storage domain |
| Admin compromise | No default admin in production, TOTP second factor for staff, audit log, least privilege |
| Data leaks via logs | Masking of secrets, tokens, OTP codes, full phones, card data |
| Dependency vulnerabilities | Lockfile, `pnpm audit`/dependency review in CI, secret scanning |
| Abuse / scraping / DoS (app level) | Rate limits, body size limits; network-level DoS handled by hosting/proxy |

## Authentication rules
- Customers: phone + OTP only. See `decisions/0004-otp-and-db-sessions.md`.
- `DevSmsProvider` logs the code only when `NODE_ENV=development` and refuses to
  start otherwise.
- Staff (moderator/admin/super admin): OTP + TOTP before production.
- Session lifetime: sliding (e.g. 30 days customers, shorter for staff — fixed in Phase 3).

## Authorisation (RBAC)
Roles: `CUSTOMER`, `SELLER_OWNER`, `SELLER_STAFF` (scoped per store via
membership), `MODERATOR`, `ADMIN`, `SUPER_ADMIN`. Guards check role; services
check ownership (store membership, order owner). UI hiding is cosmetic only.
Deny by default.

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
