#!/usr/bin/env bash
# Writes apps/api/.env and apps/web/.env.local for the dev container.
# Idempotent: safe to run on every start. Development values only.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."

API_ENV=apps/api/.env
WEB_ENV=apps/web/.env.local

# Public origin of the site: the Codespaces forwarded URL, or localhost elsewhere.
# Lifecycle commands do not always get the Codespaces variables; the
# codespace keeps a copy of them in this file.
CS_VARS=/workspaces/.codespaces/shared/environment-variables.json
if [[ -z "${CODESPACE_NAME:-}" && -f $CS_VARS ]]; then
  CODESPACE_NAME=$(node -e 'const v=require(process.argv[1]); process.stdout.write(v.CODESPACE_NAME ?? "")' "$CS_VARS" 2>/dev/null || true)
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=$(node -e 'const v=require(process.argv[1]); process.stdout.write(v.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? "")' "$CS_VARS" 2>/dev/null || true)
fi
if [[ -n "${CODESPACE_NAME:-}" ]]; then
  SITE="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
else
  SITE="http://localhost:3000"
fi

set_kv() { # file key value — replace the line or append it
  local file=$1 key=$2 value=$3
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

[[ -f $API_ENV ]] || cp apps/api/.env.example "$API_ENV"
[[ -f $WEB_ENV ]] || cp apps/web/.env.example "$WEB_ENV"

# Random development secrets, generated once (placeholders are rejected by the API).
if grep -q '^AUTH_SECRET=replace-' "$API_ENV"; then
  set_kv "$API_ENV" AUTH_SECRET "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
fi
if grep -q '^TOTP_ENCRYPTION_KEY=replace-' "$API_ENV"; then
  set_kv "$API_ENV" TOTP_ENCRYPTION_KEY "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
fi

set_kv "$API_ENV" NODE_ENV development
set_kv "$API_ENV" CORS_ORIGINS "${SITE},http://localhost:3000"
set_kv "$API_ENV" WEB_PUBLIC_URL "$SITE"
# One tester behind one proxy: a little more room for OTP requests.
set_kv "$API_ENV" OTP_IP_HOURLY_LIMIT 100
# Demo convenience: staff need no authenticator app here. Refused in production.
set_kv "$API_ENV" STAFF_TOTP_REQUIRED false
# Demo assistant without an API key: deterministic answers marked [FAKE]. Refused in production.
set_kv "$API_ENV" ASSISTANT_PROVIDER fake

set_kv "$WEB_ENV" API_INTERNAL_URL http://localhost:4000
set_kv "$WEB_ENV" PUBLIC_SITE_URL "$SITE"
set_kv "$WEB_ENV" PUBLIC_INDEXING false

echo "[uzgo] site: $SITE"
