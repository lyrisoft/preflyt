#!/bin/sh
set -eu
umask 077
if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo 'Usage: backup.sh output.dump [database-name]' >&2
  exit 2
fi
output=$1
database=${2:-preflyt}
case "$output" in /*) ;; *) output="$PWD/$output" ;; esac
case "$database" in ''|*[!a-z0-9_]*) echo 'Invalid database name' >&2; exit 2 ;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"
env_file=${PREFLYT_ENV_FILE:-.env}
if [ -z "${PREFLYT_ENV_FILE:-}" ] && [ ! -f "$env_file" ] && [ -f deploy/.env ]; then env_file=deploy/.env; fi
dc() { docker compose --env-file "$env_file" -f docker-compose.yaml "$@"; }
if [ -e "$output" ]; then echo 'Backup path already exists' >&2; exit 2; fi
mkdir -p -- "$(dirname -- "$output")"
temporary=$(mktemp "${output}.partial.XXXXXX")
trap 'rm -f -- "$temporary"' 0
dc exec -T db pg_dump -U preflyt_owner -d "$database" --format=custom > "$temporary"
test -s "$temporary"
# Hard-link publication refuses to overwrite an existing backup.
ln -- "$temporary" "$output"
echo "Backup saved: $output"
