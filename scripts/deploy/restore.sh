#!/bin/sh
set -eu
if [ "$#" -ne 2 ]; then
  echo 'Usage: restore.sh input.dump new-database-name' >&2
  exit 2
fi
input=$1
database=$2
case "$input" in /*) ;; *) input="$PWD/$input" ;; esac
test -s "$input"
case "$database" in preflyt_restore_*) ;; *) echo 'Use a new preflyt_restore_ database name' >&2; exit 2 ;; esac
case "$database" in *[!a-z0-9_]*) echo 'Invalid database name' >&2; exit 2 ;; esac
if [ "${#database}" -gt 63 ]; then echo 'Database name exceeds 63 characters' >&2; exit 2; fi
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"
env_file=${PREFLYT_ENV_FILE:-deploy/.env}
dc() { docker compose --env-file "$env_file" -f compose.yaml "$@"; }
# createdb fails if the destination exists: an existing database is never replaced.
dc exec -T db createdb -U preflyt_owner --maintenance-db=postgres "$database"
dc exec -T db pg_restore -U preflyt_owner -d "$database" --exit-on-error \
  --single-transaction --no-owner --no-privileges < "$input"
dc exec -T db psql -U preflyt_owner -d "$database" -v ON_ERROR_STOP=1 <<'SQL'
GRANT USAGE ON SCHEMA public TO preflyt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO preflyt_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO preflyt_app;
ALTER DEFAULT PRIVILEGES FOR ROLE preflyt_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO preflyt_app;
ALTER DEFAULT PRIVILEGES FOR ROLE preflyt_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO preflyt_app;
SQL
echo "Restored into $database; the original database is unchanged."
