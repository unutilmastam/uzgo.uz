# 0009 — Toolchain versions (Phase 1)

- Status: Accepted
- Date: 2026-10-14
- Source: CLAUDE.md ("use current stable versions; check them")

## Context

Versions were checked against the npm registry and nodejs.org on 2026-10-14.
Some "latest" releases are not yet usable together.

## Decision

| Tool            | Version                                     | Why not the newest                                                                                                    |
| --------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Node.js         | 24 LTS (`.nvmrc`, `engines >=24.11 <25`)    | Node 26 is "Current", not LTS yet                                                                                     |
| pnpm            | 12.11.2 (`packageManager`)                  | —                                                                                                                     |
| Turborepo       | 2.11.8                                      | —                                                                                                                     |
| TypeScript      | 6.0.3                                       | TypeScript 7 (native compiler) is not supported by typescript-eslint (`<6.1`) or @nestjs/swagger (`^5.5 \|\| ^6`) yet |
| ESLint          | 9.39.5                                      | ESLint 10 breaks eslint-plugin-react / jsx-a11y / import used by Next.js lint rules                                   |
| Next.js / React | 16.4.0 / 19.3.1                             | —                                                                                                                     |
| NestJS          | 12.1.3 (ESM-only)                           | —                                                                                                                     |
| Prisma          | 7.10.0 + `@prisma/adapter-pg`               | npm `latest` tag points to `8.0.0-rc.22`, a release candidate — not stable                                            |
| Zod             | 4.6.7                                       | —                                                                                                                     |
| Vitest          | 5.0.4 (API uses SWC for decorator metadata) | —                                                                                                                     |
| Tailwind CSS    | 4.3.3                                       | —                                                                                                                     |
| PostgreSQL      | 18 (Docker / CI)                            | —                                                                                                                     |

Exact versions are pinned (no `^`) so CI and every session install the same
thing; Dependabot proposes updates weekly.

## Consequences

Re-check TypeScript 7, ESLint 10 and Prisma 8 at each phase start and upgrade
when the ecosystem supports them (record in a new ADR).
