#!/usr/bin/env bash
# Restore a dump into the running `db` container.
# Usage: scripts/restore_db.sh backups/stock_YYYYMMDD_HHMMSS.sql.gz
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path-to-dump.sql[.gz]>" >&2
  exit 1
fi

FILE="$1"
if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "This will OVERWRITE the current database with: $FILE"
read -r -p "Type YES to continue: " CONFIRM
[ "$CONFIRM" = "YES" ] || { echo "Aborted."; exit 1; }

# Stop backend so no connections interfere with the restore
docker-compose stop backend >/dev/null

CAT_CMD="cat"
case "$FILE" in
  *.gz) CAT_CMD="gunzip -c" ;;
esac

$CAT_CMD "$FILE" | docker-compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'

docker-compose start backend >/dev/null
echo "Restore complete."
