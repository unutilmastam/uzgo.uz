#!/usr/bin/env bash
# Makes an existing account (logged in at least once) a super admin. Dev only.
# Usage: admin 901234567   or   admin +998901234567
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
[[ $# -eq 1 ]] || { echo "Foydalanish: admin 901234567"; exit 1; }
phone=$1
[[ $phone == +* ]] || phone="+998${phone#998}"
pnpm --silent --filter @uzgo/api user:grant-role "$phone" SUPER_ADMIN
echo "Tayyor: $phone endi admin. Saytda /uz/admin sahifasini oching (sahifani yangilang)."
