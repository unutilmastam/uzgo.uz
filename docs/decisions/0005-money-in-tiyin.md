# 0005 — Money as BigInt tiyin

- Status: Accepted
- Date: 2026-10-14
- Source: docs/SPEC.md §3, §13

## Context
Floating point money causes rounding errors. Local payment providers report amounts in tiyin.

## Decision
All money is stored and computed as integer tiyin (1 soʻm = 100 tiyin) using BigInt in the database and code. In JSON it is sent as a string. Display formatting happens only in the UI.

## Consequences
No rounding errors; JSON BigInt handling must be explicit. Currency is UZS only; multi-currency would need a new ADR.
