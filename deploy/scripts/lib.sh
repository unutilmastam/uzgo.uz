#!/usr/bin/env bash
# Shared helpers for the UZGO operations scripts (ADR 0020, docs/RUNBOOK.md).
# Layout on the server: /opt/uzgo/{compose.prod.yml,Caddyfile,.env,api.env,scripts/}.
set -Eeuo pipefail

UZGO_HOME="${UZGO_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/uzgo}"
# age public keys (one per line): the server key + the owner's offline key.
BACKUP_RECIPIENTS="${BACKUP_RECIPIENTS:-$UZGO_HOME/secrets/backup-recipients.txt}"
# age private key of the server (restore test, normal restores). root:root 600.
BACKUP_IDENTITY="${BACKUP_IDENTITY:-$UZGO_HOME/secrets/backup.key}"
PROJECT="${COMPOSE_PROJECT_NAME:-uzgo}"

cd "$UZGO_HOME"

compose() {
  docker compose -p "$PROJECT" -f "$UZGO_HOME/compose.prod.yml" --env-file "$UZGO_HOME/.env" "$@"
}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

# Reads KEY=value from an env file without executing it.
env_value() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  { grep -E "^${key}=" "$file" || true; } | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

# Operator alert to the ops Telegram chat (no-op when not configured).
alert() {
  local token chat
  token="$(env_value "$UZGO_HOME/api.env" TELEGRAM_BOT_TOKEN)"
  chat="$(env_value "$UZGO_HOME/api.env" ALERT_TELEGRAM_CHAT_ID)"
  log "ALERT: $*"
  [[ -n "$token" && -n "$chat" ]] || return 0
  curl -fsS -m 10 -o /dev/null "https://api.telegram.org/bot${token}/sendMessage" \
    --data-urlencode "chat_id=${chat}" \
    --data-urlencode "text=[UZGO ops] $*" || log "alert not sent"
}

# Exact row count of every table, in one snapshot when $1 is a snapshot id.
# shellcheck disable=SC2034 # used by the scripts that source this file
COUNTS_SQL="SELECT table_name || '=' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
