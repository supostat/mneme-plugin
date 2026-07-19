---
name: mneme:resume
description: orient in the current task graph and stop — show closed/ready/blocked phases and the command to continue, without acting
allowed-tools: [Read, Grep]
disable-model-invocation: true
---

# /mneme:resume — Orient in the current task graph, then stop

Read-only ORIENTATION. It reads the current git branch, finds the branch's active run in mneme's
event log, reconstructs the phase map (closed / ready / blocked / paused-on-boundary) plus the
staged-but-unaccepted notes, and SUGGESTS the `/mneme:dev` continuation in REAL syntax — slug +
`until`, with boundary candidates per the shared GRAPH-MAP convention — but it NEVER continues and
NEVER mutates anything. It answers "where am I", not "carry on".

The internal read-only posture is borrowed from `/mneme:arch`. The difference from `/mneme:dev`
with no argument is the whole point: dev CONTINUES (it calls `workflow_step` and drives the loop);
resume ORIENTS and STOPS. See `### RESUME-VS-DEV`.

## Arguments

`/mneme:resume` — no argument. It orients on the CURRENT git branch's active run. There is nothing
to pass; the branch selects the run.

## Permissions (VIOLATION = ABORT) — ORIENT-ONLY

- Read / Grep: YES — the branch, the event log, and the phase files are all read-only inputs.
- `workflow_start` / `workflow_step` / any submission: FORBIDDEN — resume NEVER drives the engine.
  It does not start, sync, advance, retry, or submit anything.
- Edit / Write / Bash / any change on disk: FORBIDDEN — resume changes nothing, anywhere.
- `recall` / `remember` / any memory tool: FORBIDDEN.

This is ORIENT-ONLY: resume builds a map and STOPS. Acting on the map is `/mneme:dev`'s job, on the
user's next move — never resume's.

## Procedure

### Step 1: current branch

Read `.git/HEAD`. A normal checkout reads `ref: refs/heads/<branch>` — that `<branch>` scopes the
run. A detached HEAD reads a bare SHA; say so (Russian) and stop — there is no branch-scoped run to
map.

### Step 2: locate the active run in the event log

The event log is `~/.mneme/<project-slug>/events/<YYYY-MM>.jsonl` — an append-only JSONL, one file
per month. `<project-slug>` is the repo root's absolute path with every `/` replaced by `-`, which
yields a leading `-` (a repo root ending in `…/Projects/mneme-plugin` becomes
`-…-Projects-mneme-plugin`). Read the current month's file; if it is absent or the run began earlier,
also read the prior month(s).

Filter events by `"branch":"<branch>"`. The ACTIVE run is the `run_id` of the LATEST
`"type":"workflow_run_started"` event for that branch.

### Step 3: phase graph + closed set

From that run's `workflow_run_started` event, read `definition.phases[]` — each entry is
`{ id, deps, … }`, the engine's own record of the graph it ran (the phase folder
`~/.mneme/<project-slug>/workflow/<spec-slug>/phase-*.md` is a SECONDARY confirmation, grep-able for
`id:` / `deps:`). Then scan `"type":"workflow_step_applied"` events carrying that `run_id`:

- a phase is CLOSED ⇔ it has a step_applied with `"result_kind":"harvest"` (its harvest was
  submitted);
- `"result_kind":"execute_step"` with `gates.passed:true` = that phase's gate PASSED (closing next);
  with `gates.passed:false` = a failed attempt (the engine is retrying);
- `"result_kind":"recall"` is neither — it is just recall emission.

### Step 4: build the map

- **closed** — phases with a harvest step_applied.
- **ready** — every `dep` is closed AND the phase itself is not closed.
- **blocked** — at least one `dep` is not yet closed (name the blocking deps).
- **paused-on-boundary** — the run is still `running` but its LATEST applied event is a closed
  phase's harvest (or the next phase's recall emission) with no execute_step submission after it:
  the driving loop ceased at a boundary. The pending phase's recall is already issued and is NOT
  drained by waiting — resuming is safe.
- **staged-unaccepted** — notes queued under `<corpus>/staging/` (one file per note): count them
  and show one-line essences. They are waiting for the user's word; resume NEVER resolves them.

### Step 5: render, suggest, and STOP (ORIENT-ONLY)

Print the map and the continuation command in REAL `/mneme:dev` syntax — slug-first
(`/mneme:dev <spec-slug>` to a terminal, `/mneme:dev <spec-slug> until <id>` for a staged entry),
with `until` BOUNDARY CANDIDATES picked per the shared GRAPH-MAP convention (defined once, in the
`mneme:migrate` skill): foundation phases by dependent count and stack seams. Then STOP. Do NOT run
the command, do NOT call the engine, do NOT submit anything. The turn ends; acting on the map is
the user's next move via `/mneme:dev`.

### RESUME-VS-DEV — orientation vs continuation

Both read the same branch run from the same event log, but with OPPOSITE intents:

- `/mneme:resume` = "where am I" — READ-ONLY: it builds the closed/ready/blocked map and STOPS. It
  never touches the engine.
- `/mneme:dev` (no argument) = "carry on" — it calls `workflow_step`, drives the loop, and ACTS on
  the pending directive until a terminal.

resume ends by SUGGESTING the command; dev EXECUTES it. resume must never cross into continuation —
that erasure of the "orient before you act" pause is exactly what this separation protects.

## Output format

Russian runtime (per the user's global ru-RU rule). Display as plain markdown (NOT inside a code
fence). The map below is resume's layer-3 template per the shared five-block grammar (DEFINED once
in the `mneme:dev` skill's `## OUTPUT-GRAMMAR` section — never re-stated here): STATUS (the
Context line) + DATA (карта фаз, staged count, the suggested command) and NO DECISION — resume не
спрашивает, оно останавливается; a suggested command is DATA, not a menu. Fill the placeholders,
never restructure:

## RESUME: <spec / run short form>

**Context** — Project · Branch · run_id · status (running / complete / …)

**Карта фаз**
- ✅ closed: `<ids>`
- ▶ ready: `<ids>`
- ⛔ blocked: `<ids>` (ждёт: `<dep ids>`)
- ⏸ paused-on-boundary: `<pending id>` (директива/recall выданы, цикл остановлен — ждёт слова)
- 🗃 staged-непринятое: `<N>` заметок (однострочники)

**Продолжить** — реальный синтаксис, slug-first: `/mneme:dev <spec-slug>` (до терминала) или
`/mneme:dev <spec-slug> until <id>` (кандидаты границ — по GRAPH-MAP-конвенции), либо голый
`/mneme:dev` (resume текущей ветки) + одна строка, что команда сделает. Это ПОДСКАЗКА — resume её
не запускает.

If NO run is found for the branch: say so (Russian) — there is no active task on this branch — and
suggest the entry path `/mneme:plan` → migrate → `/mneme:dev`. Never fabricate a map.

### Pinned sources & caveats

- Event schema is pinned to mneme `schema_version` 5:
  `workflow_run_started.definition.phases[].{id,deps}` and
  `workflow_step_applied.{run_id,branch,phase_id,result_kind∈{execute_step,harvest,recall},gates.passed,harvested_n}`;
  CLOSED ⇔ a `harvest` step_applied. If a log's `schema_version` differs, FLAG it and re-pin these
  field names rather than guessing.
- slug derivation, month-file selection, and run↔branch matching are exactly as in Step 2.
- staged-unaccepted comes from `<corpus>/staging/` (one file per queued note) — a read-only listing;
  resolution happens elsewhere (a `/mneme:dev` boundary stop or the user's own word), never here.
- KNOWN OPEN-RISK: this couples resume to mneme's internal event-log format. The clean decoupling — a
  read-only `workflow_status` projection exposed by the engine itself — is FUTURE work, NOT v1.
- NOT v1: multi-run forensics, stale-run analysis, and surfacing open questions carried from past
  sessions. v1 orients on the SINGLE active run of the current branch.

### Language

Print user-facing text in Russian; keep engine/protocol tokens (`workflow_run_started`,
`workflow_step_applied`, `result_kind`, `/mneme:dev`) literal.

## Rules

- ORIENT-ONLY — build the map and STOP; never act. `workflow_start` / `workflow_step` / submit,
  Edit / Write / Bash, and `recall` / `remember` are ALL forbidden. VIOLATION = ABORT.
- READ-ONLY SOURCES — branch from `.git/HEAD`; graph + closed-set from the event log (phase folder
  secondary). Read / Grep only, nothing else.
- RESUME-VS-DEV — resume answers "where am I" and STOPS; `/mneme:dev` answers "carry on" and ACTS.
  resume SUGGESTS the command, it never runs it.
- REAL SYNTAX — the suggested continuation is a runnable `/mneme:dev` command, never pseudocode.
- EVIDENCE-BASED — the map reflects ACTUAL log events; if the log is missing or unreadable, say so,
  do not guess.
- SCHEMA-PINNED — event field names are pinned to a `schema_version`; flag a mismatch instead of
  silently misreading.
- LANGUAGE: English body + Russian runtime user-facing output.
