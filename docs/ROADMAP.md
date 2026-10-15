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
| 6     | Payments, fiscal data, refunds, delivery, ledger & payouts                     | IN PROGRESS |
| 7     | Hosting, security review, monitoring, backups, E2E, legal pages                | NOT STARTED |
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
The owner confirmed the choice on 2026-10-15. Merchant credentials and the
lawyer's opinion on the marketplace payment scheme are still needed before
going live (owner actions in ADR 0017).

## Open decisions

| Decision                                                                                                                                                    | Who                          | When                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------- |
| Launch region (working assumption: Surxondaryo first, then all Uzbekistan)                                                                                  | Owner                        | Before Phase 4 seed / Phase 6 delivery zones         |
| First seller categories (working assumption: clothing, electronics, household appliances, groceries) and whether perishable food waits until delivery works | Owner                        | Before Phase 4 seed                                  |
| Final designer logo (optional; colours/wordmark implemented in Phase 2)                                                                                     | Owner                        | Phase 2                                              |
| SMS provider                                                                                                                                                | Owner                        | Before production auth (Phase 3 uses DevSmsProvider) |
| Payment providers — decided: Payme + Click (ADR 0017); merchant contracts + credentials                                                                     | Owner                        | Before online payments go live                       |
| Delivery partners / map provider                                                                                                                            | Phase 6 research, then owner | Phase 6                                              |
| Production hosting provider (data residency)                                                                                                                | Owner + lawyer               | Before Phase 7                                       |
| Legal: personal-data residency & registration, offer/terms, privacy, returns, fiscal receipts                                                               | Owner + lawyer               | Before public launch                                 |
| Commission rates per category/store                                                                                                                         | Owner                        | Phase 6                                              |
| Return window length (default draft 10 days)                                                                                                                | Owner + lawyer               | Phase 4–6                                            |
| Domain (assumed uzgo.uz) and email                                                                                                                          | Owner                        | Before Phase 7                                       |
