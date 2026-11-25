#!/usr/bin/env bash
# Pokreće migracije (dvaput, radi provjere idempotentnosti) i SQL testove nad testnom bazom.
# Konekcija ide kroz standardne PG* varijable (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -f tests/sql/setup/supabase_stub.sql
for pass in 1 2; do
  for m in supabase/migrations/*.sql; do
    echo "migracija ($pass): $m"
    "${PSQL[@]}" -f "$m"
  done
done
for t in tests/sql/*.sql; do
  echo "test: $t"
  "${PSQL[@]}" -f "$t"
done

# Migracije se pokreću RUČNO i ne uvijek redom (na serveru su pokrenute 034, 038 bez 026; 033/037 su padale sa
# "function je_clan_drustva() does not exist"). Zato svaka migracija od 026 mora proći SAMA na bazi koja ima samo
# 001–025 (stanje servera prije probnog perioda), a 038/039 moraju ostaviti registraciju ispravnom.
BASE_DB="${PGDATABASE:-postgres}_osnova"
ONE_DB="${PGDATABASE:-postgres}_sama"
ADM=(psql -X -q -v ON_ERROR_STOP=1 -d postgres)
"${ADM[@]}" -c "drop database if exists $ONE_DB" -c "drop database if exists $BASE_DB" -c "create database $BASE_DB"
"${PSQL[@]}" -d "$BASE_DB" -f tests/sql/setup/supabase_stub.sql
for m in supabase/migrations/*.sql; do
  [ "$(basename "$m" | cut -c1-3)" -le 025 ] && "${PSQL[@]}" -d "$BASE_DB" -f "$m"
done
for m in supabase/migrations/*.sql; do
  n=$(basename "$m" | cut -c1-3)
  [ "$n" -le 025 ] && continue
  echo "migracija sama (bez 026–039): $m"
  "${ADM[@]}" -c "drop database if exists $ONE_DB" -c "create database $ONE_DB template $BASE_DB"
  "${PSQL[@]}" -d "$ONE_DB" -f "$m"
  if [ "$n" = 038 ] || [ "$n" = 039 ]; then
    "${PSQL[@]}" -d "$ONE_DB" -c "insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000aa01', 'red@t', '{\"ime\":\"A\",\"prezime\":\"B\",\"probni\":\"true\"}')"
    "${PSQL[@]}" -d "$ONE_DB" -c "do \$\$ begin assert (select probni_do is not null from public.korisnici where id = '00000000-0000-0000-0000-00000000aa01'), 'registracija bez 026'; end \$\$"
  fi
done
"${ADM[@]}" -c "drop database if exists $ONE_DB" -c "drop database if exists $BASE_DB"
echo "SQL testovi OK"
