# UZGO

UZGO Market — an original multi-vendor marketplace for Uzbekistan (many
sellers, one storefront, one cart). Web first, mobile later. First module of the
future UZGO ecosystem. Languages: Uzbek (Latin) primary, Russian second.
Security first (`docs/decisions/0011-security-baseline.md`).

**Status:** Phase 7 (production readiness: hosting, security review, backups, monitoring) — see `docs/ROADMAP.md`.

## Stack

pnpm 12 + Turborepo monorepo · Node.js 24 LTS · Next.js 16 (App Router) +
Tailwind CSS 4 + shadcn/ui (Radix) + next-intl · NestJS 12 REST API · PostgreSQL 18 + Prisma 7 · Zod 4 contracts
· Vitest + Supertest + Playwright/axe · GitHub Actions CI + CodeQL. Versions and reasons:
`docs/decisions/0009-toolchain-versions.md`.

## Repository map

```
apps/web            Next.js storefront (+ /seller, /admin later)
apps/api            NestJS modular monolith
apps/api/prisma     the only Prisma schema, migrations, seed
packages/contracts  Zod schemas shared by web and api
packages/config     shared tsconfig / ESLint / Prettier presets
packages/ui         design tokens + shared components
deploy/             production Compose stack, Caddyfile, ops scripts (RUNBOOK)
docs/               specification, architecture, decisions
```

## Working from a phone (owner)

The owner drives Claude Code in the cloud. Write **"davom et"** to run the next
phase. **GitHub Actions CI is the source of truth**: open the repository's
_Actions_ tab to see whether the latest commit is green.

## Local setup (developers)

Requirements: Node.js 24 (`.nvmrc`), pnpm 12 (`corepack enable` picks the
version from `packageManager`), PostgreSQL 18 (Docker or native).

```bash
corepack enable
pnpm install

# environment (placeholders — edit if needed)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

### Database with Docker

```bash
docker compose up -d postgres     # PostgreSQL on 127.0.0.1:5432
pnpm db:deploy                    # apply migrations
pnpm db:seed                      # regions, districts and the category tree
pnpm db:seed:demo                 # + clearly labelled demo stores/products (never in production)
```

### Database without Docker (native PostgreSQL)

```bash
# Ubuntu/Debian example
sudo apt install postgresql
sudo -u postgres psql -c "CREATE USER uzgo WITH PASSWORD 'uzgo_dev_password' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE uzgo OWNER uzgo;"
pnpm db:deploy
pnpm db:seed:demo
```

### Run

```bash
pnpm dev            # web on http://localhost:3000, API on http://localhost:4000
```

- Storefront: http://localhost:3000/uz (and /ru). Demo data is labelled "Demo".
- Technical status page with live API/database status: http://localhost:3000/uz/status.
- Login: http://localhost:3000/uz/login. In development the SMS code is printed
  in the API console (`[DEV SMS] …`) — `DevSmsProvider` never runs in production.
- First super admin (no default admin exists): log in once, then
  `pnpm --filter @uzgo/api user:grant-role +998XXXXXXXXX SUPER_ADMIN`.
- API health: `GET /api/v1/health/live`, `GET /api/v1/health/ready`.
- In development the web forwards `/api/*` to the API (same-site, ADR 0007).
- Swagger UI: http://localhost:4000/api/docs (off in production by default).

### Checks (same as CI)

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test           # API integration tests use DATABASE_URL from apps/api/.env (real PostgreSQL)
pnpm build
pnpm e2e           # Playwright + axe; needs `pnpm build` and DATABASE_URL exported (first run:
                    # pnpm --filter @uzgo/web exec playwright install chromium)
pnpm audit
```

### Database scripts

`pnpm db:migrate` (create/apply a migration in development) · `pnpm db:deploy`
(apply migrations) · `pnpm db:seed` · `pnpm db:studio`.

## Documentation

| File                    | Contents                                          |
| ----------------------- | ------------------------------------------------- |
| `CLAUDE.md`             | Rules for Claude Code (autopilot: "davom et")     |
| `docs/SPEC.md`          | Authoritative specification                       |
| `docs/REVIEW.md`        | What was fixed in the original brief (Uzbek)      |
| `docs/PROMPTS.md`       | Prompt for each phase                             |
| `docs/ROADMAP.md`       | Progress and open decisions                       |
| `docs/VISION.md`        | Product scope, users, MVP, non-goals, owner brief |
| `docs/ARCHITECTURE.md`  | Modules, topology, request lifecycle, adapters    |
| `docs/DATABASE.md`      | Draft ER diagram, conventions, state machines     |
| `docs/API.md`           | API conventions                                   |
| `docs/DESIGN_SYSTEM.md` | Design principles, colour/wordmark proposal       |
| `docs/SECURITY.md`      | Threat model, auth, RBAC, logging, data residency |
| `docs/DEPLOYMENT.md`    | Hosting decision, requirements, secrets           |
| `docs/RUNBOOK.md`       | Server setup, deploy, rollback, backup, restore   |
| `docs/PERFORMANCE.md`   | Lighthouse results and next optimisations         |
| `docs/decisions/`       | Architecture Decision Records                     |
