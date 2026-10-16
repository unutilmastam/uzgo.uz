# RUNBOOK — production operations

How to install, deploy, roll back, back up, restore and watch UZGO in
production. Architecture and reasons: `docs/decisions/0020-production-hosting.md`.
Everything day-to-day runs from GitHub (works from a phone). The one-time
server setup needs an SSH session: a phone SSH app (for example Termius), the
hosting provider's web console, or a hired system administrator.

## 0. What runs where

| Piece              | Where                                               | Notes                                                     |
| ------------------ | --------------------------------------------------- | --------------------------------------------------------- |
| `caddy`            | VPS, ports 80/443                                   | HTTPS (Let's Encrypt), `/api/*` → api, rest → web         |
| `web`              | VPS container                                       | Next.js standalone, read-only filesystem                  |
| `api`              | VPS container                                       | NestJS, background jobs inside                            |
| `postgres`         | VPS container, **no published port**                | Volume `uzgo_pgdata`                                      |
| uploads            | Volume `uzgo_uploads` (`/data/uploads`)             | Product images                                            |
| backups            | `/var/backups/uzgo` + off-site (`rclone`)           | Encrypted with `age`; 7 days local, 30 days + 12 monthly  |
| images             | GHCR `ghcr.io/<owner>/uzgo-{api,web,migrate}:<sha>` | Built by "Release images" after green CI                  |
| cron (`cron.uzgo`) | VPS host                                            | monitor every minute, backup nightly, restore test weekly |

## 1. One-time server setup

Server: Ubuntu 24.04 LTS (or newer LTS) in a Tashkent data centre, 4 vCPU,
8 GB RAM, 160 GB SSD, a public IPv4 address.

1. **Base hardening** (as root):
   ```sh
   apt update && apt -y full-upgrade
   apt -y install unattended-upgrades fail2ban ufw age rclone curl git
   dpkg-reconfigure -plow unattended-upgrades
   ufw default deny incoming && ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw enable
   ```
   SSH: keys only — in `/etc/ssh/sshd_config` set `PasswordAuthentication no`
   and `PermitRootLogin prohibit-password`, then `systemctl reload ssh`.
   Note: Docker publishes ports past ufw; only Caddy publishes any (80/443).
2. **Docker Engine + Compose plugin**: follow the official Docker install guide
   for Ubuntu (apt repository), then `docker run --rm hello-world`.
3. **Deploy user** (used by GitHub Actions):
   ```sh
   adduser --disabled-password --gecos "" deploy
   install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
   # put the PUBLIC key of a new key pair into /home/deploy/.ssh/authorized_keys
   echo 'deploy ALL=(root) NOPASSWD: /usr/bin/tar -x --strip-components=1 -C /opt/uzgo, /opt/uzgo/scripts/deploy.sh *' > /etc/sudoers.d/uzgo-deploy
   chmod 440 /etc/sudoers.d/uzgo-deploy
   ```
   The deploy key can run the deploy script as root, so treat it like a root
   key: keep it only in GitHub secrets, rotate it if in doubt.
4. **Files**:
   ```sh
   install -d -m 750 /opt/uzgo /opt/uzgo/scripts && install -d -m 700 /opt/uzgo/secrets /var/backups/uzgo
   install -d -m 755 /var/log/uzgo
   # copy from the repository: deploy/compose.prod.yml, deploy/Caddyfile, deploy/scripts/*
   cp env.example /opt/uzgo/.env && cp api.env.example /opt/uzgo/api.env
   chmod 600 /opt/uzgo/.env /opt/uzgo/api.env
   ```
   Fill `.env` and `api.env` (secrets: `openssl rand -hex 32`, TOTP key:
   `openssl rand -base64 32`). Keep a copy of both files in a password manager.
5. **Backup keys**:
   ```sh
   age-keygen -o /opt/uzgo/secrets/backup.key            # server key (restore test)
   age-keygen -y /opt/uzgo/secrets/backup.key > /opt/uzgo/secrets/backup-recipients.txt
   ```
   Create a second key pair **off the server** (owner's offline key, e.g. in a
   password manager) and append its public line (`age1…`) to
   `backup-recipients.txt`. Without the offline key, losing the server means
   losing the ability to decrypt off-site backups.
6. **Off-site storage**: create a bucket/SFTP account at a _different_
   provider in Uzbekistan, `rclone config` (as root) to define a remote, and set
   `RCLONE_REMOTE=<remote>:<bucket>/uzgo` in `/opt/uzgo/.env`.
7. **Cron and log rotation**: copy `deploy/cron.uzgo` to `/etc/cron.d/uzgo`
   and `deploy/logrotate.uzgo` to `/etc/logrotate.d/uzgo`.
8. **DNS**: A (and AAAA if any) records for `UZGO_DOMAIN` and `www.` → server
   IP. Caddy obtains certificates automatically once DNS points to the server.

## 2. GitHub setup (once, from the phone)

Repository → Settings:

- **Environments → New environment `production`**: add yourself as required
  reviewer (every deploy then needs one tap of approval).
- **Secrets (environment `production`)**: `DEPLOY_HOST` (server IP or name),
  `DEPLOY_USER` (`deploy`), `DEPLOY_SSH_KEY` (the private key from step 1.3),
  `DEPLOY_KNOWN_HOSTS` (output of `ssh-keyscan <server>` checked against the
  server's real fingerprint).
- Packages: after the first "Release images" run, the three GHCR packages
  inherit the repository's visibility; nothing else to do.

## 3. First install

1. Push to `main` and wait for **CI** and then **Release images** to finish green.
2. On the server: `cd /opt/uzgo && SKIP_BACKUP=1 scripts/deploy.sh <sha> ghcr.io/<owner>/uzgo <github-user>`
   (paste a GitHub token with `read:packages` when it waits for stdin) — or run
   the **Deploy** workflow once `.env` and secrets are in place.
3. Reference data (regions, districts, categories), **once**:
   `docker compose -p uzgo -f compose.prod.yml --env-file .env --profile tools run --rm migrate prisma db seed`
   Never re-run it later: it overwrites category names edited by admins.
4. First super admin: sign in on the site with the owner's phone, then
   `docker compose -p uzgo -f compose.prod.yml --env-file .env --profile tools run --rm migrate tsx scripts/grant-role.ts +998XXXXXXXXX SUPER_ADMIN`
   and enrol TOTP at `/uz/admin/security`.
5. Run `scripts/backup.sh manual` and `scripts/restore-test.sh latest` once
   by hand; both must print OK.

## 4. Deploy (every release)

GitHub app → **Actions → Deploy → Run workflow** (leave SHA empty for the
latest `main`, or paste a SHA) → approve the `production` environment.

The server then: takes a pre-deploy backup → `prisma migrate deploy` →
starts the new `api`/`web` → waits for health checks → checks
`https://<domain>/api/v1/health/ready` and `/uz` through Caddy → reloads the
Caddy config. If any step fails it **rolls back** to the previous images
automatically and sends a Telegram alert. History: `/opt/uzgo/deploy-history.log`.

**Migration rule**: migrations are forward-only and must keep the _previous_
release working (expand → migrate → contract). Never drop or rename a column
in the same release that stops using it.

## 5. Roll back by hand

Run **Deploy** with the previous good SHA (see `deploy-history.log` or the
Actions history). Images are kept in GHCR; the database is not rolled back
(see the migration rule). If a migration itself corrupted data, restore a
backup (section 7).

## 6. Backups

- Nightly at 02:30 Tashkent: `scripts/backup.sh daily` → `/var/backups/uzgo/uzgo-<UTC>-daily.tar.age`
  (pg_dump custom format + uploads + row counts from the same snapshot),
  copied off-site with `rclone`. Also before every deploy (`pre-deploy`).
- Weekly restore test (Sunday 05:00): `scripts/restore-test.sh latest`
  restores into a throw-away PostgreSQL container without network and compares
  every table's row count. CI runs the same test on every push.
- The monitor alerts if there was no successful backup in 26 hours or no
  successful restore test in 8 days.

## 7. Restore (disaster recovery)

Same server (data loss or bad migration):

```sh
cd /opt/uzgo && scripts/restore.sh /var/backups/uzgo/<file>.tar.age --yes-overwrite-production
```

It takes a safety backup first, stops api/web, recreates the database,
restores it and the uploads, checks row counts and starts the apps again.

New server (old one lost): do section 1 (use the saved `.env`/`api.env`),
`rclone copy <remote>/daily/<file> /var/backups/uzgo/`, then restore with the
owner's offline key: `BACKUP_IDENTITY=/path/to/offline.key scripts/restore.sh …`,
deploy the last good SHA, point DNS to the new server.

## 8. Monitoring and alerts

- Telegram: create a bot with @BotFather, create a private ops group, add the
  bot, put `TELEGRAM_BOT_TOKEN` and `ALERT_TELEGRAM_CHAT_ID` (the group id,
  negative number) into `api.env`. The API reports unhandled 5xx errors and
  failing background jobs (throttled, no personal data); the host monitor
  reports health, disk > 85 %, backup age, restore-test age and certificate
  expiry — on failure and on recovery.
- Add a free external uptime check on `https://<domain>/api/v1/health/ready`
  (it alerts when the whole server is down, which the server cannot report).
- Logs: `docker compose -p uzgo -f compose.prod.yml logs --tail 200 api`
  (JSON; request ids match the `requestId` users see in errors). Rotation: 20 MB
  × 5 per container; Caddy access logs 14 days; script logs 8 weeks.

## 9. Incidents (short checklist)

1. Check Telegram alerts and `scripts/monitor.sh` output.
2. `docker compose -p uzgo -f compose.prod.yml ps` — any container unhealthy?
3. Bad release → section 5. Data problem → section 7.
4. Suspected breach: rotate `AUTH_SECRET` (logs everyone out), `INTERNAL_API_TOKEN`,
   payment keys (in the Payme/Click cabinets), Eskiz password, deploy key;
   review `/uz/admin/audit`; keep logs; inform users as the law requires.

## 9a. UZGO Food operations (ADR 0024)

- Restaurants: `/uz/admin/restaurants` → add (owner phone must have signed in
  once), point on the map (lat/lng), delivery mode, hours, then the menu.
- Couriers: `/uz/admin/couriers` → add by phone (the person signed in once).
  The courier opens "Kuryer rejimi" in the app cabinet.
- Courier cash: the list shows each balance (positive = cash the courier owes
  UZGO, negative = fee UZGO owes the courier). Record every hand-over or
  payout as a settlement; it cannot be edited or deleted.
- Tariffs: `FOOD_COURIER_BASE_TIYIN`, `FOOD_COURIER_PER_KM_TIYIN`,
  `FOOD_OFFER_RADIUS_KM`, `FOOD_ACCEPT_TIMEOUT_MINUTES` in `api.env`.
- Maps: `GEOCODER_CONTACT` (an e-mail) is required in production by the
  OpenStreetMap Nominatim usage policy; for heavy traffic run an own
  Nominatim and set `NOMINATIM_URL`.

## 9b. UZGO Go operations (ADR 0025)

- Driver applications: `/uz/admin/drivers` (waiting ones first). Check the
  driver licence, car documents and the person (in person or video call),
  then approve with the right class, or reject with a note the driver sees.
- Suspend a driver from the same page (they go offline at once).
- Driver money: balance positive = UZGO owes the driver (online rides);
  negative = the driver owes UZGO commission (cash rides). Record every
  hand-over or payout as a settlement; it cannot be edited or deleted.
- Rides: `/uz/admin/rides`; cancel an open ride with a reason (a paid ride
  is refunded in full — Payme/Click refunds appear under Finance → refunds).
- Tariffs and rules in `api.env`: `RIDE_ECONOMY_*`, `RIDE_COMFORT_*`,
  `RIDE_COMMISSION_BP`, `RIDE_MAX_KM`, `RIDE_OFFER_RADIUS_KM`,
  `RIDE_SEARCH_TIMEOUT_MINUTES`. Online payment for rides needs
  `RIDE_MXIK_CODE`, `RIDE_PACKAGE_CODE` and `RIDE_VAT_PERCENT` from the
  accountant; without them only cash is accepted.

## 9c. Assistant operations (ADR 0026)

- Turn on: create an API key in the Anthropic console (set a monthly spend
  limit there too), put it into `api.env` as `ANTHROPIC_API_KEY`, redeploy.
  Turn off: remove the key and redeploy (clients hide the assistant).
- Limits in `api.env`: `ASSISTANT_DAILY_LIMIT` (per user per day),
  `ASSISTANT_MONTHLY_TOKEN_BUDGET` (all users; 0 = off), `ASSISTANT_MODEL`,
  `ASSISTANT_EFFORT`.
- Usage per day: `SELECT day, sum(messages), sum("inputTokens"),
sum("outputTokens") FROM "AssistantUsage" GROUP BY day ORDER BY day DESC;`
- Provider failures raise a Telegram alert (`assistant`); users see "try
  later" and keep their daily messages.

## 10. Go-live checklist

- [ ] Lawyer reviewed `/info/terms` and `/info/privacy`; operator details filled
      in `apps/web/src/content/legal.ts`; data-residency confirmed.
- [ ] Domain bought, DNS set, `UZGO_DOMAIN` set, HTTPS works.
- [ ] Eskiz account active, sender name and SMS templates approved.
- [ ] Payme and Click merchant contracts; callback URLs registered
      (`/api/v1/payments/payme`, `/api/v1/payments/click/prepare|complete`);
      test transactions done in their sandboxes; production keys set.
- [ ] Telegram ops chat receives a test alert; external uptime check active.
- [ ] Backup + off-site copy + restore test OK; offline key stored safely.
- [ ] Super admin enrolled with TOTP; `STAFF_TOTP_REQUIRED=true`.
- [ ] UZGO Go: lawyer confirmed taxi licensing rules and the driver terms;
      accountant set `RIDE_MXIK_CODE` / `RIDE_PACKAGE_CODE` / `RIDE_VAT_PERCENT`.
- [ ] Assistant: Anthropic API reachable from the server, key and console
      spend limit set; lawyer confirmed the AI data transfer text.
- [ ] `PUBLIC_INDEXING=true` only on launch day.
