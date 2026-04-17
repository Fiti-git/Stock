#!/usr/bin/env bash
# Dump the Postgres DB from the running `db` container to backups/<timestamp>.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p backups
STAMP=$(date +%Y%m%d_%H%M%S)
OUT="backups/stock_${STAMP}.sql.gz"

docker-compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  | gzip > "$OUT"

echo "Backup written: $OUT"
ls -lh "$OUT"
