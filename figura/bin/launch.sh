#!/bin/sh

set -eu

fail() {
  printf 'figura-launch: error: %s\n' "$*" >&2
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

if [ -x "$self_dir/d2" ]; then
  if [ "$warm" -eq 1 ]; then
    exit 0
  fi
  exec "$self_dir/d2" "$@"
fi

pin_file="$self_dir/release.json"
[ -f "$pin_file" ] || fail "no local d2 and no release pin: $pin_file is missing"

os=$(uname -s)
machine=$(uname -m)
case "$os" in
  Darwin) os_slug='darwin' archive_os='macos' ;;
  Linux) os_slug='linux' archive_os='linux' ;;
  *) fail "unsupported platform: $os (supported: Darwin, Linux)" ;;
esac
case "$machine" in
  arm64 | aarch64) arch_slug='arm64' archive_arch='arm64' ;;
  x86_64 | amd64) arch_slug='x64' archive_arch='amd64' ;;
  *) fail "unsupported architecture: $machine (supported: arm64/aarch64, x86_64/amd64)" ;;
esac
target="${os_slug}-${arch_slug}"

pin_value() {
  sed -n 's/^[[:space:]]*"'"$1"'":[[:space:]]*"\([^"]*\)".*/\1/p' "$pin_file" | head -n 1
}

engine_version=$(pin_value 'engine_version')
base_url=$(pin_value 'base_url')
checksum=$(pin_value "$target")

[ -n "$engine_version" ] || fail "release pin is malformed: engine_version missing in $pin_file"
[ -n "$base_url" ] || fail "release pin is malformed: base_url missing in $pin_file"
[ -n "$checksum" ] || fail "no sha256 for target $target in $pin_file"

cache_dir="$HOME/.figura/bin/$engine_version"
cache_bin="$cache_dir/d2"

if [ ! -x "$cache_bin" ]; then
  command -v curl >/dev/null 2>&1 || fail "curl not found — cannot download d2"
  command -v tar >/dev/null 2>&1 || fail "tar not found — cannot unpack the d2 archive"
  unpack_dir="$cache_dir/.unpack.$$"
  mkdir -p "$unpack_dir"
  archive="$unpack_dir/d2.tar.gz"
  url="$base_url/d2-v$engine_version-$archive_os-$archive_arch.tar.gz"
  if ! curl -fsSL --retry 2 -o "$archive" "$url"; then
    rm -rf "$unpack_dir"
    fail "download failed (no network or missing release asset): $url"
  fi
  if ! actual=$(sha256_of "$archive"); then
    rm -rf "$unpack_dir"
    fail "no sha256 tool found (need sha256sum or shasum)"
  fi
  if [ "$actual" != "$checksum" ]; then
    rm -rf "$unpack_dir"
    fail "checksum mismatch for $url: expected $checksum got $actual (downloaded archive removed)"
  fi
  unpacked_bin="$unpack_dir/d2-v$engine_version/bin/d2"
  if ! tar -xzf "$archive" -C "$unpack_dir" || [ ! -f "$unpacked_bin" ]; then
    rm -rf "$unpack_dir"
    fail "cannot unpack d2-v$engine_version/bin/d2 from $url"
  fi
  chmod +x "$unpacked_bin"
  mv -f "$unpacked_bin" "$cache_bin"
  rm -rf "$unpack_dir"
fi

if [ "$warm" -eq 1 ]; then
  exit 0
fi
exec "$cache_bin" "$@"
