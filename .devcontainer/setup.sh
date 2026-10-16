#!/usr/bin/env bash
# Runs once when the codespace is created: tools, dependencies, database,
# demo data, production build of API and web. Development only.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."

echo "[uzgo] 1/6 tools"
sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client >/dev/null
corepack enable 2>/dev/null || sudo corepack enable 2>/dev/null ||
  npm install -g "$(node -p "require('./package.json').packageManager")"

echo "[uzgo] 2/6 dependencies"
corepack install 2>/dev/null || true
pnpm install --frozen-lockfile

echo "[uzgo] 3/6 environment"
bash .devcontainer/env.sh

echo "[uzgo] 4/6 database"
until pg_isready -h localhost -U uzgo -d uzgo >/dev/null 2>&1; do sleep 1; done
pnpm db:deploy

echo "[uzgo] 5/6 demo data (labelled DEMO, never for production)"
pnpm db:seed:demo

echo "[uzgo] 6/6 build"
pnpm --recursive --workspace-concurrency=1 --filter "@uzgo/api..." --filter "@uzgo/web..." build

# Short helper commands for any shell (see docs/CODESPACES.md).
for pair in kod:kod admin:admin sotuvchi:sotuvchi qayta:start yangila:update; do
  sudo ln -sf "$PWD/.devcontainer/${pair#*:}.sh" "/usr/local/bin/${pair%%:*}"
done

echo "[uzgo] setup done"
