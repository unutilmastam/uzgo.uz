# UZGO — Product & Technical Specification (v2, reviewed)

This is the authoritative specification. It replaces the original brief. Changes
from the original are explained in `docs/REVIEW.md`.

---

## 1. Role

You act as lead architect, full-stack engineer, database designer, security
engineer, QA engineer and documentation maintainer for UZGO.

Work incrementally. Explain important decisions briefly. Write maintainable,
tested code. Never claim a feature is complete unless implemented and verified.

## 2. Product

UZGO is a digital services platform for Uzbekistan. The **first and only
current product is UZGO Market**: a multi-vendor marketplace (many sellers, one
storefront, one cart) comparable in model to large regional marketplaces —
with an original brand and design.

Long-term modules (NOT in scope until Phase 9): Delivery, Go (ride-hailing),
Food, Maps, unified Search, AI, mobile apps. They may appear on the homepage
only as clearly labelled "Tez kunda / Скоро" cards with no fake functionality.

No cloud-computing product. Ordinary hosting is fine.

## 3. Market and localisation

- Languages: **Uzbek Latin (`uz`)** primary, **Russian (`ru`)**. Architecture must
  allow adding `uz-Cyrl` and `en` later without schema changes.
- Uzbek text uses the correct apostrophe characters (`oʻ`, `gʻ`, `ʼ`: U+02BB /
  U+02BC). Search must normalise variants (`o'`, `o‘`, `o``, `oʻ`).
- Search must also tolerate Latin ↔ Cyrillic Uzbek and Russian queries
  (transliteration-based normalisation, added in Phase 4).
- **User-generated catalog content is multilingual**: category names, product
  titles/descriptions and attribute labels store per-locale values with a
  fallback locale. UI strings use the i18n library; content uses the database.
- Currency: UZS. Stored as **integer tiyin (`BigInt`)**, 1 som = 100 tiyin
  (this also matches how local payment providers report amounts). Display is
  formatted per locale (`12 500 soʻm` / `12 500 сум`), usually without tiyin.
- Time: store UTC (`timestamptz`); display in `Asia/Tashkent`.
- Phones: store E.164 (`+998901234567`); validate with a phone library; UI
  defaults to +998 but does not hard-block other country codes.
- Geography: configurable `Region → District` (viloyat → tuman) reference data,
  seeded with real Uzbekistan regions. Delivery coverage is configured per
  district, never hardcoded to one city.

## 4. Technology stack

Use current stable versions (verify at implementation time).

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo (task caching/orchestration only) |
| Runtime | Node.js LTS, pinned via `.nvmrc` and `engines` |
| Web | Next.js (App Router), TypeScript strict, Tailwind CSS, shadcn/ui |
| Web i18n | `next-intl` with locale-prefixed routes (`/uz/...`, `/ru/...`) |
| API | NestJS, REST, OpenAPI (Swagger) at `/api/docs` |
| Validation | **Zod** schemas in `packages/contracts`, shared by web and API (API uses a Zod validation pipe). One source of truth instead of duplicated class-validator DTOs + frontend schemas |
| API client | Typed client generated from the OpenAPI document (Phase 4+), or thin typed fetch wrapper using `packages/contracts` until then |
| DB | PostgreSQL + Prisma, versioned migrations, seed script |
| Cache/queues | **None initially.** Redis is added only with a written ADR (e.g. job queue for notifications, distributed rate limiting) |
| File storage | S3-compatible object storage behind a `StorageAdapter`; dev adapter writes to local disk. No product images in the database or in git |
| Tests | Vitest (unit), Supertest + real PostgreSQL (API integration), Playwright (E2E) |
| Lint/format | ESLint (flat config) + Prettier, shared config package |
| CI | GitHub Actions with a PostgreSQL service container |
| Local dev | Docker Compose for PostgreSQL (optional — native PostgreSQL also documented) |

Do not add other technologies without an ADR.

## 5. Repository layout

Create folders only when the phase that needs them starts. No empty placeholder
files.

```
uzgo/
  CLAUDE.md  README.md  package.json  pnpm-workspace.yaml  turbo.json
  .nvmrc  .gitignore  .env.example  docker-compose.yml
  .github/workflows/ci.yml
  apps/
    web/                 # Next.js: storefront + /seller + /admin route groups
    api/                 # NestJS modular monolith
      prisma/            # THE ONLY Prisma schema, migrations, seed
        schema.prisma
        migrations/
        seed.ts
  packages/
    contracts/           # Zod schemas + inferred TS types shared by web & api
    config/              # shared tsconfig, eslint, prettier presets
    ui/                  # (Phase 2) design tokens + shared components
  docs/
    SPEC.md REVIEW.md PROMPTS.md ROADMAP.md
    VISION.md ARCHITECTURE.md DATABASE.md API.md
    DESIGN_SYSTEM.md SECURITY.md DEPLOYMENT.md
    decisions/
```

Decisions behind this layout:
- Prisma lives in `apps/api/prisma` because only the API touches the database.
  The web app never imports Prisma.
- `shared-types` and `validation` are merged into `contracts` (types are inferred
  from Zod schemas, so a separate types package would duplicate them).
- `api-client` is created only when the OpenAPI-generated client is introduced.
- Seller and admin UIs are route groups inside `apps/web` with their own layouts
  and **server-side** guards. Split into separate apps only if needed later.
- `apps/mobile` is not created until Phase 8.

## 6. Architectural principles

1. Foundation before features.
2. Business logic in API services, not in UI components or controllers.
3. Database access only inside API modules (repository/service layer).
4. Validate every untrusted input on the server.
5. Authorise on the server for every request; UI hiding is cosmetic only.
6. Explicit module boundaries; modules talk through services, not each other's tables.
7. No duplicated business logic.
8. Transactions for anything that must be atomic.
9. Idempotency keys for order creation and every payment operation.
10. External providers behind replaceable adapters.
11. Configuration via validated environment variables; app fails fast on bad config.
12. Every screen has loading, empty, error and success states.
13. Keyboard accessible, WCAG AA contrast, visible focus.
14. Mobile-first responsive web (most users in Uzbekistan browse on phones).
15. Significant decisions recorded as ADRs.
16. Simple and testable over premature optimisation.
17. Never fake a successful integration.
18. Never log secrets, tokens, OTP codes, full card data or full phone numbers
    (mask them).

## 7. Web ↔ API topology

- Browser talks to the API **through the same site**: the API is served under
  `/api` of the web origin (Next.js rewrite in dev; reverse proxy in prod), or
  on a sub-domain of the same registrable domain. This keeps auth cookies
  first-party and simplifies CORS/CSRF.
- Next.js server components may call the API server-to-server using an internal
  base URL.
- API versioning: prefix `/api/v1`.
- Standard error shape: `{ error: { code, message, details?, requestId } }`.
- Every request gets a `requestId` (header `X-Request-Id`) used in logs.
- Health: `GET /api/v1/health/live` (process up) and `/health/ready` (DB reachable).

## 8. Backend modules

Plan around these modules (implemented progressively):

| Module | First phase |
|---|---|
| config, health, logging, errors | 1 |
| auth (OTP + sessions), users, roles/permissions | 3 |
| geo (regions, districts), audit | 3 |
| catalog (categories, attributes), products, variants, media | 4 |
| stores (seller storefronts), inventory | 4 |
| cart, checkout, orders (split per seller), search | 4 |
| seller onboarding & management, moderation, admin | 5 |
| payments (adapters), fiscalisation data, refunds/returns | 6 |
| delivery (zones, pickup points, tracking), notifications | 6 |
| seller ledger & payouts | 6 |
| reviews & ratings, promo codes | after MVP |

## 9. Authentication and accounts

- **Primary login: phone number + one-time SMS code (OTP).** This is the
  dominant pattern in Uzbekistan. Password login is not required for customers.
- SMS sending behind `SmsProvider` adapter. Real candidates (e.g. local SMS
  gateways) are chosen and verified later. `DevSmsProvider` logs the code to the
  console **only when `NODE_ENV=development`**; it must refuse to run in production.
- OTP rules: 6 digits, hashed at rest, 2–5 min TTL, max attempts per code, resend
  cooldown, rate limits per phone and per IP, generic error messages.
- Sessions: **opaque, random session tokens** stored hashed in the `Session`
  table; sent in an `HttpOnly; Secure; SameSite=Lax` cookie. Supports logout,
  logout-all, and revocation. (No long-lived JWTs in browser storage.)
- Mobile (Phase 8) will use the same session table with bearer tokens.
- Staff (admin/moderator) accounts additionally require a second factor before
  production (TOTP). No shared admin password, no default admin in production
  seeds.
- Roles: `CUSTOMER`, `SELLER_OWNER`, `SELLER_STAFF`, `MODERATOR`, `ADMIN`,
  `SUPER_ADMIN`. Seller roles are scoped to a store (membership table).
  Permissions are checked by guards + service-level ownership checks.

## 10. Marketplace domain (key rules)

**Catalog**
- `Category` tree (parent/child, slug, sort, per-locale names, active flag).
- `Product` belongs to one `Store`. Has status
  `DRAFT → PENDING_REVIEW → APPROVED | REJECTED`, and `ARCHIVED`. Only
  `APPROVED` + in-stock products appear on the storefront.
- **`ProductVariant` (SKU)** — price, stock and barcode live on the variant, not
  on the product (size/colour/volume). A product without options has one variant.
- Category-specific attributes (`Attribute`, `AttributeValue`) for filters.
- `ProductImage` stores object-storage keys, order and alt text.
- **Fiscal fields** (needed later for payment receipts in Uzbekistan): each
  variant must be able to carry its product classification code (MXIK/IKPU),
  package code and VAT rate. Fields are added in Phase 4 as optional and become
  required before real payments (Phase 6). Exact requirements are verified with
  the chosen payment provider.

**Inventory**
- Stock per variant (per warehouse later). Reservation on order creation inside
  a transaction using conditional updates (`UPDATE … SET stock = stock - n
  WHERE id = … AND stock >= n`) or row locks. Stock can never go negative
  (DB `CHECK` constraint too).
- Unpaid reservations expire and are released by a scheduled job.

**Cart and checkout**
- Cart per user (guest cart in a cookie, merged at login).
- Prices in the cart are **always recalculated on the server** at checkout.
- One checkout can contain items from several sellers: it creates one
  `Order` (customer-facing) with one **`SellerOrder` (shipment) per store**.
  Each seller sees and fulfils only its own `SellerOrder`.
- `OrderItem` snapshots title, variant, unit price, quantity, store, fiscal codes.
- Order creation requires an `Idempotency-Key` header; repeats return the
  original result.

**Order state machine** (implemented as an explicit transition table, tested):

```
Order:       PENDING_PAYMENT → PAID → (all shipments resolved) → COMPLETED
             PENDING_PAYMENT → CANCELLED (timeout / customer)
             cash-on-delivery: CREATED → CONFIRMED → … → COMPLETED
SellerOrder: NEW → ACCEPTED → PACKED → HANDED_TO_DELIVERY → DELIVERED
             NEW/ACCEPTED → CANCELLED_BY_SELLER
             DELIVERED → RETURN_REQUESTED → RETURNED
```
Final states are defined in `docs/DATABASE.md` in Phase 0 and may be refined
with an ADR. Every transition writes an `OrderEvent` row (who, when, from, to).

**Payment methods for MVP**: cash/card on delivery first (no provider needed),
online payment in Phase 6.

## 11. Payments (Phase 6)

- `PaymentProvider` interface; one adapter per provider. Candidate local
  providers are evaluated in Phase 6 (their merchant/webhook docs must be read
  and requirements verified — do not assume).
- `PaymentAttempt` with provider, external id, amount (tiyin), status, raw
  callback payload (secrets stripped), idempotency key.
- Success is only accepted from a **verified server-side callback or status
  query**, never from a browser redirect.
- Callbacks are signature/auth-verified, idempotent and amount-checked.
- Refunds are separate records. Never store card numbers.
- Seller money: `LedgerEntry` (double-entry style: sale, commission, refund,
  payout) and `Payout` records. Commission rate per category or store.

## 12. Delivery (Phase 6)

- `DeliveryZone` (district coverage, price rules, ETA), `PickupPoint`
  (address, coordinates, hours), seller self-delivery or platform courier.
- Delivery-partner and map providers behind adapters.

## 13. Database rules

- IDs: UUID v7 (or cuid2) primary keys; human-readable order numbers separately
  (`UZ-2026-000123`).
- `createdAt`/`updatedAt` on all tables, `timestamptz`.
- Foreign keys and `CHECK` constraints for money ≥ 0 and stock ≥ 0.
- Soft delete (`deletedAt`) for users, stores, products; orders, payments,
  ledger and audit rows are **never** deleted.
- Unique constraints: phone, store slug, SKU per store, idempotency key per user.
- Index every foreign key and every storefront filter column.
- Personal data minimised; retention rules documented in `docs/SECURITY.md`.
- Full schema and ER diagram (Mermaid) in `docs/DATABASE.md`.

## 14. Hosting, data residency and deployment (OPEN DECISION)

- The owner's current cPanel shared hosting **cannot run** this stack. Production
  needs at least: a Node.js runtime for API and web (long-running processes),
  PostgreSQL, object storage, HTTPS reverse proxy, backups and scheduled jobs.
- **Legal risk to verify with a lawyer before launch:** Uzbekistan's personal
  data law requires personal data of Uzbek citizens to be stored on servers
  physically located in Uzbekistan (and database registration). This affects
  provider choice (local VPS/data-centre vs foreign cloud).
- Phase 0 documents options in `docs/DEPLOYMENT.md`; the final choice is made
  before Phase 7. Code must stay host-agnostic (12-factor, env-config, Docker
  image buildable).

## 15. Design direction

Premium, clean, original UZGO identity. Mobile-first. Consistent design tokens
(colour, typography, spacing, radius, shadow, motion), documented in
`docs/DESIGN_SYSTEM.md` and implemented in `packages/ui` (Phase 2).
Components: buttons, inputs, selects, cards (product, service, store), dialogs,
sheets, navigation (header, mobile bottom bar, category menu), badges, toasts,
skeletons, empty states, pagination. Fonts must support Uzbek Latin characters
and Cyrillic. Do not copy any other company's branding, colours or assets.

## 16. Homepage (Phase 2, real data in Phase 4)

Header with logo, search, language switch (UZ/RU), account entry, cart. Category
navigation. Marketplace discovery (banners, popular categories, product grids).
Upcoming services clearly labelled, non-interactive. Footer (about, help,
seller sign-up, terms, privacy, contacts). Works at 360px, 768px, 1280px+.
In Phase 2, product data is static fixture data clearly marked as such.

## 17. Security

Progressive, starting in Phase 1:
- Helmet-style security headers, strict CORS allow-list, body size limits.
- Rate limiting on auth/OTP and write endpoints (in-memory store first; Redis
  only via ADR when running multiple instances).
- CSRF: SameSite cookies + Origin/Referer check on state-changing requests
  (double-submit token if cross-site is ever needed).
- Server-side RBAC + ownership checks; tests that a seller cannot touch another
  seller's data.
- Audit log for admin/moderator/seller-sensitive actions.
- Safe error messages; stack traces never returned in production.
- `pnpm audit` / dependency review in CI; secret scanning on the repo.
- File uploads: type/size validation, re-encode images, random keys, no
  user-controlled paths.
- Legal pages (offer/terms, privacy policy) required before public launch.

## 18. Testing

Each phase adds tests. Required critical tests (as features arrive):
invalid input rejected; unauthenticated/unauthorised rejected; seller isolation;
server-side prices and totals; no overselling under concurrent orders (real
PostgreSQL, parallel requests); idempotent order and payment operations; order
state transitions; OTP limits. Never disable a failing test to pass CI.

## 19. Workflow

Before changes: inspect repo, read docs, identify phase, list files, plan,
assumptions, risks. After changes: lint, typecheck, test, build, review diff,
update docs + ROADMAP, report real results in Uzbek. Ask before destructive
operations. No unnecessary packages.

## 20. Phases

| # | Phase | Summary |
|---|---|---|
| 0 | Discovery & architecture | Docs only: VISION, ARCHITECTURE, DATABASE (draft ERD), API conventions, DESIGN_SYSTEM (principles), SECURITY, DEPLOYMENT options, ROADMAP, ADRs |
| 1 | Foundation | Monorepo, web + api skeletons, strict TS, lint/format, env validation, health endpoints, Prisma connected (no business models), Docker Compose for Postgres, CI |
| 2 | Design system & web shell | `packages/ui` tokens/components, i18n routing uz/ru, header/footer/nav, homepage with fixture data, responsive checks, Playwright smoke |
| 3 | Data & auth | Geo reference data, User/Session/Role models, OTP auth with DevSmsProvider, guards, audit log, security tests |
| 4 | Marketplace core | Categories, attributes, stores, products + variants, media storage adapter, catalog pages, search (Postgres FTS + normalisation), cart, checkout (COD), split orders, idempotency, concurrency tests |
| 5 | Seller & admin | Seller onboarding, product management, moderation, seller order fulfilment, admin panel, audit |
| 6 | Payments & delivery | Provider selection, payment adapters + verified callbacks, fiscal data, refunds/returns, delivery zones, pickup points, tracking, notifications, ledger & payouts |
| 7 | Production readiness | Hosting decision executed, security review, performance, monitoring, backups, E2E, legal pages, deployment docs |
| 8 | Mobile | Flutter vs React Native reassessed, same API |
| 9 | Ecosystem | Further services as separate modules, only when justified |

A phase is complete only when its requirements are implemented, lint/typecheck/
tests/build pass (in CI at minimum), docs are updated, limitations are recorded
and ROADMAP items are marked VERIFIED. Use NOT STARTED / IN PROGRESS / BLOCKED /
VERIFIED.
