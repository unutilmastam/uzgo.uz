# Claude Code uchun buyruqlar

Har bir fazani boshlash uchun tegishli blokni to'liq nusxalab Claude Code'ga
yuboring. Bitta faza tugagach, hisobotni o'qing, CI yashil ekanini tekshiring,
keyin keyingisini yuboring.

---

## PHASE 0 — Discovery and architecture

```
Read CLAUDE.md, docs/SPEC.md and docs/REVIEW.md first. docs/SPEC.md is the
authoritative specification.

We are in PHASE 0 — DISCOVERY AND ARCHITECTURE. Produce documentation only.
No application code, no package installs.

Create or update:
- README.md (project summary, repo map, status, link to docs)
- docs/VISION.md (product scope, users: customer/seller/admin, MVP boundary,
  explicit non-goals)
- docs/ARCHITECTURE.md (modular monolith, module list with responsibilities and
  phase, web↔API topology, request lifecycle, adapters, Mermaid diagram)
- docs/DATABASE.md (draft entities and relations as a Mermaid ER diagram,
  money/time/ID conventions, order + seller-order state machines with final
  states, deletion/retention rules, indexes and constraints to enforce)
- docs/API.md (conventions: /api/v1, error shape, pagination, idempotency keys,
  auth cookie, request id, OpenAPI)
- docs/DESIGN_SYSTEM.md (principles, token categories, component inventory —
  values are finalised in Phase 2)
- docs/SECURITY.md (threat model summary, auth/OTP rules, RBAC, CSRF/CORS,
  logging/masking, uploads, retention, personal-data residency risk)
- docs/DEPLOYMENT.md (hosting requirements, options with pros/cons incl. local
  Uzbekistan hosting vs foreign, why cPanel shared hosting is unsuitable)
- docs/ROADMAP.md (update the checklist; mark Phase 0 items VERIFIED only when
  the document exists and is reviewed)
- docs/decisions/0001-... one ADR per key decision already taken in SPEC
  (modular monolith, Prisma location, Zod contracts, OTP + DB sessions,
  money in tiyin, multi-seller order split, same-site API, CI as source of truth)

List every unresolved decision explicitly with who must decide it.

At the end report in Uzbek (Latin), short:
1. Files created/updated
2. Decisions made
3. Assumptions
4. Risks and open questions
5. Commands to start development (for Phase 1)
6. Exact next task

Commit and push. STOP after Phase 0.
```

---

## PHASE 1 — Project foundation

```
Read CLAUDE.md, docs/SPEC.md, docs/ROADMAP.md and the relevant docs before any
change. Inspect the existing repository and preserve valid work.

We are now in PHASE 1 — PROJECT FOUNDATION. Implement only this:

1. pnpm workspace monorepo with Turborepo; root scripts: dev, build, lint,
   typecheck, test, format, format:check, db:migrate, db:seed, db:studio.
   Pin Node LTS via .nvmrc and "engines"; set "packageManager".
2. packages/config: shared strict tsconfig base, ESLint flat config, Prettier.
3. packages/contracts: Zod set-up with one real shared schema (health response)
   used by both apps — no business schemas yet.
4. apps/web: Next.js App Router, TypeScript strict, Tailwind CSS. One minimal
   page that shows the API health status (server-side fetch). Rewrite /api/* to
   the API in development. No design system, no i18n yet (Phase 2).
5. apps/api: NestJS with:
   - environment validation (Zod) — the app refuses to start with invalid env;
   - global prefix /api/v1, request-id middleware, structured JSON logging with
     secret masking, global exception filter returning
     { error: { code, message, details?, requestId } };
   - security headers, CORS allow-list from env, body size limit;
   - Swagger at /api/docs (disabled in production unless enabled by env);
   - GET /api/v1/health/live and GET /api/v1/health/ready (ready checks DB).
6. Prisma in apps/api/prisma ONLY: datasource + generator, an initial migration
   with no business models (or a minimal _meta table if a migration needs a
   model — document the choice), seed script skeleton that does nothing harmful.
   Business models start in Phase 3.
7. docker-compose.yml with PostgreSQL (named volume, healthcheck). Also document
   running without Docker (native PostgreSQL).
8. .env.example for root/apps with placeholders only; .gitignore covers env
   files, build output, coverage, Playwright reports.
9. Tests:
   - api: unit test for env validation; integration test for health endpoints
     against a real PostgreSQL (live = 200; ready = 200 when DB up).
   - web: one unit/component test and a successful production build.
10. .github/workflows/ci.yml: on push and PR — install with frozen lockfile,
    format:check, lint, typecheck, prisma migrate deploy against a PostgreSQL
    service container, test, build. Cache pnpm store.
11. README.md: exact setup and startup commands (with and without Docker, and
    "from phone via Claude Code + CI" notes).
12. Update docs/ROADMAP.md with real verified status. Add ADRs for any new
    decision.

Constraints:
- Do not implement marketplace, auth, payments, delivery, i18n, design system or
  mobile.
- No unnecessary dependencies; justify each one in the report.
- Use current stable versions; check them instead of relying on memory.
- If Docker is not available in this session, install/start PostgreSQL
  directly if possible; otherwise state exactly which checks only run in CI.

Before implementing: give a brief plan and the list of expected files.

After implementing, run: pnpm format:check, pnpm lint, pnpm typecheck,
pnpm test, pnpm build. Fix failures caused by your changes. Do not claim
success for checks that did not run.

Final report in Uzbek (Latin), short:
- Files created/changed
- Dependencies added and why
- Install command
- Local environment setup commands
- Start commands for web and API
- Checks executed and their actual results
- Unresolved problems
- Recommended next task

Commit, push, and confirm the CI run result if you can see it.
STOP after Phase 1. Do not start Phase 2.
```

---

## PHASE 2 — Design system and web shell

```
Read CLAUDE.md, docs/SPEC.md, docs/ROADMAP.md, docs/DESIGN_SYSTEM.md.
We are in PHASE 2 — DESIGN SYSTEM AND WEB SHELL. Only this phase.

- Finalise design tokens (colour incl. dark mode, typography with fonts that
  support Uzbek Latin ʻ/ʼ and Cyrillic, spacing, radius, shadow, motion) in
  packages/ui and document values in docs/DESIGN_SYSTEM.md.
- Build shared components (shadcn/ui based, accessible): Button, Input, Select,
  Badge, Card, ProductCard, ServiceCard, Dialog, Sheet, Toast, Skeleton,
  EmptyState, Pagination.
- next-intl with /uz and /ru routes, default uz, language switch keeps the page.
  All UI strings in message files; no hardcoded text.
- Layout: header (logo, search box UI, language, account, cart), category menu,
  mobile bottom navigation, footer.
- Homepage with clearly marked fixture data: banners, popular categories,
  product grid, "coming soon" service cards (non-interactive).
- Loading, empty and error states.
- Playwright smoke tests at 360px, 768px, 1280px for uz and ru; axe
  accessibility check on the homepage.
- An original UZGO identity — do not copy any other company's brand.

Run format:check, lint, typecheck, test, build (and e2e). Report in Uzbek with
real results and screenshots paths if produced. Update ROADMAP. Commit, push.
STOP after Phase 2.
```

---

## PHASE 3 — Data and authentication

```
Read CLAUDE.md, docs/SPEC.md (§9, §13, §17), docs/DATABASE.md, docs/SECURITY.md.
We are in PHASE 3 — DATA AND AUTHENTICATION. Only this phase.

- Prisma models: Region, District (seeded with real Uzbekistan regions and
  districts — cite the source in docs), User, UserProfile, Session, OtpCode,
  Role, StoreMembership placeholder only if needed by RBAC, AuditEvent.
- Phone + OTP login: SmsProvider interface + DevSmsProvider (dev only, refuses
  in production). OTP hashed, TTL, attempt limit, resend cooldown, rate limits
  per phone and IP.
- Opaque sessions hashed in DB, HttpOnly Secure SameSite=Lax cookie, logout,
  logout-all. Origin check for state-changing requests.
- Roles and guards; current-user endpoint; profile update.
- Web: login flow (phone → code), account page, protected routes.
- Audit events for auth and role changes.
- Tests: invalid input, rate limits, expired/wrong OTP, session revocation,
  unauthorised access, DevSmsProvider blocked in production.

Run all checks, report in Uzbek, update ROADMAP and docs. Commit, push.
STOP after Phase 3.
```

---

## PHASE 4 — Marketplace core

```
Read CLAUDE.md, docs/SPEC.md (§3, §10, §13), docs/DATABASE.md, docs/API.md.
We are in PHASE 4 — MARKETPLACE CORE. Only this phase. Split into sub-steps
and commit after each: (a) catalog, (b) stores + products + variants + media,
(c) catalog web pages, (d) search, (e) cart, (f) checkout + orders.

- Category tree with per-locale names; attributes for filters.
- Store; Product with moderation status; ProductVariant with price (BigInt tiyin),
  stock, SKU, optional fiscal fields (MXIK/IKPU, package code, VAT).
- StorageAdapter (dev: local disk; S3-compatible interface) for product images.
- Catalog, category, product detail, store pages (uz/ru, SEO metadata, sitemap).
- Search: PostgreSQL full-text + normalisation of Uzbek apostrophes and
  Latin↔Cyrillic; filters, sorting, pagination.
- Cart (guest cookie + merge on login), server-side price recalculation.
- Checkout with cash on delivery: Order + SellerOrder per store, OrderItem
  snapshots, Idempotency-Key, transactional stock reservation, state machine
  with OrderEvent log, human-readable order numbers.
- Seed realistic demo data clearly marked as demo.
- Tests: seller isolation, server-side totals, concurrent orders cannot
  oversell (parallel requests on real PostgreSQL), idempotent checkout,
  invalid transitions rejected.

Run all checks, report in Uzbek, update ROADMAP and docs. Commit, push.
STOP after Phase 4.
```

---

## PHASE 5 — Seller and admin

```
Read CLAUDE.md, docs/SPEC.md, docs/ROADMAP.md.
We are in PHASE 5 — SELLER AND ADMIN INTERFACES. Only this phase.

- Seller onboarding (store application, legal entity/individual entrepreneur
  details as fields only, admin approval).
- /seller: products and variants CRUD, image upload, stock, submit for review,
  orders (SellerOrder fulfilment transitions), store staff management.
- /admin: store approval, product moderation, categories/attributes, users and
  roles, orders overview, audit log viewer.
- Server-side authorisation everywhere; audit events for sensitive actions;
  TOTP second factor for staff accounts.
- Tests for every permission boundary.

Run all checks, report in Uzbek, update ROADMAP and docs. Commit, push.
STOP after Phase 5.
```

---

## PHASE 6 — Payments and delivery

```
Read CLAUDE.md, docs/SPEC.md (§11, §12), docs/SECURITY.md.
We are in PHASE 6 — PAYMENTS AND DELIVERY. Only this phase.

First, without writing code: research candidate Uzbekistan payment providers'
current official merchant documentation (callback model, signature/auth,
amount units, fiscal receipt requirements, refunds, test environment). Write
docs/decisions/ADR for the choice and list what credentials the owner must
obtain. Wait for my confirmation before implementing.

Then: PaymentProvider interface + adapters for the confirmed providers,
PaymentAttempt, verified callbacks only, idempotency, amount checks, fiscal
data in receipts, refunds and returns, LedgerEntry + commission + Payout,
DeliveryZone by district, PickupPoint, shipment tracking, notifications
(SMS/Telegram adapter). Fake adapters only in dev/test and clearly labelled.

Tests: duplicate callbacks, wrong amount, bad signature, timeout/cancel,
refund flows, ledger balances.

Run all checks, report in Uzbek, update ROADMAP and docs. Commit, push.
STOP after Phase 6.
```

---

## PHASE 7 — Production readiness

```
Read CLAUDE.md, docs/SPEC.md (§14, §17), docs/DEPLOYMENT.md.
We are in PHASE 7 — PRODUCTION READINESS. Only this phase.

Ask me for the final hosting choice first if docs/DEPLOYMENT.md has no decision.
Then: production Dockerfiles, reverse proxy + HTTPS config, migrations on deploy,
backups and restore test, monitoring/error tracking, log retention, rate-limit
review, security review against docs/SECURITY.md, performance (Lighthouse on
mobile), full Playwright E2E for buyer and seller flows, legal pages (offer,
privacy), deployment and rollback runbook.

Report in Uzbek with real results. Update ROADMAP. STOP after Phase 7.
```

---

## Har qanday faza ichida xato bo'lsa

```
CI failed (or: this does not work: <describe>). Read the logs, find the root
cause, fix it within the current phase scope, rerun all checks and report the
real results in Uzbek. Do not disable tests.
```
