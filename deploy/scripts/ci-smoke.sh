#!/usr/bin/env bash
# End-to-end check of the production stack on one machine (CI, ADR 0020):
# deploy.sh with locally built images → HTTPS through Caddy → backup →
# restore test → failed deploy rolls back → monitor passes → teardown.
# Usage: ci-smoke.sh <tag>   (images <registry>-{api,web,migrate}:<tag> must exist)
set -Eeuo pipefail

tag="${1:?usage: ci-smoke.sh <tag>}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
home="$(mktemp -d)"
export UZGO_HOME="$home" BACKUP_DIR="$home/backups" MONITOR_STATE_DIR="$home/monitor"
export COMPOSE_PROJECT_NAME="uzgo-smoke" CURL_INSECURE=1 CERT_MIN_DAYS=0
registry="${UZGO_REGISTRY:-uzgo-local}"

cp "$repo/deploy/compose.prod.yml" "$repo/deploy/Caddyfile" "$home/"
cp -r "$repo/deploy/scripts" "$home/scripts"
mkdir -p "$home/secrets"
age-keygen -o "$home/secrets/backup.key" 2>/dev/null
age-keygen -y "$home/secrets/backup.key" >"$home/secrets/backup-recipients.txt"

cat >"$home/.env" <<ENV
UZGO_DOMAIN=localhost
ACME_EMAIL=ops@example.uz
CADDY_TLS=tls internal
UZGO_REGISTRY=$registry
UZGO_TAG=
POSTGRES_PASSWORD=$(openssl rand -hex 24)
APP_DB_PASSWORD=$(openssl rand -hex 24)
INTERNAL_API_TOKEN=$(openssl rand -hex 32)
PUBLIC_INDEXING=false
ENV
cat >"$home/api.env" <<ENV
LOG_LEVEL=warn
AUTH_SECRET=$(openssl rand -hex 32)
TOTP_ENCRYPTION_KEY=$(openssl rand -base64 32)
STAFF_TOTP_REQUIRED=true
SMS_PROVIDER=eskiz
ESKIZ_EMAIL=smoke@example.uz
ESKIZ_PASSWORD=not-a-real-password
GEOCODER_CONTACT=smoke@example.uz
ENV

compose() { docker compose -p "$COMPOSE_PROJECT_NAME" -f "$home/compose.prod.yml" --env-file "$home/.env" "$@"; }
cleanup() {
  local code=$?
  if [[ $code -ne 0 ]]; then compose logs --no-color --tail 80 || true; fi
  compose --profile tools down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$home"
  exit "$code"
}
trap cleanup EXIT

step() { printf '\n==> %s\n' "$*"; }
get() { curl -fsS -k -m 20 "$@"; }

step "first install: deploy $tag"
SKIP_PULL=1 SKIP_BACKUP=1 "$home/scripts/deploy.sh" "$tag"
grep -q "^UZGO_TAG=$tag$" "$home/.env"

step "seed reference data (install-time step)"
UZGO_TAG="$tag" compose --profile tools run --rm migrate prisma db seed

step "HTTPS checks through Caddy"
headers="$(curl -fsS -k -D - -o /dev/null https://localhost/uz)"
grep -qi '^strict-transport-security: max-age=31536000' <<<"$headers"
grep -qi '^x-frame-options: DENY' <<<"$headers"
if grep -qiE '^(server|x-powered-by):' <<<"$headers"; then echo "server banner leaked" >&2; exit 1; fi
get https://localhost/api/v1/health/ready | grep -q '"database":"up"'
get https://localhost/api/v1/catalog/categories | grep -q '"slug"'
get https://localhost/robots.txt | grep -qi 'disallow: /'
get https://localhost/sitemap.xml >/dev/null
test "$(curl -s -k -o /dev/null -w '%{http_code}' https://localhost/api/v1/__test__/last-otp?phone=1)" = 404
test "$(curl -s -o /dev/null -w '%{http_code}' http://localhost/uz)" = 308
# The API's database role cannot rewrite history or the schema (ADR 0021).
app_url="postgresql://uzgo_app:$(grep '^APP_DB_PASSWORD=' "$home/.env" | cut -d= -f2)@127.0.0.1/uzgo"
compose exec -T postgres psql "$app_url" -Atc 'SELECT count(*) FROM "Region"' | grep -qE '^[1-9]'
for sql in 'TRUNCATE "AuditEvent"' 'ALTER TABLE "Order" DISABLE TRIGGER ALL' 'CREATE TABLE smoke (i int)'; do
  if compose exec -T postgres psql "$app_url" -c "$sql" >/dev/null 2>&1; then
    echo "API role was allowed: $sql" >&2
    exit 1
  fi
done
# The database publishes no ports.
test -z "$(docker port "$(compose ps -q postgres)")"

step "uploads volume is writable by the API (read-only root filesystem)"
compose exec -T api sh -c 'echo smoke >/data/uploads/smoke.txt'
if compose exec -T api sh -c 'touch /app/write-test' 2>/dev/null; then
  echo "API root filesystem is writable" >&2
  exit 1
fi

step "backup + restore test"
"$home/scripts/backup.sh" manual
"$home/scripts/restore-test.sh" latest 2>&1 | tee "$home/restore.txt"
grep -q '1 upload files' "$home/restore.txt"

step "disaster recovery: restore.sh brings back deleted data"
compose exec -T api rm /data/uploads/smoke.txt
compose exec -T postgres psql -U uzgo -d uzgo -c 'DELETE FROM "District";' >/dev/null
latest="$(find "$BACKUP_DIR" -name 'uzgo-*.tar.age' | sort | tail -n 1)"
SKIP_SAFETY_BACKUP=1 "$home/scripts/restore.sh" "$latest" --yes-overwrite-production
compose exec -T api cat /data/uploads/smoke.txt | grep -q smoke
test "$(compose exec -T postgres psql -U uzgo -d uzgo -Atc 'SELECT count(*) FROM "District";')" -gt 0
get https://localhost/api/v1/health/ready >/dev/null

step "broken release rolls back"
if SKIP_PULL=1 SKIP_BACKUP=1 "$home/scripts/deploy.sh" "missing-$tag"; then
  echo "deploy of a missing image unexpectedly succeeded" >&2
  exit 1
fi
grep -q "^UZGO_TAG=$tag$" "$home/.env"
get https://localhost/api/v1/health/ready >/dev/null

step "host monitor"
"$home/scripts/monitor.sh"
test "$(cat "$home/monitor/state")" = ok

step "stack smoke test passed"
