#!/usr/bin/env bash
# Proves a backup can be restored: decrypts it, restores into a throw-away
# PostgreSQL container (no network) and compares every table's row count with
# the counts taken when the backup was made. Never touches production data.
# Usage: restore-test.sh [backup-file | latest]
# shellcheck source=deploy/scripts/lib.sh
source "$(dirname "$0")/lib.sh"

file="${1:-latest}"
if [[ "$file" == "latest" ]]; then
  # Names embed the UTC time, so the last one in sort order is the newest.
  file="$(find "$BACKUP_DIR" -maxdepth 1 -name 'uzgo-*.tar.age' | sort | tail -n 1)"
fi
[[ -f "$file" ]] || { log "no backup found"; exit 2; }

work="$(mktemp -d)"
container="uzgo-restore-test-$$"
on_exit() {
  local code=$?
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$work"
  if [[ $code -ne 0 ]]; then alert "Restore test FAILED for $(basename "$file")"; fi
}
trap on_exit EXIT

age -d -i "$BACKUP_IDENTITY" "$file" | tar -C "$work" -xf -
tar -tf "$work/uploads.tar" >/dev/null

docker run -d --name "$container" --network none -e POSTGRES_USER=uzgo -e POSTGRES_DB=uzgo \
  -e POSTGRES_HOST_AUTH_METHOD=trust "${POSTGRES_IMAGE:-postgres:18-alpine}" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$container" pg_isready -U uzgo -d uzgo -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 1
done
docker exec -i "$container" pg_restore -U uzgo -d uzgo --no-owner --exit-on-error <"$work/db.dump"
docker exec "$container" psql -U uzgo -d uzgo -Atq -c "$COUNTS_SQL" >"$work/restored.txt"

if ! diff -u "$work/counts.txt" "$work/restored.txt"; then
  log "row counts differ"
  exit 1
fi
log "restore test OK: $(basename "$file") — $(wc -l <"$work/restored.txt") tables, $(tar -tf "$work/uploads.tar" | grep -vc '/$') upload files"
date -u +%s >"$BACKUP_DIR/last-restore-test"
