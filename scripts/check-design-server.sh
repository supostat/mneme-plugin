#!/bin/sh
#
# Gate for plugin/scripts/design-server.sh: fifteen behavioural scenarios run
# against fixtures in a temporary directory. bun, curl, sleep, open and xdg-open
# are stubbed through PATH and HOME is a fixture, so the real ~/.mneme, the real
# Melete checkout and the real network are never touched.
#
# The stubbed `sleep` records its argument and then sleeps a real 0.05s: the
# scenarios prove the LOOP — how many ticks of what size (60 x 0.5 = 30s for the
# start wait, at most 20 x 0.5 = 10s for stop) — by the arithmetic of the logged
# arguments, never by a stopwatch; the tiny real pause keeps the fake server's
# startup from racing the poll.
#
# Dev tooling: lives at the repo ROOT, never inside plugin/, so it is not
# shipped in the installed bundle.
#
# Usage: sh scripts/check-design-server.sh   (exit 0 = all scenarios green)

set -u

repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
launcher=$repo_root/plugin/scripts/design-server.sh
failures=0
last_status=0

say_fail() {
  printf 'check-design-server: FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

tmp_root=$(mktemp -d)

cleanup() {
  for leftover in "$tmp_root"/*/project/.melete/server.pid; do
    [ -f "$leftover" ] || continue
    kill -KILL "$(cat "$leftover" 2>/dev/null)" 2>/dev/null || true
  done
  rm -rf "$tmp_root"
}
trap cleanup EXIT

write_stubs() {
  cat >"$1/mockbin/bun" <<'STUB'
#!/bin/sh
printf '%s\n' "$*" >>"$MOCK_DIR/bun.log"
mode=$(cat "$MOCK_DIR/mode" 2>/dev/null || echo ok)
root=''
port=4310
while [ $# -gt 0 ]; do
  case $1 in
    --project) root=$2; shift 2 ;;
    --port) port=$2; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$root" ] || root=$PWD
mkdir -p "$root/.melete"
printf '%s\n' "$$" >"$root/.melete/server.pid"
if [ "$mode" = busy ]; then
  printf 'error: Failed to start server. Is port %s in use?\n' "$port" >&2
  exit 1
fi
if [ "$mode" = no-banner ]; then
  printf 'melete: warming up without a banner\n'
else
  printf 'melete 0.0.0 - http://127.0.0.1:%s - project %s\n' "$port" "$root"
  : >"$MOCK_DIR/listening"
fi
trap 'rm -f "$root/.melete/server.pid" "$MOCK_DIR/listening"; exit 0' TERM INT
while :; do
  /bin/sleep 0.2
done
STUB
  cat >"$1/mockbin/curl" <<'STUB'
#!/bin/sh
url=''
for arg in "$@"; do
  case $arg in http*) url=$arg ;; esac
done
printf '%s\n' "$url" >>"$MOCK_DIR/curl.log"
[ -f "$MOCK_DIR/listening" ] || exit 7
cat "$MOCK_DIR/health.json" 2>/dev/null || printf '{"port":4310,"session_id":null,"plugin":"/x"}\n'
STUB
  cat >"$1/mockbin/sleep" <<'STUB'
#!/bin/sh
printf '%s\n' "$1" >>"$MOCK_DIR/sleep.log"
exec /bin/sleep 0.05
STUB
  cat >"$1/mockbin/open" <<'STUB'
#!/bin/sh
printf '%s\n' "$*" >>"$MOCK_DIR/open.log"
STUB
  cp "$1/mockbin/open" "$1/mockbin/xdg-open"
  chmod +x "$1/mockbin/bun" "$1/mockbin/curl" "$1/mockbin/sleep" "$1/mockbin/open" "$1/mockbin/xdg-open"
}

scenario_dir() {
  dir=$tmp_root/$1
  mkdir -p "$dir/home" "$dir/project" "$dir/mock" "$dir/mockbin" "$dir/melete/src"
  printf 'console.log("fake melete");\n' >"$dir/melete/src/main.ts"
  write_stubs "$dir"
  printf '%s' "$dir"
}

run_ds() {
  run_dir=$1
  shift
  (
    cd "$run_dir/project" || exit 99
    HOME=$run_dir/home
    MOCK_DIR=$run_dir/mock
    PATH=${SCENARIO_PATH:-$run_dir/mockbin:$PATH}
    MELETE_HOME=${SCENARIO_MELETE_HOME:-}
    export HOME MOCK_DIR PATH MELETE_HOME
    sh "$launcher" "$@"
  )
}

capture() {
  cap_dir=$1
  cap_name=$2
  shift 2
  run_ds "$cap_dir" "$@" >"$cap_dir/$cap_name.out" 2>"$cap_dir/$cap_name.err"
  last_status=$?
}

dead_pid() {
  /bin/sleep 0.01 &
  dp=$!
  wait "$dp" 2>/dev/null || true
  printf '%s' "$dp"
}

line_count() {
  if [ -f "$1" ]; then
    wc -l <"$1" | tr -d ' '
  else
    printf '0'
  fi
}

# Scenario 1: a fresh start reports the contract lines, writes the pointer and
# the .gitignore line, and opens the browser.
dir=$(scenario_dir fresh)
git -C "$dir/project" init -q
capture "$dir" start start "$dir/melete"
[ "$last_status" -eq 0 ] || say_fail "fresh start: exit $last_status, stderr: $(cat "$dir/start.err")"
grep -q '^url http://127\.0\.0\.1:4310$' "$dir/start.out" || say_fail 'fresh start: no url line'
grep -q '^pid [0-9][0-9]*$' "$dir/start.out" || say_fail 'fresh start: no pid line'
grep -q '^task design$' "$dir/start.out" || say_fail 'fresh start: no task line'
grep -q '^out .*\.melete/server\.out$' "$dir/start.out" || say_fail 'fresh start: no out line'
grep -q '^gitignore added$' "$dir/start.out" || say_fail 'fresh start: gitignore not reported as added'
grep -q '^browser opened$' "$dir/start.out" || say_fail 'fresh start: browser not reported as opened'
grep -qx '\.melete/' "$dir/project/.gitignore" || say_fail 'fresh start: .melete/ missing from .gitignore'
[ -f "$dir/home/.mneme/melete/checkout" ] || say_fail 'fresh start: the checkout pointer was not written'

# Scenario 2: a repeated start is idempotent — same URL, no second launch, no
# second browser tab.
capture "$dir" again start
[ "$last_status" -eq 0 ] || say_fail "repeat start: exit $last_status"
grep -q '^already running$' "$dir/again.out" || say_fail 'repeat start: no already-running line'
grep -q '^url http://127\.0\.0\.1:4310$' "$dir/again.out" || say_fail 'repeat start: url is not the running one'
[ "$(line_count "$dir/mock/bun.log")" = 1 ] || say_fail 'repeat start: bun was launched twice'
[ "$(line_count "$dir/mock/open.log")" = 1 ] || say_fail 'repeat start: the browser was opened twice'

# Scenario 4 (on the running fixture): status by state.
capture "$dir" status_none status
[ "$last_status" -eq 0 ] || say_fail "status running: exit $last_status"
grep -q '^running http://127\.0\.0\.1:4310 pid [0-9][0-9]* session none$' "$dir/status_none.out" ||
  say_fail "status running: unexpected line: $(cat "$dir/status_none.out")"
printf '{\n  "design": "sess-one"\n}\n' >"$dir/project/.melete/sessions.json"
capture "$dir" status_one status
grep -q 'session sess-one$' "$dir/status_one.out" || say_fail "status one session: $(cat "$dir/status_one.out")"
printf '{\n  "design": "sess-one",\n  "other": "sess-two"\n}\n' >"$dir/project/.melete/sessions.json"
capture "$dir" status_two status
grep -q 'session ambiguous (2 tasks in \.melete/sessions\.json)$' "$dir/status_two.out" ||
  say_fail "status two sessions: $(cat "$dir/status_two.out")"

# Scenario 5: stop of a live server, with the tick budget of the stop wait.
: >"$dir/mock/sleep.log"
capture "$dir" stop stop
[ "$last_status" -eq 0 ] || say_fail "stop live: exit $last_status"
grep -q '^stopped pid [0-9][0-9]*$' "$dir/stop.out" || say_fail "stop live: unexpected line: $(cat "$dir/stop.out")"
[ ! -f "$dir/project/.melete/server.pid" ] || say_fail 'stop live: the pid file survived'
stop_ticks=$(line_count "$dir/mock/sleep.log")
[ "$stop_ticks" -le 20 ] || say_fail "stop live: $stop_ticks ticks, the budget is 20 x 0.5s"
if [ -s "$dir/mock/sleep.log" ] && grep -qv '^0\.5$' "$dir/mock/sleep.log"; then
  say_fail 'stop live: a tick other than 0.5 was slept'
fi

# Scenario 4 (continued): stopped and stale states.
dir_states=$(scenario_dir states)
capture "$dir_states" status_stopped status
[ "$last_status" -eq 1 ] || say_fail "status without .melete: exit $last_status, expected 1"
grep -q '^stopped$' "$dir_states/status_stopped.out" || say_fail 'status without .melete: no stopped line'
mkdir -p "$dir_states/project/.melete"
dead=$(dead_pid)
printf '%s\n' "$dead" >"$dir_states/project/.melete/server.pid"
capture "$dir_states" status_dead status
[ "$last_status" -eq 2 ] || say_fail "status with a dead pid: exit $last_status, expected 2"
grep -q "^stale pid $dead (process dead)$" "$dir_states/status_dead.out" ||
  say_fail "status with a dead pid: $(cat "$dir_states/status_dead.out")"
# Orphaned on purpose: a job of this shell would print a kill notice later.
( /bin/sleep 30 & printf '%s' "$!" >"$dir_states/live.pid" )
live=$(cat "$dir_states/live.pid")
printf '%s\n' "$live" >"$dir_states/project/.melete/server.pid"
capture "$dir_states" status_noout status
[ "$last_status" -eq 2 ] || say_fail "status with a live pid and no server.out: exit $last_status, expected 2"
grep -q 'no server\.out — not started by the launcher' "$dir_states/status_noout.out" ||
  say_fail "status with a live pid and no server.out: $(cat "$dir_states/status_noout.out")"

# Scenario 15: start never touches a live process — it refuses with a remedy.
capture "$dir_states" refuse_noout start "$dir_states/melete"
[ "$last_status" -eq 1 ] || say_fail "start with a live pid and no server.out: exit $last_status, expected 1"
grep -q 'run /mneme:design-server stop first' "$dir_states/refuse_noout.err" ||
  say_fail 'start with a live pid and no server.out: the remedy is not named'
[ -f "$dir_states/project/.melete/server.pid" ] || say_fail 'start with a live pid: the pid file was removed'
[ ! -f "$dir_states/mock/bun.log" ] || say_fail 'start with a live pid: bun was launched anyway'
printf 'melete 0.0.0 - http://127.0.0.1:4310 - project x\n' >"$dir_states/project/.melete/server.out"
capture "$dir_states" refuse_silent start "$dir_states/melete"
[ "$last_status" -eq 1 ] || say_fail "start with a silent /health: exit $last_status, expected 1"
grep -q '/health is silent' "$dir_states/refuse_silent.err" ||
  say_fail 'start with a silent /health: the reason is not named'
[ -f "$dir_states/project/.melete/server.pid" ] || say_fail 'start with a silent /health: the pid file was removed'
[ ! -f "$dir_states/mock/bun.log" ] || say_fail 'start with a silent /health: bun was launched anyway'
kill -KILL "$live" 2>/dev/null || true
rm -f "$dir_states/project/.melete/server.pid"

# Scenario 3: a dead pid file is cleaned up and the start goes through.
dir_stale=$(scenario_dir stale-start)
git -C "$dir_stale/project" init -q
mkdir -p "$dir_stale/project/.melete"
printf '%s\n' "$(dead_pid)" >"$dir_stale/project/.melete/server.pid"
capture "$dir_stale" start start "$dir_stale/melete"
[ "$last_status" -eq 0 ] || say_fail "stale pid then start: exit $last_status, stderr: $(cat "$dir_stale/start.err")"
grep -q '^url http://127\.0\.0\.1:4310$' "$dir_stale/start.out" || say_fail 'stale pid then start: no url line'
[ "$(line_count "$dir_stale/mock/bun.log")" = 1 ] || say_fail 'stale pid then start: the server was not launched'
capture "$dir_stale" stop stop

# Scenario 6: stop of a dead pid clears the file and says so.
dir_stopdead=$(scenario_dir stop-dead)
mkdir -p "$dir_stopdead/project/.melete"
printf '%s\n' "$(dead_pid)" >"$dir_stopdead/project/.melete/server.pid"
capture "$dir_stopdead" stop stop
[ "$last_status" -eq 0 ] || say_fail "stop of a dead pid: exit $last_status, expected 0"
grep -q '^not running$' "$dir_stopdead/stop.out" || say_fail "stop of a dead pid: $(cat "$dir_stopdead/stop.out")"
[ ! -f "$dir_stopdead/project/.melete/server.pid" ] || say_fail 'stop of a dead pid: the file survived'

# Scenario 7: the start wait times out after exactly 60 ticks of 0.5s.
dir_timeout=$(scenario_dir timeout)
printf 'no-banner\n' >"$dir_timeout/mock/mode"
: >"$dir_timeout/mock/sleep.log"
capture "$dir_timeout" start start "$dir_timeout/melete"
[ "$last_status" -eq 1 ] || say_fail "timeout: exit $last_status, expected 1"
grep -q 'did not answer /health within 30s' "$dir_timeout/start.err" || say_fail 'timeout: the reason is not named'
grep -q 'warming up without a banner' "$dir_timeout/start.err" || say_fail 'timeout: the tail of server.out is missing'
[ ! -f "$dir_timeout/project/.melete/server.pid" ] || say_fail 'timeout: the pid file survived'
start_ticks=$(line_count "$dir_timeout/mock/sleep.log")
[ "$start_ticks" = 60 ] || say_fail "timeout: $start_ticks ticks, expected exactly 60 (60 x 0.5s = 30s)"
if grep -qv '^0\.5$' "$dir_timeout/mock/sleep.log"; then
  say_fail 'timeout: a tick other than 0.5 was slept'
fi

# Scenario 14: a server that dies before /health is reported at once, with the tail.
dir_busy=$(scenario_dir busy)
printf 'busy\n' >"$dir_busy/mock/mode"
capture "$dir_busy" start start "$dir_busy/melete"
[ "$last_status" -eq 1 ] || say_fail "busy port: exit $last_status, expected 1"
grep -q 'server exited before /health' "$dir_busy/start.err" || say_fail 'busy port: the reason is not named'
grep -q 'Is port 4310 in use' "$dir_busy/start.err" || say_fail 'busy port: the tail of server.out is missing'
[ ! -f "$dir_busy/project/.melete/server.pid" ] || say_fail 'busy port: the dead pid file survived'

# Scenario 8: no bun on PATH.
dir_nobun=$(scenario_dir no-bun)
rm -f "$dir_nobun/mockbin/bun"
SCENARIO_PATH=$dir_nobun/mockbin:/usr/bin:/bin
export SCENARIO_PATH
capture "$dir_nobun" start start "$dir_nobun/melete"
unset SCENARIO_PATH
[ "$last_status" -eq 1 ] || say_fail "no bun: exit $last_status, expected 1"
grep -q 'bun not found' "$dir_nobun/start.err" || say_fail 'no bun: the tool is not named'
grep -q 'https://bun.sh' "$dir_nobun/start.err" || say_fail 'no bun: the remedy is not named'

# Scenario 9: no checkout pointer and no argument.
dir_nopointer=$(scenario_dir no-pointer)
capture "$dir_nopointer" start start
[ "$last_status" -eq 1 ] || say_fail "no checkout: exit $last_status, expected 1"
grep -q 'start <path-to-Melete> once' "$dir_nopointer/start.err" || say_fail 'no checkout: the remedy is not named'

# Scenario 10: --no-open leaves the browser alone.
dir_noopen=$(scenario_dir no-open)
git -C "$dir_noopen/project" init -q
capture "$dir_noopen" start start "$dir_noopen/melete" --no-open
[ "$last_status" -eq 0 ] || say_fail "--no-open: exit $last_status, stderr: $(cat "$dir_noopen/start.err")"
grep -q '^browser skipped$' "$dir_noopen/start.out" || say_fail '--no-open: the browser was not reported as skipped'
[ ! -f "$dir_noopen/mock/open.log" ] || say_fail '--no-open: the browser was opened anyway'
capture "$dir_noopen" stop stop

# Scenario 11: the pointer written by the first start is read by the next one.
dir_pointer=$(scenario_dir pointer)
capture "$dir_pointer" first start "$dir_pointer/melete" --no-open
[ "$last_status" -eq 0 ] || say_fail "pointer write: exit $last_status, stderr: $(cat "$dir_pointer/first.err")"
grep -qx "$dir_pointer/melete" "$dir_pointer/home/.mneme/melete/checkout" ||
  say_fail 'pointer write: the pointer does not hold the checkout'
capture "$dir_pointer" stop1 stop
capture "$dir_pointer" second start --no-open
[ "$last_status" -eq 0 ] || say_fail "pointer read: exit $last_status, stderr: $(cat "$dir_pointer/second.err")"
grep -q '^url http://127\.0\.0\.1:4310$' "$dir_pointer/second.out" || say_fail 'pointer read: no url line'
capture "$dir_pointer" stop2 stop

# Scenario 12: MELETE_HOME wins over the pointer.
dir_env=$(scenario_dir melete-home)
mkdir -p "$dir_env/melete2/src" "$dir_env/home/.mneme/melete"
printf 'console.log("second fake");\n' >"$dir_env/melete2/src/main.ts"
printf '%s\n' "$dir_env/nowhere" >"$dir_env/home/.mneme/melete/checkout"
SCENARIO_MELETE_HOME=$dir_env/melete2
export SCENARIO_MELETE_HOME
capture "$dir_env" start start --no-open
[ "$last_status" -eq 0 ] || say_fail "MELETE_HOME: exit $last_status, stderr: $(cat "$dir_env/start.err")"
capture "$dir_env" stop stop
unset SCENARIO_MELETE_HOME

# Scenario 13: the .gitignore line is appended once, to a file without a
# trailing newline, and a non-git project is skipped.
dir_ignore=$(scenario_dir gitignore)
git -C "$dir_ignore/project" init -q
printf 'node_modules' >"$dir_ignore/project/.gitignore"
capture "$dir_ignore" first start "$dir_ignore/melete" --no-open
grep -q '^gitignore added$' "$dir_ignore/first.out" || say_fail 'gitignore: the line was not added'
grep -qx 'node_modules' "$dir_ignore/project/.gitignore" || say_fail 'gitignore: the existing line was damaged'
[ "$(grep -cx '\.melete/' "$dir_ignore/project/.gitignore")" = 1 ] || say_fail 'gitignore: the line is not there exactly once'
capture "$dir_ignore" stop1 stop
capture "$dir_ignore" second start --no-open
grep -q '^gitignore present$' "$dir_ignore/second.out" || say_fail 'gitignore: the second start did not report present'
[ "$(grep -cx '\.melete/' "$dir_ignore/project/.gitignore")" = 1 ] || say_fail 'gitignore: the line was appended twice'
capture "$dir_ignore" stop2 stop
dir_nogit=$(scenario_dir no-git)
capture "$dir_nogit" start start "$dir_nogit/melete" --no-open
grep -q '^gitignore skipped$' "$dir_nogit/start.out" || say_fail 'gitignore: a non-git project was not skipped'
[ ! -f "$dir_nogit/project/.gitignore" ] || say_fail 'gitignore: a non-git project got a .gitignore'
capture "$dir_nogit" stop stop

if [ "$failures" -gt 0 ]; then
  printf 'check-design-server: %d failure(s)\n' "$failures" >&2
  exit 1
fi
printf 'check-design-server: all 15 launcher scenarios passed.\n'
