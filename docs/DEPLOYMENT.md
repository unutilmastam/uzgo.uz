# DEPLOYMENT (options — decision before Phase 7)

## What production needs
- Long-running Node.js processes: API (NestJS) and web (Next.js server).
- PostgreSQL (current stable major) with daily backups + point-in-time recovery if possible.
- S3-compatible object storage for product images (or MinIO on the same host at first).
- HTTPS reverse proxy (Caddy or Nginx) serving `/` → web and `/api` → API on one domain.
- Scheduled jobs (stock reservation release, cleanup) — inside the API process at first.
- Ability to run Docker images (preferred) or Node directly.
- Monitoring/uptime checks, log access, backups stored off the main server.
- Data residency: personal data likely must be in Uzbekistan (see `SECURITY.md`).

## Why cPanel shared hosting is unsuitable
cPanel shared hosting is built for PHP + MySQL sites. It typically cannot run
long-lived Node processes reliably (or only via limited Passenger setups),
does not offer PostgreSQL (or only old versions), has no Docker, no background
workers, tight CPU/RAM limits and no control over the reverse proxy. The
current hosting can still be used for the domain/DNS and email.

## Options

| Option | Pros | Cons |
|---|---|---|
| **A. VPS in an Uzbekistan data centre** (local hosting providers / UZ data centres) | Meets data-residency requirement; low latency for users; predictable cost; full control (Docker, PostgreSQL) | We operate the server ourselves (updates, backups, monitoring); quality and support vary; object storage may need self-hosted MinIO |
| **B. Managed cloud in Uzbekistan** (local cloud offers with managed DB/storage, if available) | Residency + less ops work; managed backups | Fewer providers, fewer managed services, pricing to compare |
| **C. Foreign cloud / PaaS** (EU or other region VPS/PaaS) | Mature tooling, managed PostgreSQL, easy deploys | Likely conflicts with personal-data residency law; higher latency; possible payment/billing issues from Uzbekistan |
| **D. Hybrid**: personal data (DB, backups, uploads) in Uzbekistan; static assets/CDN abroad | Residency for personal data + fast static delivery | More moving parts; must ensure no personal data leaves UZ |

**Current recommendation (to confirm with the owner and a lawyer):** Option A
or B — a VPS/managed cloud in Uzbekistan with Docker Compose (web, api,
postgres, caddy, optional minio), off-server encrypted backups inside
Uzbekistan. Re-evaluate before Phase 7.

## Sizing (starting point)
2–4 vCPU, 4–8 GB RAM, 80+ GB SSD for API + web + PostgreSQL on one server at
launch; separate DB server when traffic grows.

## Deployment model (target)
1. CI builds Docker images for `api` and `web` on `main`.
2. Images pushed to a registry; server pulls and runs `prisma migrate deploy`,
   then restarts containers (zero-downtime later).
3. Environments: `development` (local/cloud session), `staging` (optional),
   `production`.
4. Owner works from a phone: deployments must be triggerable from GitHub
   (Actions workflow), not from a local machine.

## Open decision
Hosting provider — **owner**, with legal check on data residency, **before Phase 7**.
