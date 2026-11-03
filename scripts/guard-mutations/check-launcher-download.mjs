const launcher = 'plugin/bin/launch.sh';
const trapLine = 'trap abandon_download INT TERM HUP';
const killCurl = '  kill "$curl_pid" 2>/dev/null || true\n';
const reapCurl = '  wait "$curl_pid" 2>/dev/null || true\n';

export const guard = ['sh', 'scripts/check-launcher.sh'];

export const mutations = [
  {
    label: 'the sweep keeps the temp file of a dead launcher',
    file: launcher,
    find: '|| rm -f "$orphan"',
    replace: '|| :',
    expect: 'orphan-sweep: the temp file of a dead launcher was left',
  },
  {
    label: 'the sweep no longer asks whether the launcher is alive',
    file: launcher,
    find: 'kill -0 "$orphan_pid" 2>/dev/null || rm -f "$orphan"',
    replace: 'rm -f "$orphan"',
    expect: 'orphan-sweep: the temp file of a live launcher was removed',
  },
  {
    label: 'the sweep treats a non-pid suffix as a pid',
    file: launcher,
    find: "'' | *[!0-9]*) continue ;;",
    replace: "'') continue ;;",
    expect: 'orphan-sweep: a temp file without a pid suffix was removed',
  },
  {
    label: 'the sweep reads the pid after the last dot of any name',
    file: launcher,
    find: 'orphan_pid=${orphan#"$cache_dir/.mneme-$target."}',
    replace: 'orphan_pid=${orphan##*.}',
    expect: 'orphan-sweep: a file outside the .mneme-<target>.<pid> form was removed',
  },
  {
    label: 'a temp file that cannot be removed stops the launcher',
    file: launcher,
    find: 'rm -f "$orphan" 2>/dev/null || true',
    replace: 'rm -f "$orphan"',
    expect: 'orphan-sweep-readonly: a temp file that cannot be removed blocked the start',
  },
  {
    label: 'the sweep runs only on a cache miss',
    file: launcher,
    find: '\nremove_orphan_downloads\n',
    replace: '\n[ -x "$cache_bin" ] || remove_orphan_downloads\n',
    expect: 'orphan-sweep: the temp file of a dead launcher was left',
  },
  {
    label: 'TERM is no longer trapped during the download',
    file: launcher,
    find: trapLine,
    replace: 'trap abandon_download INT HUP',
    expect: 'interrupt-TERM: the temp file was left',
  },
  {
    label: 'HUP is no longer trapped during the download',
    file: launcher,
    find: trapLine,
    replace: 'trap abandon_download INT TERM',
    expect: 'interrupt-HUP: the temp file was left',
  },
  {
    label: 'the trap waits for curl without killing it',
    file: launcher,
    find: killCurl,
    replace: '',
    expect: 'interrupt-TERM: the launcher did not exit after the signal',
  },
  {
    label: 'the trap leaves curl running',
    file: launcher,
    find: killCurl + reapCurl,
    replace: '',
    expect: 'interrupt-TERM: curl outlived the launcher',
  },
  {
    label: 'the interrupted download is no longer named on stderr',
    file: launcher,
    find: 'download interrupted by a signal',
    replace: 'download stopped by a signal',
    expect: 'interrupt-TERM: stderr does not name the interrupted download',
  },
];
