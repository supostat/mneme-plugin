---
name: design-server
description: start, stop or inspect the Melete design server for the current project and hand back its chat URL
allowed-tools: [Read, Bash]
disable-model-invocation: true
---

# /mneme:design-server — Bring the Melete design server up for this project

A THIN WRAPPER over the bundled POSIX-sh launcher. The skill makes exactly ONE Bash call —
`sh <base-dir-скилла>/../../scripts/design-server.sh <команда> [аргументы]` — and renders the lines
that call printed. Every decision about state (is the pid alive, did /health answer, is the
checkout known, was the browser opened) lives INSIDE the script, which a gate covers scenario by
scenario. The skill adds ZERO logic of its own: no probing, no retrying, no second call, no guessing
what a line means.

Its place in the pipeline: `/mneme:design` designs pages as HTML etalons in `design/`, and this
launcher brings up the Melete server that hosts the same design work as a chat in the browser.

## Arguments

`/mneme:design-server [start [<путь-к-чекауту-Melete>] [--port N] [--task SLUG] [--no-open] | stop | status]`

- `start` — bring the server up and print its URL. The checkout path is needed ONCE: the script
  remembers it and later starts read it back. `--port N` overrides the port the server would pick,
  `--task SLUG` names the design task (default `design`), `--no-open` leaves the browser alone.
- `stop` — stop the server of this project.
- `status` — one line about the current state.
- NO ARGUMENT AT ALL = `start` with no path: the launcher is asked to do the thing it exists for,
  and a repeat is safe — a running server answers «already running» with the same URL instead of a
  second launch.

The project is always the CURRENT directory: the script takes the target project from its own cwd,
so the skill passes no project path and never derives one.

## Permissions (VIOLATION = ABORT)

- Bash: YES, but ONLY the single invocation
  `sh <base-dir-скилла>/../../scripts/design-server.sh <команда> [аргументы]`. Any other Bash — a
  probe of the pid, a `curl` of /health, a `kill`, a `git` call, a second invocation "to check" — is
  a VIOLATION: the script already did all of it and its lines are the answer.
- Read: YES — to show the user a file the script's error line points at (`.melete/server.out`,
  `.melete/server.log`) when they ask for more than the tail the script already printed.
- Edit / Write: FORBIDDEN — this skill changes nothing in the repo; the only file the launcher
  touches outside `.melete/` is the project's `.gitignore`, and the SCRIPT does that.
- `workflow_start` / `workflow_step` / any engine tool: FORBIDDEN.
- `recall` / `remember` / `staging_list` / `staging_resolve` / any memory tool: FORBIDDEN.

## Procedure — one call, one render

1. Map the argument to the script's command: no argument → `start`; otherwise pass `start`, `stop`
   or `status` and its flags through UNCHANGED, in the order the user gave them.
2. Run the ONE Bash call and keep three things: stdout, stderr, the exit code.
3. Render per `## Output format` and END THE TURN. Never call the script twice in one turn, and
   never turn a non-zero exit into a retry — the script's exit codes are answers, not failures to
   work around:
   - `start` — 0 is a running server (fresh or already up), 1 is a named refusal;
   - `status` — 0 running, 1 stopped, 2 a stale pid with its reason;
   - `stop` — always 0.

The script's stdout is a contract of `<ключ> <значение>` lines. Render them AS THEY CAME. Do not
re-order, re-word, translate or complete them, and never infer a value the script did not print —
if a line is unfamiliar, show it verbatim; an unknown line is data, not a puzzle.

## Output format

Russian runtime text (per the user's global ru-RU rule); the script's own lines and the URL stay
LITERAL, never translated. Message composition follows `## OUTPUT-GRAMMAR` in the `mneme:dev`
skill's SKILL.md — the single source of truth; this skill owns only the layer-3 templates below and
re-states no layer 1-2 rule.

FINALE-CLASS-INFORMATIONAL. Every turn of this skill is a finale of that class: it SHOWS what the
launcher did and stops. The URL is DATA, not a menu — the user's next move is the browser or
another call of this skill. There is NO DECISION block anywhere in this skill: no batch menu, no
clarifying menu, not even on an error, and therefore no TOKEN-LINE header either (that header
belongs to DECISION blocks, and this skill renders none).

**старт-успех** — PROSE (one line) + DATA (the script's stdout, verbatim):

````
Сервер Melete поднят для <корень проекта>.

```
<stdout скрипта дословно>
```
````

**уже-запущен** — the same shape, opened by «Сервер уже запущен для <корень проекта>.»; the
`already running` / `url` / `pid` lines come from the script unchanged.

**status / stop** — DATA only, the single contract line in a fenced block:

````
```
<stdout скрипта дословно>
```
````

**ошибка** — PROSE (what the launcher refused, in one line, taken from the named stderr line) +
DATA (stderr verbatim, tail included). The script's error lines already name their remedy, so the
render carries it instead of inventing advice:

````
Лаунчер отказал: <суть именованной строки>.

```
<stderr скрипта дословно, включая хвост server.out>
```
````

## Rules

- ONE CALL PER TURN — one Bash invocation of the bundled script, then a render, then the turn ends.
  A second call, a probe or a retry is a VIOLATION.
- THE SCRIPT DECIDES — liveness, the checkout, the port, the browser and the `.gitignore` line are
  the script's business; the skill neither repeats nor second-guesses them, and never parses JSON.
- RENDER VERBATIM — the contract lines and the error lines are shown as printed; an unknown line is
  shown too, never dropped and never interpreted.
- EXIT CODES ARE ANSWERS — 0/1/2 map to states, not to work to be redone; the skill never retries.
- FINALE-CLASS-INFORMATIONAL — the turn shows and stops; the URL is DATA. No DECISION block, no
  menu, no TOKEN-LINE header anywhere in this skill.
- NO ABSOLUTE PATHS in this text: the script is addressed through the base-dir idiom, and every
  runtime path comes from the script's own output.
- `disable-model-invocation: true` — the launcher starts a long-lived process, so it runs only when
  the user asks for it by name.
- LANGUAGE: English body + Russian runtime user-facing output; the script's lines stay literal.
