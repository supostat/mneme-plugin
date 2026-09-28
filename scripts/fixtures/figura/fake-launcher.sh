#!/bin/sh

set -eu

source_file=''
output_file=''
for argument do
  source_file=$output_file
  output_file=$argument
done
printf '%s\n' "$@" >"$output_file.arguments"
broken_line=$(grep -n 'BROKEN' "$source_file" | head -n 1 | cut -d: -f1)
if [ -n "$broken_line" ]; then
  printf 'err: failed to compile %s: %s:%s:1: unexpected text after map key\n' "$source_file" "$source_file" "$broken_line" >&2
  exit 1
fi
printf '<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><svg class="d2-fake d2-svg" width="120" height="40" viewBox="0 0 120 40"><text x="10" y="25">fake diagram</text></svg></svg>\n' >"$output_file"
