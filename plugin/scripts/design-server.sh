#!/bin/sh
#
# Launcher for the Melete design server, driven by the /mneme:design-server skill.
#
# STDOUT CONTRACT — one `<key> <value>` line per fact, nothing else:
#   start  -> url <URL> / pid <n> / task <slug> / log <path> / out <path>
#             gitignore added|present|skipped / browser opened|skipped
#             (already running: `already running` + url + pid)
#   status -> `running <URL> pid <n> session <none|<id>|ambiguous (...)>`  exit 0
#             `stopped`                                                    exit 1
#             `stale pid <n> (<reason>)`                                   exit 2
#   stop   -> `stopped pid <n>` | `not running`                            exit 0
# Every failure is a named line on stderr that also names its remedy, plus a
# non-zero exit.
#
# ONE SOURCE per fact about the server. The URL comes from the server's own
# banner in .melete/server.out; the pid from .melete/server.pid, which the
# server writes before it binds; the session id from .melete/sessions.json,
# which the server writes on the SDK init. This launcher keeps no state file of
# its own — it only redirects the server's output into server.out.
#
# JSON IS NEVER PARSED. sessions.json is flat, machine-generated, one key per
# line, and is read with the same sed idiom bin/launch.sh uses for release.json;
# a change of that shape on the Melete side degrades to `session none`, never to
# an error. The body of /health is used only as the fact that it answered 200.
#
# LIVENESS = `kill -0` on the pid AND a 200 from GET /health on the banner URL.
# A pid alone proves nothing: the number can be reused, and the server writes it
# before a bind that may still fail with EADDRINUSE.
#
# A LIVE process is touched by `stop` alone. `start` either reports `already
# running` or refuses with a remedy, leaving the pid file intact; only DEAD pid
# files are cleaned up.
#
# The server is started double-forked, on purpose: with a single fork it would
# stay a zombie child of this shell after it exits, and `kill -0` reads a zombie
# as alive — the "exited before /health" case would be undetectable. Orphaned,
# its pid reads dead the moment it dies. The SIGTERM target is therefore always
# .melete/server.pid, which the server writes before binding.
#
# Usage: design-server.sh start [<path-to-Melete>] [--port N] [--task SLUG] [--no-open]
#        design-server.sh stop
#        design-server.sh status

set -eu

WAIT_TICKS=60
STOP_TICKS=20
TICK=0.5
TAIL_LINES=20

fail() {
  printf 'design-server: error: %s\n' "$*" >&2
  exit 1
}

usage() {
  printf 'usage: design-server.sh start [<path-to-Melete>] [--port N] [--task SLUG] [--no-open]\n' >&2
  printf '       design-server.sh stop\n' >&2
  printf '       design-server.sh status\n' >&2
}

self_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
plugin_root=$(CDPATH='' cd -- "$self_dir/.." && pwd)

project_root=$PWD
runtime_dir=$project_root/.melete
pid_file=$runtime_dir/server.pid
out_file=$runtime_dir/server.out
log_file=$runtime_dir/server.log
sessions_file=$runtime_dir/sessions.json
pointer_file=$HOME/.mneme/melete/checkout

read_pid() {
  [ -f "$pid_file" ] || return 1
  read_pid_value=$(tr -d '[:space:]' < "$pid_file" 2>/dev/null || true)
  case $read_pid_value in
    '' | *[!0-9]*) return 1 ;;
  esac
  printf '%s' "$read_pid_value"
}

pid_alive() {
  kill -0 "$1" 2>/dev/null
}

banner_url() {
  [ -f "$out_file" ] || return 1
  banner_url_value=$(grep -o 'http://127\.0\.0\.1:[0-9][0-9]*' "$out_file" 2>/dev/null | head -n 1 || true)
  [ -n "$banner_url_value" ] || return 1
  printf '%s' "$banner_url_value"
}

health_ok() {
  curl -fsS -o /dev/null "$1/health" 2>/dev/null
}

# The sed idiom of bin/launch.sh: a contract with the server's serializer
# (JSON.stringify(..., null, 2) writes one "key": "value" per line), never a
# JSON parser.
session_field() {
  if [ ! -f "$sessions_file" ]; then
    printf 'none'
    return
  fi
  session_ids=$(sed -n 's/^[[:space:]]*"[^"]*"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$sessions_file" 2>/dev/null || true)
  session_count=$(printf '%s' "$session_ids" | grep -c . || true)
  case $session_count in
    0) printf 'none' ;;
    1) printf '%s' "$session_ids" ;;
    *) printf 'ambiguous (%s tasks in .melete/sessions.json)' "$session_count" ;;
  esac
}

ensure_gitignore() {
  if ! git -C "$project_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf 'skipped'
    return
  fi
  gitignore_file=$project_root/.gitignore
  if [ -f "$gitignore_file" ] && grep -qx '\.melete/' "$gitignore_file"; then
    printf 'present'
    return
  fi
  if [ -s "$gitignore_file" ] && [ -n "$(tail -c 1 "$gitignore_file")" ]; then
    printf '\n' >>"$gitignore_file"
  fi
  printf '.melete/\n' >>"$gitignore_file"
  printf 'added'
}

validate_checkout() {
  validate_path=$(CDPATH='' cd -- "$1" 2>/dev/null && pwd) || return 1
  [ -f "$validate_path/src/main.ts" ] || return 1
  printf '%s' "$validate_path"
}

cmd_start() {
  start_checkout_arg=''
  start_port=''
  start_task='design'
  start_open=1

  while [ $# -gt 0 ]; do
    case $1 in
      --port)
        [ $# -ge 2 ] || fail 'the --port flag needs a number'
        start_port=$2
        shift 2
        ;;
      --task)
        [ $# -ge 2 ] || fail 'the --task flag needs a slug'
        start_task=$2
        shift 2
        ;;
      --no-open)
        start_open=0
        shift
        ;;
      -*)
        usage
        fail "unknown flag: $1"
        ;;
      *)
        if [ -n "$start_checkout_arg" ]; then
          usage
          fail "unexpected argument: $1"
        fi
        start_checkout_arg=$1
        shift
        ;;
    esac
  done

  command -v bun >/dev/null 2>&1 || fail 'bun not found — install Bun 1.4.0 (https://bun.sh)'

  if [ -n "$start_checkout_arg" ]; then
    checkout=$(validate_checkout "$start_checkout_arg") ||
      fail "not a Melete checkout: $start_checkout_arg (src/main.ts is missing) — pass the checkout root"
    mkdir -p "$(dirname "$pointer_file")"
    printf '%s\n' "$checkout" >"$pointer_file"
  elif [ -n "${MELETE_HOME:-}" ]; then
    checkout=$(validate_checkout "$MELETE_HOME") ||
      fail "MELETE_HOME is not a Melete checkout: $MELETE_HOME (src/main.ts is missing)"
  elif [ -f "$pointer_file" ]; then
    checkout=$(validate_checkout "$(cat "$pointer_file")") ||
      fail "the remembered checkout is gone ($pointer_file) — run /mneme:design-server start <path-to-Melete> once"
  else
    fail 'no Melete checkout — run /mneme:design-server start <path-to-Melete> once'
  fi

  if start_pid=$(read_pid) && pid_alive "$start_pid"; then
    if start_url=$(banner_url); then
      if health_ok "$start_url"; then
        printf 'already running\n'
        printf 'url %s\n' "$start_url"
        printf 'pid %s\n' "$start_pid"
        return 0
      fi
      fail "process $start_pid is alive but /health is silent — run /mneme:design-server stop, then start"
    fi
    fail "a live process $start_pid holds .melete/server.pid but there is no server.out — not started by this launcher; run /mneme:design-server stop first"
  fi
  rm -f "$pid_file"

  gitignore_state=$(ensure_gitignore)
  mkdir -p "$runtime_dir"
  : >"$out_file"

  set -- run start --project "$project_root" --task "$start_task"
  [ -z "$start_port" ] || set -- "$@" --port "$start_port"

  (
    (
      cd "$checkout" || exit 1
      CLAUDE_PLUGIN_ROOT=${CLAUDE_PLUGIN_ROOT:-$plugin_root}
      export CLAUDE_PLUGIN_ROOT
      exec nohup bun "$@" >"$out_file" 2>&1 </dev/null
    ) &
  )

  start_url=''
  start_ok=0
  start_ticks=0
  while [ "$start_ticks" -lt "$WAIT_TICKS" ]; do
    if [ -z "$start_url" ]; then
      start_url=$(banner_url || true)
    fi
    if [ -n "$start_url" ] && health_ok "$start_url"; then
      start_ok=1
      break
    fi
    if start_pid=$(read_pid) && ! pid_alive "$start_pid"; then
      printf 'design-server: error: server exited before /health — the tail of %s follows\n' "$out_file" >&2
      tail -n "$TAIL_LINES" "$out_file" >&2 || true
      rm -f "$pid_file"
      exit 1
    fi
    sleep "$TICK"
    start_ticks=$((start_ticks + 1))
  done

  if [ "$start_ok" -eq 0 ]; then
    if start_pid=$(read_pid); then
      kill -TERM "$start_pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
    printf 'design-server: error: server did not answer /health within 30s — the tail of %s follows\n' "$out_file" >&2
    tail -n "$TAIL_LINES" "$out_file" >&2 || true
    exit 1
  fi

  start_pid=$(read_pid || printf 'unknown')
  printf 'url %s\n' "$start_url"
  printf 'pid %s\n' "$start_pid"
  printf 'task %s\n' "$start_task"
  printf 'log %s\n' "$log_file"
  printf 'out %s\n' "$out_file"
  printf 'gitignore %s\n' "$gitignore_state"

  start_browser=skipped
  if [ "$start_open" -eq 1 ]; then
    if command -v open >/dev/null 2>&1; then
      open "$start_url" >/dev/null 2>&1 || true
      start_browser=opened
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$start_url" >/dev/null 2>&1 || true
      start_browser=opened
    fi
  fi
  printf 'browser %s\n' "$start_browser"
}

cmd_stop() {
  if ! stop_pid=$(read_pid) || ! pid_alive "$stop_pid"; then
    rm -f "$pid_file"
    printf 'not running\n'
    return 0
  fi

  kill -TERM "$stop_pid" 2>/dev/null || true
  stop_ticks=0
  while [ "$stop_ticks" -lt "$STOP_TICKS" ]; do
    if [ ! -f "$pid_file" ] || ! pid_alive "$stop_pid"; then
      break
    fi
    sleep "$TICK"
    stop_ticks=$((stop_ticks + 1))
  done
  if pid_alive "$stop_pid"; then
    kill -KILL "$stop_pid" 2>/dev/null || true
  fi
  rm -f "$pid_file"
  printf 'stopped pid %s\n' "$stop_pid"
}

cmd_status() {
  if ! status_pid=$(read_pid); then
    printf 'stopped\n'
    exit 1
  fi
  if ! pid_alive "$status_pid"; then
    printf 'stale pid %s (process dead)\n' "$status_pid"
    exit 2
  fi
  if ! status_url=$(banner_url); then
    printf 'stale pid %s (no server.out — not started by the launcher)\n' "$status_pid"
    exit 2
  fi
  if ! health_ok "$status_url"; then
    printf 'stale pid %s (process alive, /health silent)\n' "$status_pid"
    exit 2
  fi
  printf 'running %s pid %s session %s\n' "$status_url" "$status_pid" "$(session_field)"
}

if [ $# -lt 1 ]; then
  usage
  fail 'no command — start, stop or status'
fi

ds_command=$1
shift

case $ds_command in
  start)
    cmd_start "$@"
    ;;
  stop)
    if [ $# -ne 0 ]; then
      usage
      fail 'stop takes no arguments'
    fi
    cmd_stop
    ;;
  status)
    if [ $# -ne 0 ]; then
      usage
      fail 'status takes no arguments'
    fi
    cmd_status
    ;;
  *)
    usage
    fail "unknown command: $ds_command"
    ;;
esac
