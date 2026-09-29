#!/bin/sh

set -eu

if [ "${1:-}" = '--version' ]; then
  echo 'psql (PostgreSQL) 16.4 (fake)'
  exit 0
fi

printf '%s\n' "$@" >"$FIGURA_FAKE_PSQL_CALL"
printf '%s\n' "${PGPASSWORD:-}" >"$FIGURA_FAKE_PSQL_CALL.password"
if [ -n "${FIGURA_FAKE_PSQL_FAILURE:-}" ]; then
  database=''
  previous=''
  for argument do
    if [ "$previous" = '-d' ]; then
      database=$argument
    fi
    previous=$argument
  done
  printf 'psql: error: connection to "%s" failed: FATAL:  password "%s" was rejected\n' "$database" "${PGPASSWORD:-}" >&2
  exit 2
fi
cat "$FIGURA_FAKE_PSQL_CATALOG"
