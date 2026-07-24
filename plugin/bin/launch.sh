#!/bin/sh
#
# Launcher for the mneme MCP server binary.
#
# Dev mode: a locally built `mneme` binary sitting next to this script wins
# unconditionally — the local development cycle never touches the network.
# Production mode: detect the platform target, read the pinned engine release
# from release.json (machine-generated, fixed flat layout — the parse contract),
# serve the binary from ~/.mneme/bin/<engine_version>/ or download it from the
# pinned GitHub Release, verifying its SHA256 BEFORE chmod +x and installing
# with an atomic mv.
#
# --warm: walk the same path up to and including the cache fill, but never
# exec — the SessionStart hook uses it so the first MCP start does not wait for
# the download. Exits 0 when no release is pinned yet.
#
# Every failure is a named line on stderr and a non-zero exit.

set -eu

fail() {
  printf 'mneme-launch: error: %s\n' "$*" >&2
  exit 1
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    return 1
  fi
}

warm=0
if [ "${1:-}" = "--warm" ]; then
  warm=1
fi

self_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

# Dev mode: a local build next to the launcher.
if [ -x "$self_dir/mneme" ]; then
  if [ "$warm" -eq 1 ]; then
    exit 0
  fi
  exec "$self_dir/mneme"
fi

pin_file="$self_dir/release.json"
if [ ! -f "$pin_file" ]; then
  if [ "$warm" -eq 1 ]; then
    exit 0
  fi
  fail "no local build and no release pin: $pin_file is missing (the engine has not published a release yet)"
fi

os=$(uname -s)
machine=$(uname -m)
case "$os" in
  Darwin) os_slug='darwin' ;;
  Linux) os_slug='linux' ;;
  *) fail "unsupported platform: $os (supported: Darwin, Linux)" ;;
esac
case "$machine" in
  arm64 | aarch64) arch_slug='arm64' ;;
  x86_64 | amd64) arch_slug='x64' ;;
  *) fail "unsupported architecture: $machine (supported: arm64/aarch64, x86_64/amd64)" ;;
esac
target="${os_slug}-${arch_slug}"

# release.json is machine-generated with one key per line; that fixed flat
# layout is the contract that makes this sed parse reliable.
pin_value() {
  sed -n 's/^[[:space:]]*"'"$1"'":[[:space:]]*"\([^"]*\)".*/\1/p' "$pin_file" | head -n 1
}

engine_version=$(pin_value 'engine_version')
base_url=$(pin_value 'base_url')
checksum=$(pin_value "$target")

[ -n "$engine_version" ] || fail "release pin is malformed: engine_version missing in $pin_file"
[ -n "$base_url" ] || fail "release pin is malformed: base_url missing in $pin_file"
[ -n "$checksum" ] || fail "no sha256 for target $target in $pin_file"

cache_dir="$HOME/.mneme/bin/$engine_version"
cache_bin="$cache_dir/mneme-$target"

if [ ! -x "$cache_bin" ]; then
  command -v curl >/dev/null 2>&1 || fail "curl not found — cannot download the engine binary"
  mkdir -p "$cache_dir"
  tmp_bin="$cache_dir/.mneme-$target.$$"
  url="$base_url/mneme-$target"
  if ! curl -fsSL --retry 2 -o "$tmp_bin" "$url"; then
    rm -f "$tmp_bin"
    fail "download failed (no network or missing release asset): $url"
  fi
  if ! actual=$(sha256_of "$tmp_bin"); then
    rm -f "$tmp_bin"
    fail "no sha256 tool found (need sha256sum or shasum)"
  fi
  if [ "$actual" != "$checksum" ]; then
    rm -f "$tmp_bin"
    fail "checksum mismatch for $url: expected $checksum got $actual (downloaded file removed)"
  fi
  chmod +x "$tmp_bin"
  mv -f "$tmp_bin" "$cache_bin"
fi

if [ "$warm" -eq 1 ]; then
  exit 0
fi
exec "$cache_bin"
