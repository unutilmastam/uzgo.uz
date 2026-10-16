#!/usr/bin/env bash
# Makes an existing account (logged in at least once) the owner of a DEMO store,
# so the seller panel can be tried at once. Development database only.
# Usage: sotuvchi 901234567 [store-slug]   (default store: demo-elektronika)
set -euo pipefail
[[ $# -ge 1 ]] || { echo "Foydalanish: sotuvchi 901234567"; exit 1; }
phone=$1
[[ $phone == +* ]] || phone="+998${phone#998}"
slug=${2:-demo-elektronika}
[[ $phone =~ ^\+[0-9]{9,15}$ && $slug =~ ^[a-z0-9-]+$ ]] || { echo "Notoʻgʻri qiymat"; exit 1; }

export PGPASSWORD=uzgo_dev_password
q() { psql -h localhost -U uzgo -d uzgo -Atq -v ON_ERROR_STOP=1 -c "$1"; }

user_id=$(q "select id from \"User\" where phone = '$phone'")
[[ -n $user_id ]] || { echo "Avval saytga shu raqam bilan bir marta kiring."; exit 1; }
store_id=$(q "select id from \"Store\" where slug = '$slug'")
[[ -n $store_id ]] || { echo "Doʻkon topilmadi: $slug"; exit 1; }

q "insert into \"StoreMember\" (\"storeId\", \"userId\", role) values ('$store_id', '$user_id', 'OWNER') on conflict do nothing"
echo "Tayyor: $phone endi '$slug' doʻkoni egasi. Saytda /uz/seller sahifasini oching."
