#!/bin/sh

set -eu

if [ "${1:-}" = '-v' ]; then
  echo 'pdftoppm version 24.02.0 (fake)' >&2
  exit 0
fi

pdf_file=''
output_prefix=''
for argument do
  pdf_file=$output_prefix
  output_prefix=$argument
done
page_count=$(grep -c '/Type /Page /Parent' "$pdf_file")
page=1
while [ "$page" -le "$page_count" ]; do
  printf 'fake png of page %s\n' "$page" >"$output_prefix-$page.png"
  page=$((page + 1))
done
