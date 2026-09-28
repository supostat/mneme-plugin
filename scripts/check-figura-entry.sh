#!/bin/sh
#
# Gate for figura/bin/figura: without Node.js 22 or newer the entry stops with the named error and
# the install recipe; with it the entry hands the command to the figura CLI.

set -u

repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
entry="$repo_root/figura/bin/figura"
manifest="$repo_root/figura/.claude-plugin/plugin.json"
node_missing_line='figura: error: node 22+ not found — install Node.js 22 or newer (https://nodejs.org)'
failures=0

say_fail() {
  printf 'check-figura-entry: FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

tmp_root=$(mktemp -d)
trap 'rm -rf "$tmp_root"' EXIT

base_tools="$tmp_root/base-tools"
mkdir -p "$base_tools"
ln -s "$(command -v dirname)" "$base_tools/dirname"

expect_node_refusal() {
  scenario="$1"
  search_path="$2"
  if PATH="$search_path" "$entry" version >/dev/null 2>"$tmp_root/$scenario.stderr"; then
    say_fail "$scenario: the entry exited 0"
  fi
  refusal=$(cat "$tmp_root/$scenario.stderr")
  [ "$refusal" = "$node_missing_line" ] || say_fail "$scenario: expected '$node_missing_line', got '$refusal'"
}

expect_node_refusal no-node "$base_tools"

node_20_dir="$tmp_root/node-20"
mkdir -p "$node_20_dir"
printf '#!/bin/sh\necho 20.11.1\n' >"$node_20_dir/node"
chmod +x "$node_20_dir/node"
expect_node_refusal node-20 "$node_20_dir:$base_tools"

expected_version_line=$(node -p 'const manifest = require(process.argv[1]); manifest.name + " " + manifest.version' "$manifest")
version_line=$("$entry" version 2>&1) || say_fail "node 22+: 'figura version' exited non-zero: $version_line"
[ "$version_line" = "$expected_version_line" ] || say_fail "node 22+: expected '$expected_version_line', got '$version_line'"

"$entry" no-such-command >/dev/null 2>"$tmp_root/unknown-command.stderr"
unknown_command_status=$?
[ "$unknown_command_status" -eq 2 ] || say_fail "unknown command: exit $unknown_command_status, expected 2"
grep -q '^usage: figura <command>' "$tmp_root/unknown-command.stderr" || say_fail 'unknown command: stderr carries no usage line'

if [ "$failures" -gt 0 ]; then
  printf 'check-figura-entry: %d failure(s)\n' "$failures" >&2
  exit 1
fi
printf 'check-figura-entry: the entry refuses without node 22+ and runs the CLI with it.\n'
