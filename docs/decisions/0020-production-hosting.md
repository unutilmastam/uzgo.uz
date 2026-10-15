# 0020 — Production hosting: Tashkent VPS with Docker Compose

- Status: Accepted (owner, Phase 7)
- Date: 2026-10-15
- Builds on: 0007 (same-site API), 0008 (CI is the source of truth), 0011 (security baseline)

## Context

cPanel shared hosting cannot run the stack (DEPLOYMENT.md). Personal data
should stay in Uzbekistan (SECURITY.md, legal check pending). The owner has
no computer: everything must be operable from GitHub on a phone. The final
domain is not bought yet.

## Decision

- **One VPS in a Tashkent data centre** (Ubuntu LTS, 4 vCPU / 8 GB RAM /
  160 GB SSD to start) runs everything with **Docker Compose**
  (`deploy/compose.prod.yml`): `caddy` → `web` (Next.js standalone) and `api`
  (NestJS), `postgres` (PostgreSQL 18), plus a one-shot `migrate` service.
  PostgreSQL is not published to the network; only Caddy listens on 80/443.
- **Caddy** terminates HTTPS with automatic Let's Encrypt certificates and
  HSTS. The **domain is a variable** (`UZGO_DOMAIN`): changing it is an env
  change plus DNS, no code change. Caddy routes `/api/*` to the API and
  everything else to the web server (ADR 0007).
- **Images** are built by GitHub Actions and pushed to GHCR, tagged with the
  commit SHA. Base images are pinned by digest. Containers run as a non-root
  user with a read-only root filesystem, no Linux capabilities and
  `no-new-privileges`.
- **Migrations on deploy**: `deploy/scripts/deploy.sh <sha>` takes a backup,
  runs `prisma migrate deploy` from the `migrate` image, starts the new
  images, waits for health checks and rolls back to the previous images if
  they fail. Migrations are forward-only, so every migration must be
  backward compatible with the previous release (expand → migrate → contract).
  Reference data is seeded once at install, not on every deploy (the seed
  would overwrite categories edited by admins).
- **Uploads** stay on a Docker volume (`LocalDiskStorage`, absolute path
  enforced in production). Object storage (S3/MinIO) is a later change behind
  the same `StorageProvider` adapter when a second server is needed.
- **Backups**: nightly `pg_dump` (custom format) + uploads archive, encrypted
  with `age` to a public key (the private key is kept offline by the owner),
  copied off the server with `rclone` to storage at a **different provider in
  Uzbekistan**. Retention: 7 days on the server, 30 daily + 12 monthly
  off-site. A weekly automated restore test restores the latest backup into a
  throw-away PostgreSQL container and compares row counts; the same test runs
  in CI on every push.
- **Monitoring**: container health checks with automatic restart; a
  one-minute host monitor (`deploy/scripts/monitor.sh`) checks HTTPS health,
  disk space, backup age and certificate expiry; operator alerts (5xx errors,
  failing background jobs, monitor failures) go to an ops Telegram chat
  (`ALERT_TELEGRAM_CHAT_ID`), throttled and without personal data. An external
  uptime check (any free service) watches the server itself.
- **Logs**: JSON logs to stdout, Docker `json-file` rotation (20 MB × 5 per
  container); Caddy access logs rotate daily-ish (50 MB, kept 14 days). No
  request bodies, cookies or tokens are logged (pino redaction, Caddy
  redacts credentials by default).
- **SMS**: Eskiz.uz adapter (`SMS_PROVIDER=eskiz`); message texts must be
  approved in the Eskiz cabinet before launch.

## Consequences

- Single server = single point of failure; acceptable at launch with tested
  backups and a written restore runbook (`docs/RUNBOOK.md`). Next steps when
  traffic grows: managed/separate PostgreSQL with point-in-time recovery,
  object storage, second app server behind the proxy.
- The operator must keep the OS patched (unattended-upgrades) and SSH
  key-only (runbook).
- Container builds and the stack smoke test run in GitHub Actions (the cloud
  session's network blocks Docker Hub; a mirror was used for local checks).
