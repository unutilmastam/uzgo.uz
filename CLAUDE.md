# CLAUDE.md — UZGO

This file is loaded automatically in every session. Keep it short. The full,
authoritative specification is `docs/SPEC.md` — read it before any change.

## What UZGO is
A multi-vendor marketplace for Uzbekistan (customers, sellers, admins), built as
the first module of a future UZGO ecosystem. Web first. Mobile later.

## How to work in this repo
1. Read `docs/SPEC.md`, `docs/ROADMAP.md`, and the docs for the area you touch.
2. Find the current phase in `docs/ROADMAP.md`. Work on that phase only.
3. Before editing: list the files you will change, a short plan, assumptions, risks.
4. Implement in small steps. Never build several phases at once.
5. After editing run, in order: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm build`. Report the real result of each command. Never claim a check
   passed if it did not run.
6. Update `docs/ROADMAP.md` (NOT STARTED / IN PROGRESS / BLOCKED / VERIFIED) and the
   relevant docs. Record significant decisions in `docs/decisions/NNNN-title.md`.
7. Commit with a clear message. Stop at the end of the phase and wait.

## Autopilot (owner does not copy prompts)
When the owner writes a short command such as **"davom et"**, **"boshla"**,
**"keyingi"**, "continue" or "next":
1. Open `docs/ROADMAP.md` and find the first phase that is not fully VERIFIED.
2. If that phase is IN PROGRESS or BLOCKED, finish or unblock it first.
3. Otherwise take that phase's prompt block from `docs/PROMPTS.md` and treat it
   as the owner's full instruction. Follow it exactly.
4. Do not show the plan and wait for approval — state the plan briefly in the
   report and proceed, unless the prompt explicitly says to wait (e.g. Phase 6
   provider choice, Phase 7 hosting choice) or a decision is irreversible.
5. Finish the whole phase: implement, run all checks, fix, update docs and
   ROADMAP, commit and push to `main`.
6. Report in Uzbek (Latin), short. End the report with one line:
   `Keyingi: Phase N — "davom et" deb yozing.`
7. Stop. One phase per command. Never run two phases in one go.

If the owner writes **"xato"** / **"tuzat"** with a description or CI error, use
the "Har qanday faza ichida xato bo'lsa" prompt from `docs/PROMPTS.md`.

## Owner's environment (important)
- The owner has **no computer**. He works from a phone/iPad and drives Claude Code
  in the cloud against this GitHub repo.
- Therefore **GitHub Actions CI is the source of truth** for lint/typecheck/test/build.
  Every phase must keep CI green.
- Docker may not be available in the cloud session. If it is not, install/start
  PostgreSQL directly in the session for local checks, or report clearly which
  checks only run in CI. Never fake results.
- The owner's current hosting is cPanel shared hosting. It **cannot** run this
  stack (Node API + PostgreSQL + background jobs). Production hosting is an open
  decision — see `docs/SPEC.md` §14.

## Hard rules
- Modular monolith. No microservices.
- Money: integer minor units (tiyin, `BigInt`) — never floats.
- All prices, totals, stock, permissions are decided on the server.
- No real secrets in git. `.env.example` has placeholders only.
- External providers (SMS, payments, maps, storage) live behind adapter
  interfaces. Mock adapters are clearly named `Dev*`/`Fake*` and never shown as real.
- Do not add a dependency without a one-line reason in the phase report.
- Use the **current stable versions** of tools; check them, do not rely on memory.
- Do not disable failing tests. Do not delete user data without asking.
- Communicate reports to the owner in **Uzbek (Latin)**, short and direct.
  Code, comments, docs and commit messages are in English.
