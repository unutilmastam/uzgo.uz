# UZGO

UZGO Market — an original multi-vendor marketplace for Uzbekistan (many
sellers, one storefront, one cart). Web first, mobile later. First module of the
future UZGO ecosystem. Languages: Uzbek (Latin) primary, Russian second.

**Status:** Phase 0 (architecture docs) done. No application code yet —
Phase 1 (foundation) is next. See `docs/ROADMAP.md`.

## Planned stack
pnpm + Turborepo monorepo · Next.js (App Router) + Tailwind + shadcn/ui ·
NestJS REST API · PostgreSQL + Prisma · Zod contracts · Vitest, Supertest,
Playwright · GitHub Actions CI. Details: `docs/SPEC.md` §4.

## Repository map (target, created phase by phase)
```
apps/web            Next.js storefront + /seller + /admin   (Phase 1+)
apps/api            NestJS modular monolith + prisma/       (Phase 1+)
packages/contracts  Zod schemas shared by web and api       (Phase 1)
packages/config     tsconfig / eslint / prettier presets    (Phase 1)
packages/ui         design tokens + components              (Phase 2)
docs/               specification, architecture, decisions
```

## Documentation
| File | Contents |
|---|---|
| `CLAUDE.md` | Rules for Claude Code (autopilot: "davom et") |
| `docs/SPEC.md` | Authoritative specification |
| `docs/REVIEW.md` | What was fixed in the original brief (Uzbek) |
| `docs/PROMPTS.md` | Prompt for each phase |
| `docs/ROADMAP.md` | Progress and open decisions |
| `docs/VISION.md` | Product scope, users, MVP, non-goals, owner brief |
| `docs/ARCHITECTURE.md` | Modules, topology, request lifecycle, adapters |
| `docs/DATABASE.md` | Draft ER diagram, conventions, state machines |
| `docs/API.md` | API conventions |
| `docs/DESIGN_SYSTEM.md` | Design principles, colour/wordmark proposal, components |
| `docs/SECURITY.md` | Threat model, auth, RBAC, logging, data residency |
| `docs/DEPLOYMENT.md` | Hosting requirements and options |
| `docs/decisions/` | Architecture Decision Records |

## Working from a phone
The owner drives Claude Code in the cloud. Write **"davom et"** to run the next
phase. GitHub Actions CI (from Phase 1) is the source of truth for checks.
