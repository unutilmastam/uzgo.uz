#!/usr/bin/env bash
# Restores PRODUCTION from a backup (disaster recovery). Overwrites the
# database and uploads. Takes a safety backup first. See docs/RUNBOOK.md.
# Usage: restore.sh <backup-file> --yes-overwrite-production
#   BACKUP_IDENTITY=<path to age key> to use the owner's offline key.
# shellcheck source=deploy/scripts/lib.sh
source "$(dirname "$0")/lib.sh"

file="${1:-}"
[[ -f "$file" && "${2:-}" == "--yes-overwrite-production" ]] || {
  log "usage: restore.sh <backup-file> --yes-overwrite-production"
  exit 2
}
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
age -d -i "$BACKUP_IDENTITY" "$file" | tar -C "$work" -xf -

compose up -d --wait postgres
if [[ "${SKIP_SAFETY_BACKUP:-0}" != "1" ]]; then "$UZGO_HOME/scripts/backup.sh" pre-restore; fi
log "stopping api and web"
compose stop api web

compose exec -T postgres psql -U uzgo -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'uzgo' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE uzgo;" -c "CREATE DATABASE uzgo OWNER uzgo;"
compose exec -T postgres pg_restore -U uzgo -d uzgo --no-owner --exit-on-error <"$work/db.dump"
ensure_app_role
compose exec -T postgres psql -U uzgo -d uzgo -Atq -c "$COUNTS_SQL" >"$work/restored.txt"
diff -u "$work/counts.txt" "$work/restored.txt" || { log "row counts differ — check before starting"; exit 1; }

docker run --rm --network none -v "${PROJECT}_uploads:/data/uploads" -i \
  --entrypoint sh "${POSTGRES_IMAGE:-postgres:18-alpine}" \
  -c 'find /data/uploads -mindepth 1 -delete && tar -C /data -xf - && chown -R 1000:1000 /data/uploads' <"$work/uploads.tar"

compose up -d --wait api web caddy
log "restore complete from $(basename "$file")"
alert "Production restored from $(basename "$file")"
