#!/usr/bin/env bash
# Deploys one release (images tagged with a commit SHA) and rolls back the
# application images if the new release does not become healthy (ADR 0020).
# Usage: deploy.sh <commit-sha> [registry] [registry-user]
#   With registry-user, a registry token is read from stdin for a short-lived
#   `docker login` (logged out again when the script ends).
#   SKIP_PULL=1    use images already on this host (CI smoke test)
#   SKIP_BACKUP=1  no pre-deploy backup (first install only)
# Migrations are forward-only: every migration must work with the previous
# release too (expand → migrate → contract), so an image rollback is safe.
# shellcheck source=deploy/scripts/lib.sh
source "$(dirname "$0")/lib.sh"

tag="${1:-}"
[[ "$tag" =~ ^[0-9a-f]{7,40}$|^[a-z0-9][a-z0-9._-]{0,63}$ ]] || { log "usage: deploy.sh <commit-sha>"; exit 2; }
previous="$(env_value "$UZGO_HOME/.env" UZGO_TAG)"
domain="$(env_value "$UZGO_HOME/.env" UZGO_DOMAIN)"
exec 9>"$UZGO_HOME/.deploy.lock"
flock -n 9 || { log "another deploy is running"; exit 3; }

set_tag() { sed -i -e "s/^UZGO_TAG=.*/UZGO_TAG=$1/" "$UZGO_HOME/.env"; }

registry="${2:-}"
registry_user="${3:-}"
if [[ -n "$registry" ]]; then
  [[ "$registry" =~ ^[a-z0-9.-]+(/[a-z0-9._-]+)+$ ]] || { log "bad registry"; exit 2; }
  sed -i -e "s#^UZGO_REGISTRY=.*#UZGO_REGISTRY=$registry#" "$UZGO_HOME/.env"
fi
if [[ -n "$registry_user" ]]; then
  docker login "${registry%%/*}" -u "$registry_user" --password-stdin >/dev/null
  trap 'docker logout "${registry%%/*}" >/dev/null 2>&1 || true' EXIT
fi

smoke() {
  # Through Caddy on this host, so TLS, routing and both apps are exercised.
  curl -fsS -m 10 -o /dev/null ${CURL_INSECURE:+-k} --resolve "$domain:443:127.0.0.1" "https://$domain/api/v1/health/ready" &&
    curl -fsS -m 20 -o /dev/null ${CURL_INSECURE:+-k} --resolve "$domain:443:127.0.0.1" "https://$domain/uz"
}

rollback() {
  alert "Deploy of $tag FAILED: $1. Rolling back to ${previous:-nothing}."
  if [[ -n "$previous" && "$previous" != "$tag" ]]; then
    export UZGO_TAG="$previous"
    set_tag "$previous"
    compose up -d --wait --wait-timeout 180 api web caddy || alert "ROLLBACK to $previous FAILED — manual action needed (RUNBOOK)"
  fi
  exit 1
}

log "deploying $tag (previous: ${previous:-none})"
export UZGO_TAG="$tag"
if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  compose --profile tools pull api web migrate || { alert "Deploy of $tag: image pull failed"; exit 1; }
fi

compose up -d --wait --wait-timeout 120 postgres
if [[ -n "$previous" && "${SKIP_BACKUP:-0}" != "1" ]]; then
  "$UZGO_HOME/scripts/backup.sh" pre-deploy
fi

compose --profile tools run --rm migrate || rollback "migration failed"
ensure_app_role || rollback "database role setup failed"
compose up -d --wait --wait-timeout 180 api web caddy || rollback "containers not healthy"
# Pick up Caddyfile changes shipped with this release (invalid config keeps the old one).
compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || alert "Caddy reload failed for $tag (old proxy config still active)"
for _ in $(seq 1 10); do smoke && break; sleep 3; done
smoke || rollback "smoke check failed"

set_tag "$tag"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $tag (previous ${previous:-none})" >>"$UZGO_HOME/deploy-history.log"
docker image prune -f --filter "until=168h" >/dev/null || true
log "deployed $tag"
