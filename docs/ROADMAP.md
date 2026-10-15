# ROADMAP

Statuses: NOT STARTED · IN PROGRESS · BLOCKED · VERIFIED

| Phase | Item                                                                           | Status      |
| ----- | ------------------------------------------------------------------------------ | ----------- |
| —     | Reviewed specification (docs/SPEC.md, docs/REVIEW.md, docs/PROMPTS.md)         | VERIFIED    |
| 0     | VISION, ARCHITECTURE, DATABASE, API, DESIGN_SYSTEM, SECURITY, DEPLOYMENT docs  | VERIFIED    |
| 0     | ADRs for decisions already taken in SPEC (docs/decisions/0001–0008)            | VERIFIED    |
| 1     | Monorepo, web + api skeletons, strict TS, lint/format                          | VERIFIED    |
| 1     | Env validation, health endpoints, Prisma connected, Docker Compose             | VERIFIED    |
| 1     | GitHub Actions CI green (+ CodeQL, audit, dependency review)                   | VERIFIED    |
| 2     | Design system, i18n uz/ru, web shell, homepage (fixtures)                      | VERIFIED    |
| 3     | Geo data, users, OTP auth, sessions, RBAC, audit                               | VERIFIED    |
| 4     | Catalog, stores, products/variants, search, cart, checkout (COD), split orders | VERIFIED    |
| 5     | Seller panel, moderation, admin panel                                          | VERIFIED    |
| 6     | Payments, fiscal data, refunds, delivery, ledger & payouts                     | VERIFIED    |
| 7     | Hosting, security review, monitoring, backups, E2E, legal pages                | IN PROGRESS |
| 8     | Mobile apps                                                                    | NOT STARTED |
| 9     | Further ecosystem services                                                     | NOT STARTED |

Phase 0 is documentation only; "VERIFIED" means the documents exist, are
consistent with SPEC and were reviewed. No code checks apply.

Phase 1 notes: local checks ran in the cloud session with native PostgreSQL 16
(Docker daemon not available there); CI uses PostgreSQL 18. Docker Compose file
validated with `docker compose config` only. CI run #1 and CodeQL run #1 on
commit 10f7c59 passed.

Phase 2 notes: e2e ran locally with the session's preinstalled Chromium
(`PLAYWRIGHT_CHROMIUM_EXECUTABLE`); CI installs Playwright's own Chromium.

Phase 3 notes: API integration tests run against real PostgreSQL (64 tests);
browser e2e logs in through the real API with the FakeSmsProvider. Staff TOTP
was added in Phase 5.
CI run #8 (commit 06e8a40) passed incl. e2e.

Phase 4 notes: delivered in sub-steps 4a catalog → 4b stores/products/media →
4d search → 4c web pages → 4e cart → 4f checkout/orders. Online payments,
stock reservations with expiry, delivery fees and the seller/admin UIs are
later phases by design. CI run #15 (commit 6b2ed5e) passed incl. e2e and CodeQL.

Phase 5 notes: delivered in sub-steps 5a seller onboarding + store review +
staff TOTP → 5b seller catalogue API (images re-encoded by `sharp`) → 5c admin
API → 5d seller web panel → 5e admin web panel (ADR 0016). Every permission
boundary has an API test (customer / seller / other store / staff without TOTP /
moderator vs admin vs super admin). Browser e2e covers seller application and
draft product, and the full staff flow: TOTP enrolment → store approval →
product moderation → product visible on the storefront. CI run #25 (commit
7f57ad8) passed incl. e2e.

Phase 6 notes: provider research and the proposal are in ADR 0017 (Payme +
Click, UZGO as merchant of record, fiscal receipts via the providers' OFD).
The owner confirmed the choice on 2026-10-15. Delivered in sub-steps: 6a
payment core (online orders hold stock, expiry job, simulated provider) → 6b
Payme Merchant API → 6c Click SHOP API → 6d ledger, commission, refunds,
payouts (ADR 0018) → 6e delivery tariffs, pickup points, tracking,
notification outbox (ADR 0019) → 6f web UI (checkout, payment status, seller
finance, admin finance and delivery). Tests cover duplicate and concurrent
callbacks, wrong amounts, bad signatures, timeouts/cancellations, refunds and
ledger balance. The real Payme/Click adapters are implemented against the
documented protocols but switched on only with merchant credentials; before
going live they must pass the providers' sandbox tests, and the owner actions
in ADR 0017 (merchant contracts, lawyer's opinion, fiscalization) are needed.
CI run #33 (commit 733bba9) passed incl. e2e.

Phase 7 notes: the owner chose a Tashkent VPS; the domain comes later and is a
setting (ADR 0020). Delivered: production Docker images (API, migrate, web;
pinned base, non-root, read-only), Compose stack with Caddy HTTPS, migrations
and automatic rollback in `deploy.sh`, encrypted backups with an automated
restore test and a disaster-recovery restore, host monitor + Telegram alerts,
log rotation, Eskiz SMS adapter, release/deploy workflows, `docs/RUNBOOK.md`.
Security review (SECURITY.md) fixed: least-privilege DB role, per-visitor rate
limits for server rendering, nonce CSP, unpaid-order cap (ADR 0021). Lighthouse
mobile 89–97 performance, 100 accessibility and best practices
(`docs/PERFORMANCE.md`). Full buyer ↔ seller e2e: staff approval → order →
seller fulfilment with tracking → buyer sees delivery. Legal pages (offer,
privacy) are drafts for a lawyer. The stack smoke test (deploy, HTTPS,
headers, DB role, backup, restore, rollback, monitor) runs in CI on every push.
Not done in this phase by design: buying the server/domain, merchant
contracts, real deploy (owner actions in RUNBOOK §1–3, §10).

## Open decisions

| Decision                                                                                                                                                    | Who                          | When                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------- |
| Launch region (working assumption: Surxondaryo first, then all Uzbekistan)                                                                                  | Owner                        | Before Phase 4 seed / Phase 6 delivery zones |
| First seller categories (working assumption: clothing, electronics, household appliances, groceries) and whether perishable food waits until delivery works | Owner                        | Before Phase 4 seed                          |
| Final designer logo (optional; colours/wordmark implemented in Phase 2)                                                                                     | Owner                        | Phase 2                                      |
| SMS provider — Eskiz adapter implemented (Phase 7); account, sender name and templates                                                                      | Owner                        | Before launch                                |
| Payment providers — decided: Payme + Click (ADR 0017); merchant contracts + credentials                                                                     | Owner                        | Before online payments go live               |
| Delivery partners / map provider                                                                                                                            | Phase 6 research, then owner | Phase 6                                      |
| Production hosting — decided: Tashkent VPS (ADR 0020); pick the provider and an off-site backup provider                                                    | Owner + lawyer               | Before launch                                |
| Legal: personal-data residency & registration, offer/terms, privacy, returns, fiscal receipts                                                               | Owner + lawyer               | Before public launch                         |
| Commission rates per category/store                                                                                                                         | Owner                        | Phase 6                                      |
| Return window length (default draft 10 days)                                                                                                                | Owner + lawyer               | Phase 4–6                                    |
| Domain and email (configurable via `UZGO_DOMAIN`)                                                                                                           | Owner                        | Before launch                                |
