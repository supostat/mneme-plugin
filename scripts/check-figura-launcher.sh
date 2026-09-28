#!/bin/sh
#
# Gate for figura/bin/launch.sh: behavioural scenarios against fixtures in a temporary directory
# with mocked curl, sha tools and uname on a whitelisted PATH, the asset URL the launcher requests
# for every target against scripts/release-assets.mjs, and git tracking of the launcher, the pin
# and the dev binary.

set -u

repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
launcher="$repo_root/figura/bin/launch.sh"
real_pin="$repo_root/figura/bin/release.json"
failures=0

say_fail() {
  printf 'check-figura-launcher: FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

tmp_root=$(mktemp -d)
trap 'rm -rf "$tmp_root"' EXIT

link_tools() {
  tool_dir="$1"
  shift
  mkdir -p "$tool_dir"
  for tool in "$@"; do
    if tool_path=$(command -v "$tool"); then
      ln -s "$tool_path" "$tool_dir/$tool"
    fi
  done
}

base_tools="$tmp_root/base-tools"
tar_tools="$tmp_root/tar-tools"
link_tools "$base_tools" dirname uname sed head awk mkdir rm mv chmod cp
link_tools "$tar_tools" tar gzip

write_mock_uname() {
  cat >"$1/uname" <<EOF
#!/bin/sh
case "\$1" in
  -s) echo '$2' ;;
  -m) echo '$3' ;;
esac
EOF
  chmod +x "$1/uname"
}

write_fake_d2() {
  cat >"$1" <<EOF
#!/bin/sh
echo "$2 \$*"
EOF
  chmod +x "$1"
}

write_mock_curl() {
  cat >"$1/curl" <<'EOF'
#!/bin/sh
mock_dir=$(dirname "$0")
out=''
url=''
while [ $# -gt 0 ]; do
  case "$1" in
    -o)
      out="$2"
      shift
      ;;
    -*) ;;
    *) url="$1" ;;
  esac
  shift
done
printf '%s\n' "$url" >>"$mock_dir/curl.log"
[ -f "$mock_dir/served.tar.gz" ] || exit 22
cp "$mock_dir/served.tar.gz" "$out"
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
    "linux-x64": "$2"
  }
}
EOF
}

scenario_dir() {
  dir="$tmp_root/$1"
  mkdir -p "$dir/figura/bin" "$dir/mockbin" "$dir/home"
  cp "$launcher" "$dir/figura/bin/launch.sh"
  chmod +x "$dir/figura/bin/launch.sh"
  write_mock_uname "$dir/mockbin" Linux x86_64
  printf '%s' "$dir"
}

run_launcher() {
  dir="$1"
  search_path="$2"
  shift 2
  HOME="$dir/home" PATH="$search_path" "$dir/figura/bin/launch.sh" "$@"
}

fake_archive="$tmp_root/fake-d2.tar.gz"
mkdir -p "$tmp_root/archive/d2-v9.9.9/bin"
write_fake_d2 "$tmp_root/archive/d2-v9.9.9/bin/d2" 'DOWNLOAD-OK'
tar -czf "$fake_archive" -C "$tmp_root/archive" d2-v9.9.9

dir=$(scenario_dir dev)
write_fake_d2 "$dir/figura/bin/d2" 'DEV-OK'
out=$(run_launcher "$dir" "$dir/mockbin:$base_tools" --version 2>&1) || say_fail "dev: non-zero exit: $out"
[ "$out" = 'DEV-OK --version' ] || say_fail "dev: expected 'DEV-OK --version' with curl absent, got: $out"

dir=$(scenario_dir cache-hit)
write_pin "$dir/figura/bin" 'cafe1234'
mkdir -p "$dir/home/.figura/bin/9.9.9"
write_fake_d2 "$dir/home/.figura/bin/9.9.9/d2" 'CACHE-OK'
out=$(run_launcher "$dir" "$dir/mockbin:$base_tools" input.d2 2>&1) || say_fail "cache-hit: non-zero exit: $out"
[ "$out" = 'CACHE-OK input.d2' ] || say_fail "cache-hit: expected 'CACHE-OK input.d2' with curl absent, got: $out"

dir=$(scenario_dir download)
write_pin "$dir/figura/bin" 'feedbeef'
write_mock_curl "$dir/mockbin"
cp "$fake_archive" "$dir/mockbin/served.tar.gz"
write_mock_sha "$dir/mockbin" 'feedbeef'
out=$(run_launcher "$dir" "$dir/mockbin:$tar_tools:$base_tools" in.d2 out.svg 2>&1) || say_fail "download: non-zero exit: $out"
[ "$out" = 'DOWNLOAD-OK in.d2 out.svg' ] || say_fail "download: expected 'DOWNLOAD-OK in.d2 out.svg', got: $out"
[ -x "$dir/home/.figura/bin/9.9.9/d2" ] || say_fail 'download: the cached d2 is missing or not executable'
leftovers=$(find "$dir/home/.figura/bin/9.9.9" -mindepth 1 ! -name d2 2>/dev/null)
[ -z "$leftovers" ] || say_fail "download: unpack leftovers in the cache: $leftovers"

dir=$(scenario_dir mismatch)
write_pin "$dir/figura/bin" 'expected111'
write_mock_curl "$dir/mockbin"
cp "$fake_archive" "$dir/mockbin/served.tar.gz"
write_mock_sha "$dir/mockbin" 'actual222'
if run_launcher "$dir" "$dir/mockbin:$tar_tools:$base_tools" >/dev/null 2>"$dir/stderr"; then
  say_fail 'mismatch: the launcher exited 0 on a checksum mismatch'
fi
grep -q 'figura-launch: error: checksum mismatch' "$dir/stderr" || say_fail 'mismatch: stderr does not name the checksum mismatch'
leftovers=$(find "$dir/home/.figura" -type f 2>/dev/null)
[ -z "$leftovers" ] || say_fail "mismatch: files left in the cache: $leftovers"

dir=$(scenario_dir platform)
write_pin "$dir/figura/bin" 'cafe1234'
write_mock_uname "$dir/mockbin" SunOS i86pc
if run_launcher "$dir" "$dir/mockbin:$tar_tools:$base_tools" >/dev/null 2>"$dir/stderr"; then
  say_fail 'platform: the launcher exited 0 on an unsupported platform'
fi
grep -q 'figura-launch: error: unsupported platform' "$dir/stderr" || say_fail 'platform: stderr does not name the unsupported platform'

dir=$(scenario_dir no-curl)
write_pin "$dir/figura/bin" 'cafe1234'
if run_launcher "$dir" "$dir/mockbin:$tar_tools:$base_tools" >/dev/null 2>"$dir/stderr"; then
  say_fail 'no-curl: the launcher exited 0 without curl'
fi
grep -q 'figura-launch: error: curl not found' "$dir/stderr" || say_fail 'no-curl: stderr does not name the missing curl'

dir=$(scenario_dir no-tar)
write_pin "$dir/figura/bin" 'cafe1234'
write_mock_curl "$dir/mockbin"
if run_launcher "$dir" "$dir/mockbin:$base_tools" >/dev/null 2>"$dir/stderr"; then
  say_fail 'no-tar: the launcher exited 0 without tar'
fi
grep -q 'figura-launch: error: tar not found' "$dir/stderr" || say_fail 'no-tar: stderr does not name the missing tar'
[ ! -f "$dir/mockbin/curl.log" ] || say_fail 'no-tar: the archive was downloaded before tar was found missing'

check_requested_url() {
  dir=$(scenario_dir "url-$3")
  cp "$real_pin" "$dir/figura/bin/release.json"
  write_mock_uname "$dir/mockbin" "$1" "$2"
  write_mock_curl "$dir/mockbin"
  run_launcher "$dir" "$dir/mockbin:$tar_tools:$base_tools" >/dev/null 2>&1
  requested=$(cat "$dir/mockbin/curl.log" 2>/dev/null)
  expected=$(cd "$repo_root" && node scripts/release-assets.mjs figura "$3")
  if [ -z "$expected" ] || [ "$requested" != "$expected" ]; then
    say_fail "url $3: the launcher requested '$requested', release-assets prints '$expected'"
  fi
}

check_requested_url Darwin arm64 darwin-arm64
check_requested_url Darwin x86_64 darwin-x64
check_requested_url Linux x86_64 linux-x64
check_requested_url Linux aarch64 linux-arm64

for tracked in figura/bin/launch.sh figura/bin/release.json; do
  git -C "$repo_root" ls-files --error-unmatch "$tracked" >/dev/null 2>&1 || say_fail "$tracked is not tracked by git — the bundle would ship without it"
done
git -C "$repo_root" check-ignore -q figura/bin/d2 || say_fail 'figura/bin/d2 is not ignored — a local d2 must never be committed'

if [ "$failures" -gt 0 ]; then
  printf 'check-figura-launcher: %d failure(s)\n' "$failures" >&2
  exit 1
fi
printf 'check-figura-launcher: all launcher scenarios passed.\n'
