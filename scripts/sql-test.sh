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

# Migracije se pokreću ručno i NE uvijek redom: na serveru je pokrenuta 038 bez 026, pa je registracija padala
# ("column probni_do does not exist"). Novija migracija koja dira registraciju mora raditi i kad starija fali.
RED_DB="${PGDATABASE:-postgres}_redoslijed"
psql -X -q -d postgres -c "drop database if exists $RED_DB" -c "create database $RED_DB"
RED=(psql -X -q -v ON_ERROR_STOP=1 -d "$RED_DB")
"${RED[@]}" -f tests/sql/setup/supabase_stub.sql
for m in supabase/migrations/*.sql; do
  n=$(basename "$m" | cut -c1-3)
  if [ "$n" -le 025 ] || [ "$n" = 038 ] || [ "$n" = 039 ]; then "${RED[@]}" -f "$m"; fi
done
"${RED[@]}" -c "insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000aa01', 'red@t', '{\"ime\":\"A\",\"prezime\":\"B\",\"probni\":\"true\"}')"
"${RED[@]}" -c "do \$\$ begin assert (select probni_do is not null from public.korisnici where id = '00000000-0000-0000-0000-00000000aa01'), 'registracija bez 026'; end \$\$"
psql -X -q -d postgres -c "drop database $RED_DB"
echo "SQL testovi OK"
