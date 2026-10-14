# 0001 — Modular monolith

- Status: Accepted
- Date: 2026-10-14
- Source: docs/SPEC.md §6, §8

## Context

One small team (owner + Claude Code), web first, unknown traffic, limited hosting budget. Microservices add deployment, networking and consistency cost without current benefit.

## Decision

Build one NestJS API with explicit modules (config, auth, catalog, orders, …) and one Next.js web app, one PostgreSQL database. Modules communicate through services, never through each other's tables.

## Consequences

Simple deployment and transactions. Boundaries must be kept by discipline and review. Extracting a service later requires an ADR and a measured need.
