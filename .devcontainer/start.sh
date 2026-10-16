#!/usr/bin/env bash
# Starts (or restarts) the API and the web in the background.
# Logs: /tmp/uzgo-api.log and /tmp/uzgo-web.log. Development only.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
ROOT=$PWD

bash .devcontainer/env.sh

SITE=$(sed -n 's/^WEB_PUBLIC_URL=//p' apps/api/.env)

# Ready = API and web answer, and the API accepts requests from the site's
# public origin (an API still running with an old CORS_ORIGINS answers 403).
origin_ok() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST \
    -H "Origin: $SITE" -H 'content-type: application/json' -d '{}' \
    http://localhost:3000/api/v1/auth/otp/request)
  [[ $code != 403 && $code != 000 ]]
}
healthy() {
  curl -fs --max-time 10 http://localhost:4000/api/v1/health/ready >/dev/null &&
    curl -fs --max-time 30 -o /dev/null http://localhost:3000/uz &&
    origin_ok
}
port_busy() { curl -s -o /dev/null --max-time 2 "http://localhost:$1/"; }

# --if-needed: leave already running servers alone (used when the editor opens).
# The editor task can start while the one-time setup (postCreate) still runs.
# Codespaces created before the marker existed never wrote it: a finished
# build with no setup running counts as done.
MARKER="$HOME/.uzgo-setup-done"
setup_running() { pgrep -f '[.]devcontainer/setup[.]sh' >/dev/null; }
built() { [[ -f apps/api/dist/main.js && -f apps/web/.next/BUILD_ID ]]; }
setup_finished() { [[ -f $MARKER ]] || { built && ! setup_running; }; }
if ! setup_finished; then
  echo "[uzgo] o'rnatish davom etmoqda (taxminan 10 daqiqa), kuting..."
  until setup_finished; do sleep 5; done
fi
touch "$MARKER"

if [[ ${1:-} == --if-needed ]] && healthy; then
  echo "[uzgo] ready: API and web are already running"
  exit 0
fi

# Stop the old servers and wait until their ports are free: a new server that
# starts while the old one still holds the port exits, and the old one (with
# old settings) keeps answering. `next start` runs the server as next-server.
stop_servers() { pkill "$@" -f '[d]ist/main[.]js|[n]ext start|[n]ext-server' 2>/dev/null || true; }
stop_servers
for _ in $(seq 1 20); do
  port_busy 4000 || port_busy 3000 || break
  sleep 1
done
if port_busy 4000 || port_busy 3000; then
  stop_servers -9
  sleep 2
fi

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
