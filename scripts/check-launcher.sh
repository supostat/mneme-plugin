#!/bin/sh
#
# Gate for plugin/bin/launch.sh: five behavioural scenarios run against
# fixtures in a temporary directory (mocked curl / sha tools / uname), plus
# the git-ignore regression check — the old `bin/` ignore pattern silently
# dropped the launcher from the bundle, and must never come back.
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

write_fake_binary() {
  printf '#!/bin/sh\necho %s\n' "$2" >"$1"
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
