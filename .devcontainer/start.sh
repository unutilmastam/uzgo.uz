#!/usr/bin/env bash
# Starts (or restarts) the API and the web in the background.
# Logs: /tmp/uzgo-api.log and /tmp/uzgo-web.log. Development only.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
ROOT=$PWD

bash .devcontainer/env.sh

healthy() {
  curl -fs --max-time 10 http://localhost:4000/api/v1/health/ready >/dev/null &&
    curl -fs --max-time 30 -o /dev/null http://localhost:3000/uz
}

# --if-needed: leave already running servers alone (used when the editor opens).
# The editor task can start while the one-time setup (postCreate) still runs.
if [[ ! -f "$HOME/.uzgo-setup-done" ]]; then
  echo "[uzgo] o'rnatish davom etmoqda (taxminan 10 daqiqa), kuting..."
  until [[ -f "$HOME/.uzgo-setup-done" ]]; do sleep 5; done
fi

if [[ ${1:-} == --if-needed ]] && healthy; then
  echo "[uzgo] ready: API and web are already running"
  exit 0
fi

pkill -f 'node dist/main.js' 2>/dev/null || true
pkill -f 'next start' 2>/dev/null || true
sleep 1

until pg_isready -h localhost -U uzgo -d uzgo >/dev/null 2>&1; do sleep 1; done

# setsid + nohup: the processes must outlive this lifecycle command.
(cd "$ROOT/apps/api" && setsid nohup bash -c 'set -a; . ./.env; set +a; exec node dist/main.js' \
  >/tmp/uzgo-api.log 2>&1 &)
(cd "$ROOT/apps/web" && setsid nohup bash -c 'set -a; . ./.env.local; set +a; exec pnpm start' \
  >/tmp/uzgo-web.log 2>&1 &)

for _ in $(seq 1 90); do
  if healthy; then
    echo "[uzgo] ready: API and web are running"
    exit 0
  fi
  sleep 2
done
echo "[uzgo] not ready yet — see /tmp/uzgo-api.log and /tmp/uzgo-web.log" >&2
exit 1
