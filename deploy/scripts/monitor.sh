#!/usr/bin/env bash
# Host monitor, run every minute by cron (ADR 0020). Alerts on state changes
# only (failure and recovery) so a long outage does not flood the chat.
# shellcheck source=deploy/scripts/lib.sh
source "$(dirname "$0")/lib.sh"

state_dir="${MONITOR_STATE_DIR:-/var/lib/uzgo-monitor}"
mkdir -p "$state_dir"
domain="$(env_value "$UZGO_HOME/.env" UZGO_DOMAIN)"
problems=()

curl -fsS -m 10 -o /dev/null ${CURL_INSECURE:+-k} --resolve "$domain:443:127.0.0.1" "https://$domain/api/v1/health/ready" ||
  problems+=("API health check failed")
curl -fsS -m 20 -o /dev/null ${CURL_INSECURE:+-k} --resolve "$domain:443:127.0.0.1" "https://$domain/uz" ||
  problems+=("web page check failed")

unhealthy="$(docker ps --filter "label=com.docker.compose.project=$PROJECT" --filter health=unhealthy --format '{{.Names}}' | tr '\n' ' ')"
[[ -z "$unhealthy" ]] || problems+=("unhealthy containers: $unhealthy")

for mount in / /var/lib/docker; do
  [[ -d "$mount" ]] || continue
  used="$(df -P "$mount" | awk 'NR==2 {gsub("%", "", $5); print $5}')"
  ((used < 85)) || problems+=("disk $mount ${used}% full")
done

now="$(date -u +%s)"
last_backup="$(cat "$BACKUP_DIR/last-success" 2>/dev/null || echo 0)"
((now - last_backup < 26 * 3600)) || problems+=("no successful backup in 26 hours")
last_test="$(cat "$BACKUP_DIR/last-restore-test" 2>/dev/null || echo 0)"
((now - last_test < 8 * 86400)) || problems+=("no successful restore test in 8 days")

expiry="$(echo | timeout 10 openssl s_client -connect 127.0.0.1:443 -servername "$domain" 2>/dev/null |
  openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
if [[ -n "$expiry" ]]; then
  days=$((($(date -u -d "$expiry" +%s) - now) / 86400))
  ((days >= ${CERT_MIN_DAYS:-14})) || problems+=("TLS certificate expires in $days days")
else
  problems+=("cannot read the TLS certificate")
fi

current="ok"
((${#problems[@]} == 0)) || current="$(printf '%s; ' "${problems[@]}")"
previous="$(cat "$state_dir/state" 2>/dev/null || echo ok)"
if [[ "$current" != "$previous" ]]; then
  if [[ "$current" == "ok" ]]; then alert "RECOVERED: all checks pass"; else alert "PROBLEM: $current"; fi
fi
echo "$current" >"$state_dir/state"
[[ "$current" == "ok" ]] || { log "$current"; exit 1; }
