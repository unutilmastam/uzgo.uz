#!/usr/bin/env bash
# Prints the most recent login codes sent by the development SMS provider.
set -euo pipefail
codes=$(grep -a '\[DEV SMS\]' /tmp/uzgo-api.log 2>/dev/null | tail -n 3 || true)
if [[ -z $codes ]]; then
  echo "Hali kod yuborilmagan. Saytda telefon raqamini kiriting va 'Kodni olish' ni bosing."
else
  echo "$codes"
fi
