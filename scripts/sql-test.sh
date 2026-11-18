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
echo "SQL testovi OK"
