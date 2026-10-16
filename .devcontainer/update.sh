#!/usr/bin/env bash
# Pulls the latest code from GitHub, applies migrations, rebuilds and restarts.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
git pull --ff-only
pnpm install --frozen-lockfile
pnpm db:deploy
pnpm --recursive --workspace-concurrency=1 --filter "@uzgo/api..." --filter "@uzgo/web..." build
touch "$HOME/.uzgo-setup-done"
bash .devcontainer/start.sh
