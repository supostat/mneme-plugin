#!/bin/sh

set -eu

if [ "${1:-}" = '--warm' ]; then
  exit 0
fi
if [ -n "${FIGURA_FAKE_LAUNCHER_LOG:-}" ]; then
  printf '%s\n' "$*" >>"$FIGURA_FAKE_LAUNCHER_LOG"
fi

source_file=''
output_file=''
for argument do
  source_file=$output_file
  output_file=$argument
done
printf '%s\n' "$@" >"$output_file.arguments"
table_count=$(grep -c 'shape: sql_table' "$source_file" || true)
if [ "$table_count" -gt 0 ]; then
  column_count=$(grep -cE '^[[:space:]]+"[^"]+": .*[^{]$' "$source_file" || true)
  height=$((15 * column_count + 60 * table_count))
  printf '<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 %s"><svg class="d2-fake d2-svg" width="320" height="%s" viewBox="0 0 320 %s"><text x="10" y="25" style="font-size:20px">fake table</text></svg></svg>\n' "$height" "$height" "$height" >"$output_file"
  exit 0
fi
broken_line=$(grep -n 'BROKEN' "$source_file" | head -n 1 | cut -d: -f1)
if [ -n "$broken_line" ]; then
  printf 'err: failed to compile %s: %s:%s:1: unexpected text after map key\n' "$source_file" "$source_file" "$broken_line" >&2
  exit 1
fi
printf '<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><svg class="d2-fake d2-svg" width="120" height="40" viewBox="0 0 120 40"><text x="10" y="25">fake diagram</text></svg></svg>\n' >"$output_file"
