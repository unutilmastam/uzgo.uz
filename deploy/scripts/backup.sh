#!/usr/bin/env bash
# Encrypted backup of PostgreSQL + uploads, copied off-site (ADR 0020).
# Usage: backup.sh [label]   (label: daily | pre-deploy | manual)
# Output: $BACKUP_DIR/uzgo-<UTC time>-<label>.tar.age containing db.dump
# (pg_dump custom format, without grants: restore.sh re-applies the API role),
# uploads.tar and counts.txt (row counts taken in the same snapshot as the
# dump, used by restore-test.sh).
# shellcheck source=deploy/scripts/lib.sh
source "$(dirname "$0")/lib.sh"

label="${1:-manual}"
[[ "$label" =~ ^[a-z-]{1,20}$ ]] || { log "bad label"; exit 2; }
[[ -s "$BACKUP_RECIPIENTS" ]] || { log "missing $BACKUP_RECIPIENTS"; exit 2; }

name="uzgo-$(date -u +%Y%m%dT%H%M%SZ)-${label}.tar.age"
work="$(mktemp -d)"
on_exit() {
  local code=$?
  [[ -n "${psql_pid:-}" ]] && kill "$psql_pid" 2>/dev/null
  rm -rf "$work"
  if [[ $code -ne 0 ]]; then alert "Backup FAILED ($label), exit $code"; fi
}
trap on_exit EXIT
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Hold one read-only snapshot open so the dump and the row counts match.
mkfifo "$work/in" "$work/out"
compose exec -T postgres psql -U uzgo -d uzgo -Atq <"$work/in" >"$work/out" &
psql_pid=$!
exec 7>"$work/in" 8<"$work/out"
echo "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();" >&7
read -r -t 30 snapshot <&8
[[ "$snapshot" =~ ^[0-9A-F-]+$ ]] || { log "no snapshot"; exit 1; }

compose exec -T postgres pg_dump -U uzgo -d uzgo -Fc --no-owner --no-privileges --snapshot="$snapshot" >"$work/db.dump"
compose exec -T postgres psql -U uzgo -d uzgo -Atq -v ON_ERROR_STOP=1 \
  -c "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" \
  -c "SET TRANSACTION SNAPSHOT '$snapshot';" \
  -c "$COUNTS_SQL" -c "COMMIT;" >"$work/counts.txt"
echo "COMMIT;" >&7
exec 7>&- 8<&-
wait "$psql_pid" || true
psql_pid=""

docker run --rm --network none -v "${PROJECT}_uploads:/data/uploads:ro" \
  --entrypoint tar "${POSTGRES_IMAGE:-postgres:18-alpine}" -C /data -cf - uploads >"$work/uploads.tar"

tar -C "$work" -cf - db.dump uploads.tar counts.txt | age -R "$BACKUP_RECIPIENTS" >"$BACKUP_DIR/$name.part"
mv "$BACKUP_DIR/$name.part" "$BACKUP_DIR/$name"
log "backup written: $BACKUP_DIR/$name ($(du -h "$BACKUP_DIR/$name" | cut -f1), $(wc -l <"$work/counts.txt") tables)"

# Local retention: 7 days.
find "$BACKUP_DIR" -maxdepth 1 -name 'uzgo-*.tar.age' -mtime +7 -delete

# Off-site copy (another provider in Uzbekistan), e.g. RCLONE_REMOTE=uzbackup:uzgo
remote="$(env_value "$UZGO_HOME/.env" RCLONE_REMOTE)"
if [[ -n "$remote" ]]; then
  rclone copy "$BACKUP_DIR/$name" "$remote/daily/"
  if [[ "$(date -u +%d)" == "01" && "$label" == "daily" ]]; then
    rclone copy "$BACKUP_DIR/$name" "$remote/monthly/"
  fi
  rclone delete --min-age 30d "$remote/daily/"
  rclone delete --min-age 365d "$remote/monthly/"
  log "off-site copy done: $remote"
else
  log "WARNING: RCLONE_REMOTE not set, backup kept on this server only"
fi
date -u +%s >"$BACKUP_DIR/last-success"
