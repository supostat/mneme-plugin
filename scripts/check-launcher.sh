#!/bin/sh
#
# Gate for plugin/bin/launch.sh: fourteen behavioural scenarios run against
# fixtures in a temporary directory (mocked curl / sha tools / uname) — the
# five resolution paths (dev, cache-hit, download, mismatch, platform), argv
# forwarding to the binary in dev and cache-hit mode, --warm in dev,
# cache-fill and no-pin mode (exit 0, never an exec), the sweep of temp files
# left by dead launchers (never blocking a start), and a download interrupted
# by TERM or HUP (INT cannot be sent: an asynchronous list ignores SIGINT) —
# plus the git-ignore
# regression check: the old `bin/` ignore pattern silently dropped the
# launcher from the bundle, and must never come back.
#
# Usage: sh scripts/check-launcher.sh   (exit 0 = all scenarios green)

set -u

repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
launcher="$repo_root/plugin/bin/launch.sh"
failures=0

say_fail() {
  printf 'check-launcher: FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

tmp_root=$(mktemp -d)
trap 'rm -rf "$tmp_root"' EXIT

# Compute the platform target exactly as the launcher does.
case "$(uname -s)" in
  Darwin) os_slug='darwin' ;;
  Linux) os_slug='linux' ;;
  *)
    printf 'check-launcher: unsupported fixture host: %s\n' "$(uname -s)" >&2
    exit 1
    ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch_slug='arm64' ;;
  x86_64 | amd64) arch_slug='x64' ;;
  *)
    printf 'check-launcher: unsupported fixture host arch: %s\n' "$(uname -m)" >&2
    exit 1
    ;;
esac
target="${os_slug}-${arch_slug}"

scenario_dir() {
  dir="$tmp_root/$1"
  mkdir -p "$dir/plugin/bin" "$dir/mockbin" "$dir/home"
  cp "$launcher" "$dir/plugin/bin/launch.sh"
  chmod +x "$dir/plugin/bin/launch.sh"
  printf '%s' "$dir"
}

# The fake binary echoes its token and, when given any, its argv — so argv
# forwarding is observable while the no-argv assertions keep their exact token.
write_fake_binary() {
  # shellcheck disable=SC2016 -- the ${1:+ }$* must reach the generated script unexpanded
  printf '#!/bin/sh\necho "%s${1:+ }$*"\n' "$2" >"$1"
  chmod +x "$1"
}

write_mock_curl() {
  cat >"$1/curl" <<'EOF'
#!/bin/sh
out=''
while [ $# -gt 0 ]; do
  if [ "$1" = '-o' ]; then
    out="$2"
    shift
  fi
  shift
done
printf 'called\n' >>"$(dirname "$0")/curl.log"
[ -n "$out" ] || exit 2
printf '#!/bin/sh\necho DOWNLOAD-OK\n' >"$out"
EOF
  chmod +x "$1/curl"
}

write_slow_curl() {
  cat >"$1/curl" <<'EOF'
#!/bin/sh
out=''
while [ $# -gt 0 ]; do
  if [ "$1" = '-o' ]; then
    out="$2"
    shift
  fi
  shift
done
printf 'partial' >"$out"
printf '%s' "$$" >"$(dirname "$0")/curl.pid"
exec sleep 30
EOF
  chmod +x "$1/curl"
}

wait_for_file() {
  ticks=0
  while [ ! -e "$1" ] && [ "$ticks" -lt 50 ]; do
    sleep 0.1
    ticks=$((ticks + 1))
  done
  [ -e "$1" ]
}

write_mock_sha() {
  for name in shasum sha256sum; do
    cat >"$1/$name" <<EOF
#!/bin/sh
printf '%s  mocked\n' '$2'
EOF
    chmod +x "$1/$name"
  done
}

write_pin() {
  cat >"$1/release.json" <<EOF
{
  "engine_version": "9.9.9",
  "plugin_version": "0.0.0",
  "base_url": "https://example.invalid/release",
  "sha256": {
    "$target": "$2"
  }
}
EOF
}

run_launcher() {
  dir="$1"
  shift
  HOME="$dir/home" PATH="$dir/mockbin:$PATH" "$dir/plugin/bin/launch.sh" "$@"
}

# Scenario 1: dev mode — a local build next to the launcher wins, no network.
dir=$(scenario_dir dev)
write_fake_binary "$dir/plugin/bin/mneme" 'DEV-OK'
write_mock_curl "$dir/mockbin"
out=$(run_launcher "$dir" 2>&1) || say_fail 'dev: non-zero exit'
[ "$out" = 'DEV-OK' ] || say_fail "dev: expected DEV-OK, got: $out"
[ ! -f "$dir/mockbin/curl.log" ] || say_fail 'dev: curl was called in dev mode'

# Scenario 2: cache hit — the cached binary runs, curl is never called.
dir=$(scenario_dir cache-hit)
write_pin "$dir/plugin/bin" 'cafe1234'
write_mock_curl "$dir/mockbin"
write_mock_sha "$dir/mockbin" 'cafe1234'
mkdir -p "$dir/home/.mneme/bin/9.9.9"
write_fake_binary "$dir/home/.mneme/bin/9.9.9/mneme-$target" 'CACHE-OK'
out=$(run_launcher "$dir" 2>&1) || say_fail 'cache-hit: non-zero exit'
[ "$out" = 'CACHE-OK' ] || say_fail "cache-hit: expected CACHE-OK, got: $out"
[ ! -f "$dir/mockbin/curl.log" ] || say_fail 'cache-hit: curl was called on a warm cache'

# Scenario 3: cache miss — download, checksum ok, atomic install, exec.
dir=$(scenario_dir download)
write_pin "$dir/plugin/bin" 'feedbeef'
write_mock_curl "$dir/mockbin"
write_mock_sha "$dir/mockbin" 'feedbeef'
out=$(run_launcher "$dir" 2>&1) || say_fail 'download: non-zero exit'
[ "$out" = 'DOWNLOAD-OK' ] || say_fail "download: expected DOWNLOAD-OK, got: $out"
[ -f "$dir/mockbin/curl.log" ] || say_fail 'download: curl was never called'
[ -x "$dir/home/.mneme/bin/9.9.9/mneme-$target" ] || say_fail 'download: cached binary missing or not executable'

# Scenario 4: checksum mismatch — named stderr error, nothing left executable.
dir=$(scenario_dir mismatch)
write_pin "$dir/plugin/bin" 'expected111'
write_mock_curl "$dir/mockbin"
write_mock_sha "$dir/mockbin" 'actual222'
if run_launcher "$dir" >/dev/null 2>"$dir/stderr"; then
  say_fail 'mismatch: launcher exited 0 on a checksum mismatch'
fi
grep -q 'checksum mismatch' "$dir/stderr" || say_fail 'mismatch: stderr does not name the checksum mismatch'
leftovers=$(find "$dir/home/.mneme" -type f 2>/dev/null || true)
[ -z "$leftovers" ] || say_fail "mismatch: files left in the cache: $leftovers"

# Scenario 5: unsupported platform — named stderr error, non-zero exit.
dir=$(scenario_dir platform)
write_pin "$dir/plugin/bin" 'cafe1234'
printf '#!/bin/sh\necho SunOS\n' >"$dir/mockbin/uname"
chmod +x "$dir/mockbin/uname"
if run_launcher "$dir" >/dev/null 2>"$dir/stderr"; then
  say_fail 'platform: launcher exited 0 on an unsupported platform'
fi
grep -q 'unsupported platform' "$dir/stderr" || say_fail 'platform: stderr does not name the unsupported platform'

# Scenario 6: argv forwarding in dev mode — the binary receives the arguments as they are.
dir=$(scenario_dir forward-dev)
write_fake_binary "$dir/plugin/bin/mneme" 'DEV-OK'
write_mock_curl "$dir/mockbin"
out=$(run_launcher "$dir" survey --brief 2>&1) || say_fail 'forward-dev: non-zero exit'
[ "$out" = 'DEV-OK survey --brief' ] || say_fail "forward-dev: expected 'DEV-OK survey --brief', got: $out"
[ ! -f "$dir/mockbin/curl.log" ] || say_fail 'forward-dev: curl was called in dev mode'

# Scenario 7: argv forwarding on a cache hit — the cached binary receives the same arguments.
dir=$(scenario_dir forward-cache)
write_pin "$dir/plugin/bin" 'cafe1234'
write_mock_curl "$dir/mockbin"
write_mock_sha "$dir/mockbin" 'cafe1234'
mkdir -p "$dir/home/.mneme/bin/9.9.9"
write_fake_binary "$dir/home/.mneme/bin/9.9.9/mneme-$target" 'CACHE-OK'
out=$(run_launcher "$dir" survey --brief 2>&1) || say_fail 'forward-cache: non-zero exit'
[ "$out" = 'CACHE-OK survey --brief' ] || say_fail "forward-cache: expected 'CACHE-OK survey --brief', got: $out"
[ ! -f "$dir/mockbin/curl.log" ] || say_fail 'forward-cache: curl was called on a warm cache'

# Scenario 8: --warm in dev mode — exit 0, no exec, no network.
dir=$(scenario_dir warm-dev)
write_fake_binary "$dir/plugin/bin/mneme" 'DEV-OK'
write_mock_curl "$dir/mockbin"
out=$(run_launcher "$dir" --warm 2>&1) || say_fail 'warm-dev: non-zero exit'
[ -z "$out" ] || say_fail "warm-dev: expected no output, got: $out"
[ ! -f "$dir/mockbin/curl.log" ] || say_fail 'warm-dev: curl was called in dev mode'

# Scenario 9: --warm on a cache miss — fills the cache, never execs (the fake would print).
dir=$(scenario_dir warm-fill)
write_pin "$dir/plugin/bin" 'feedbeef'
write_mock_curl "$dir/mockbin"
write_mock_sha "$dir/mockbin" 'feedbeef'
out=$(run_launcher "$dir" --warm 2>&1) || say_fail 'warm-fill: non-zero exit'
[ -z "$out" ] || say_fail "warm-fill: expected no output (no exec), got: $out"
[ -f "$dir/mockbin/curl.log" ] || say_fail 'warm-fill: curl was never called'
[ -x "$dir/home/.mneme/bin/9.9.9/mneme-$target" ] || say_fail 'warm-fill: cached binary missing or not executable'

# Scenario 10: --warm with no pin and no dev build — silent exit 0 (nothing to warm yet).
dir=$(scenario_dir warm-nopin)
write_mock_curl "$dir/mockbin"
out=$(run_launcher "$dir" --warm 2>&1) || say_fail 'warm-nopin: non-zero exit'
[ -z "$out" ] || say_fail "warm-nopin: expected no output, got: $out"
[ ! -f "$dir/mockbin/curl.log" ] || say_fail 'warm-nopin: curl was called without a pin'

# Scenario 11: orphan sweep on a cache hit — a dead launcher's temp file goes,
# a live launcher's and a non-pid one stay, the cached binary runs as usual.
dir=$(scenario_dir orphan-sweep)
write_pin "$dir/plugin/bin" 'cafe1234'
write_mock_curl "$dir/mockbin"
write_mock_sha "$dir/mockbin" 'cafe1234'
cache="$dir/home/.mneme/bin/9.9.9"
mkdir -p "$cache"
write_fake_binary "$cache/mneme-$target" 'CACHE-OK'
sh -c 'exit 0' &
dead_pid=$!
wait "$dead_pid"
: >"$cache/.mneme-$target.$dead_pid"
: >"$cache/.mneme-$target.$$"
: >"$cache/.mneme-$target.partial"
: >"$cache/.mneme-$target.x.$dead_pid"
out=$(run_launcher "$dir" 2>&1) || say_fail 'orphan-sweep: non-zero exit'
[ "$out" = 'CACHE-OK' ] || say_fail "orphan-sweep: expected CACHE-OK, got: $out"
[ ! -f "$dir/mockbin/curl.log" ] || say_fail 'orphan-sweep: curl was called on a warm cache'
[ ! -e "$cache/.mneme-$target.$dead_pid" ] || say_fail 'orphan-sweep: the temp file of a dead launcher was left'
[ -e "$cache/.mneme-$target.$$" ] || say_fail 'orphan-sweep: the temp file of a live launcher was removed'
[ -e "$cache/.mneme-$target.partial" ] || say_fail 'orphan-sweep: a temp file without a pid suffix was removed'
[ -e "$cache/.mneme-$target.x.$dead_pid" ] || say_fail 'orphan-sweep: a file outside the .mneme-<target>.<pid> form was removed'

# Scenario 12: the sweep never blocks a start — a dead launcher's temp file in
# a cache directory the user cannot write leaves the cached binary running.
dir=$(scenario_dir orphan-sweep-readonly)
write_pin "$dir/plugin/bin" 'cafe1234'
write_mock_curl "$dir/mockbin"
write_mock_sha "$dir/mockbin" 'cafe1234'
cache="$dir/home/.mneme/bin/9.9.9"
mkdir -p "$cache"
write_fake_binary "$cache/mneme-$target" 'CACHE-OK'
: >"$cache/.mneme-$target.$dead_pid"
chmod a-w "$cache"
out=$(run_launcher "$dir" 2>&1) || say_fail 'orphan-sweep-readonly: a temp file that cannot be removed blocked the start'
[ "$out" = 'CACHE-OK' ] || say_fail "orphan-sweep-readonly: expected CACHE-OK, got: $out"
chmod u+w "$cache"

# Scenarios 13-14: a download interrupted by TERM and by HUP — curl is killed,
# the temp file is removed, the error is named, nothing is installed. The
# launcher's pid is the suffix of its temp file, and its exit is read from a
# status file: an exited but unreaped child would still pass `kill -0`.
for signal in TERM HUP; do
  scenario="interrupt-$signal"
  dir=$(scenario_dir "$scenario")
  write_pin "$dir/plugin/bin" 'feedbeef'
  write_slow_curl "$dir/mockbin"
  write_mock_sha "$dir/mockbin" 'feedbeef'
  cache="$dir/home/.mneme/bin/9.9.9"
  (
    HOME="$dir/home" PATH="$dir/mockbin:$PATH" "$dir/plugin/bin/launch.sh" >/dev/null 2>"$dir/stderr" &
    printf '%s' "$!" >"$dir/launcher.pid"
    wait "$!"
    printf '%s' "$?" >"$dir/exit_status"
  ) &
  wrapper_pid=$!
  if ! wait_for_file "$dir/mockbin/curl.pid"; then
    say_fail "$scenario: the download never started"
    kill -KILL "$(cat "$dir/launcher.pid" 2>/dev/null)" 2>/dev/null || true
    wait "$wrapper_pid" 2>/dev/null || true
    kill -KILL "$(cat "$dir/mockbin/curl.pid" 2>/dev/null)" 2>/dev/null || true
    continue
  fi
  curl_pid=$(cat "$dir/mockbin/curl.pid")
  temp_file=$(find "$cache" -name ".mneme-$target.*" | head -n 1)
  launcher_pid=${temp_file##*.}
  kill "-$signal" "$launcher_pid"
  if ! wait_for_file "$dir/exit_status"; then
    say_fail "$scenario: the launcher did not exit after the signal"
    kill -KILL "$launcher_pid" "$curl_pid" 2>/dev/null || true
  fi
  wait "$wrapper_pid" 2>/dev/null || true
  [ "$(cat "$dir/exit_status" 2>/dev/null)" != '0' ] || say_fail "$scenario: launcher exited 0 on an interrupted download"
  leftovers=$(find "$cache" -name ".mneme-$target.*" 2>/dev/null)
  [ -z "$leftovers" ] || say_fail "$scenario: the temp file was left"
  if kill -0 "$curl_pid" 2>/dev/null; then
    say_fail "$scenario: curl outlived the launcher"
  fi
  grep -q 'download interrupted' "$dir/stderr" || say_fail "$scenario: stderr does not name the interrupted download"
  [ ! -e "$cache/mneme-$target" ] || say_fail "$scenario: a binary was installed after the interrupt"
  kill -KILL "$curl_pid" 2>/dev/null || true
done

# Git-ignore regression: the launcher and the pin MUST be trackable, the
# binary itself MUST stay ignored.
if git -C "$repo_root" check-ignore -q plugin/bin/launch.sh; then
  say_fail 'git ignores plugin/bin/launch.sh — the unanchored bin/ pattern is back'
fi
if git -C "$repo_root" check-ignore -q plugin/bin/release.json; then
  say_fail 'git ignores plugin/bin/release.json — the unanchored bin/ pattern is back'
fi
if ! git -C "$repo_root" check-ignore -q plugin/bin/mneme; then
  say_fail 'plugin/bin/mneme is not ignored — the compiled binary must never be committed'
fi

if [ "$failures" -gt 0 ]; then
  printf 'check-launcher: %d failure(s)\n' "$failures" >&2
  exit 1
fi
printf 'check-launcher: all launcher scenarios passed.\n'
