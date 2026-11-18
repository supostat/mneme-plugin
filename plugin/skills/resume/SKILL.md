---
name: resume
description: orient on the current branch's run and stop — one read-only workflow_survey call plus the run's spec from workflow_spec, rendered as a closed/ready/blocked map with the command to continue, without acting
allowed-tools: [mcp__plugin_mneme_memory__workflow_survey, mcp__plugin_mneme_memory__workflow_spec]
disable-model-invocation: true
---

# /mneme:resume — Orient on the current branch's run, then stop

Read-only ORIENTATION. One call to the engine's read-only survey tool answers "where am I" for the
CURRENT git branch: the unfinished run, its pending directive, the staged-note count, live runs on
other branches, anomalies, the last terminal run. The run's spec, read back from the engine with
one `workflow_spec` call, supplies the graph, from which the skill renders the closed / ready /
blocked map and the `until` boundary candidates, and SUGGESTS the `/mneme:dev` continuation in REAL
syntax. It never continues and never writes anything.

The difference from `/mneme:dev` with no argument is the whole point: dev CONTINUES (it calls
`workflow_step` and drives the loop); resume ORIENTS and STOPS. See `### RESUME-VS-DEV`.

## Arguments

`/mneme:resume` — no argument. The engine reads the branch itself (`git branch --show-current`);
there is nothing to pass.

## Permissions (VIOLATION = ABORT) — ORIENT-ONLY

ORIENT-ONLY means WRITES NOTHING: no event, no file, no stale mark. The guarantee is not "never
touches the engine" — it is "nothing is written", and the two engine tools granted here satisfy it
by construction, both read-only.

- `mcp__plugin_mneme_memory__workflow_survey`: YES — read-only by construction: it reads the
  engine's own state and git, and writes nothing (the engine's e2e suite proves the corpus tree is
  byte-identical before and after the call, brief and map alike, detached HEAD included). Calling
  it drains nothing and advances nothing.
- `mcp__plugin_mneme_memory__workflow_spec`: YES — ONLY `{ run_id }` of the branch's unfinished
  run, ONCE, in Step 4. Read-only by construction: it renders the spec the run's start recorded
  and writes nothing.
- Verify both names against the session's tool registry after a reconnect.
- `workflow_start` / `workflow_step` / `workflow_abandon` / `workflow_migrate` / any submission:
  FORBIDDEN — resume never starts, syncs, advances, retries, or submits anything.
- `recall` / `remember` / `staging_list` / `staging_resolve` / any other memory tool: FORBIDDEN.
- Read / Grep / Edit / Write / Bash / any change on disk: FORBIDDEN — every map line comes from
  the two engine answers, never from a file.

resume builds a map and STOPS. Acting on the map is `/mneme:dev`'s job, on the user's next move.

## Procedure

### Step 1: survey

Call `mcp__plugin_mneme_memory__workflow_survey {}` — the map form, not `brief`. The answer is
plain text; every map line below comes from it or from the run's spec (Step 4), never from
anywhere else.

### Step 2: off-branch answers — relay and stop

A detached HEAD answers `HEAD is detached: workflow runs are branch-scoped, so there is no branch
to survey. No run state was read or changed.`; a git failure answers `git failed to resolve the
current branch; no run state was read or changed.`. Both are informational, not errors. Say so
(Russian) and STOP — there is no branch-scoped run to map, and the skill never inspects git itself.

### Step 3: read the survey lines

The engine renders fixed line shapes (pinned by its own tests). Take from them:

- `Survey of branch "<b>". Nothing was written: no event, no file, no stale mark.` — the branch;
- the active run, three lines: `Active run <id> status=<status> iterations=<used>/<max>`,
  `started <ts> · last activity <ts>`, `phase <id> · pending: <directive>` where the directive is
  one of `execute_step <phase>/<step> attempt N`, `harvest for phase <id>`,
  `recall for phase <id>` — or instead `No unfinished workflow run on branch "<b>".`;
- `Staged notes awaiting review: N` — staged notes plus pending retire / re-anchor / retag
  requests;
- `ready: n phases (<ids>) — …` — present ONLY when two or more phases are ready; when exactly one
  is ready, it is the pending phase and no such line appears;
- `Paused runs on other branches:` with `- run <id> [branch "<b>"] …` lines — live runs of
  other existing branches (a parallel working copy shows up here);
- `WARNING: could not verify that branch …`, `LOG ANOMALIES:` with its lines,
  `ORPHAN CANDIDATES (not yet marked):` with `- run <id> on branch "<b>": branch not found — …`
  lines — informational, relayed as is, never acted on; orphans are only REPORTED here (the next
  `workflow_start` / `workflow_step` marks them), and a `STALE RUNS` section never appears in a
  survey;
- `Last terminal run on this branch: <id> [<status>].` and
  `Stale runs on this branch: K (never resumable).` — one line each, when there is something to
  show.

A line that is absent produces no map line; a line of an unfamiliar shape is relayed verbatim with
a note, never interpreted.

### Step 4: the run's spec — `workflow_spec { run_id }`

Only when Step 3 found an unfinished run: call `mcp__plugin_mneme_memory__workflow_spec { run_id }`
ONCE, with the id of the `Active run <id>` line. The engine renders the spec the run's start
recorded; resume computes no corpus path and reads no file. Take from the answer:

- the spec line `spec <slug>|none|not recorded · base commit <sha>|none|not recorded` — its
  `<slug>` heads the map; `spec none` or `spec not recorded` heads it with the branch instead;
- the graph — every phase line, `phase <id> · deps <a>, <b>` or `phase <id> · deps none`, which
  the engine prints after the phases it depends on; the phase ids and their deps are all Step 5
  needs. The criteria under each phase and the `knowledge:` block are dev's frame: resume prints
  neither;
- a NON-ANSWER (`Run <id> cannot be read from the log: …`, `No workflow run <id> in this corpus.
  …`, `run_id is not a ULID or UUID. …`) → no graph: the map carries the line
  `граф: <ответ workflow_spec дословно>` in place of the closed / ready / blocked lines, no `until`
  candidates are printed, and the continuation hint is the bare `/mneme:dev` and
  `/mneme:dev until <pending-id>`.

Without an unfinished run there is no run id, so no call happens: a terminal run is reported by its
`Last terminal run` line alone.

### Step 5: the table from the ready set and the deps

The phases and their deps are the phase lines of Step 4.

- ready = the ids of the `ready:` line, otherwise exactly {the pending phase} — a phase pending
  `harvest` or `recall` is still open, so it is ready, not closed;
- closed = the fixpoint of "not ready, and every dep already closed" — phases with no deps that
  are not ready close first, then the phases whose deps are all closed, and so on;
- blocked = everything else (name the open deps).

The rule holds because the engine prints EVERY ready phase when more than one is ready, and
exactly the pending phase when one is. `until` boundary candidates follow the shared GRAPH-MAP
convention (defined once, in the `mneme:migrate` skill) over the phases that are NOT closed:
foundation phases by dependent count and seams of the stack; the pending phase is always the first
candidate ("close the current phase and stand").

### Step 6: suggest, and STOP

Print the map and the continuation command in REAL `/mneme:dev` syntax (DATA, never a menu):

- an unfinished run: `/mneme:dev` — continue the branch's run to a terminal;
  `/mneme:dev until <pending-id>` — close the current phase and stop; with a resolved graph,
  `/mneme:dev until <id>` per boundary candidate. No slug is needed for an existing run, and none
  is invented;
- no unfinished run: the last terminal run, the staged count and the other branches as the survey
  gave them; the entry path is `/mneme:plan` → migrate → `/mneme:dev <spec-slug>` — the slug is
  known to the plan/migrate finale, never guessed here.

Then STOP. Do NOT run the command, do NOT call the engine again, do NOT submit anything.

### RESUME-VS-DEV — orientation vs continuation

Both look at the same branch run through the same engine, with OPPOSITE intents:

- `/mneme:resume` = "where am I" — one read-only survey, at most one read-only spec call, a map,
  and a full stop. It never touches `workflow_step`.
- `/mneme:dev` (no argument) = "carry on" — it calls `workflow_step`, drives the loop, and ACTS on
  the pending directive until a terminal.

resume ends by SUGGESTING the command; dev EXECUTES it. resume must never cross into continuation —
that erasure of the "orient before you act" pause is exactly what this separation protects.

## Output format

Russian runtime (per the user's global ru-RU rule). Display as plain markdown (NOT inside a code
fence). The map below is resume's layer-3 template per the shared five-block grammar (DEFINED once
in the `mneme:dev` skill's `## OUTPUT-GRAMMAR` section — never re-stated here): STATUS (the Context
line) + DATA (the map, the staged count, the suggested command) and NO DECISION — resume asks
nothing, it stops; a suggested command is DATA, not a menu. FINALE-CLASS-INFORMATIONAL: resume
creates nothing — it only shows; the orient-and-stop contract exempts it from HANDOFF-DECISION.
Fill the placeholders, never restructure; a line with no data is omitted:

## RESUME: <spec-slug | branch> / run <id-short>

**Context** — Project · Branch · run_id · status · iterations <used>/<max> · started <ts> · last
activity <ts>

**Карта фаз**
- ✅ closed: `<ids>`
- ▶ ready: `<ids>` · pending: `<директива движка дословно>`
- ⛔ blocked: `<ids>` (ждёт: `<dep ids>`)
- `граф: <ответ workflow_spec дословно>` (only on a non-answer, instead of the three lines above)
- 🗃 staged: `<N>`
- 🌐 другие ветки / сироты / предупреждения / аномалии: the survey's lines, one each, relayed —
  never acted on
- 🏁 последний терминальный run: `<id> [<status>]` · stale на ветке: `<K>`

**Продолжить** — `/mneme:dev` (до терминала) · `/mneme:dev until <pending-id>` (закрыть текущую
фазу и встать) · `/mneme:dev until <id>` по кандидатам границ + one line on what the command does.
This is a HINT — resume never runs it.

If the survey reports NO unfinished run: say so (Russian), show the last terminal run, the staged
count and the other-branch lines, and suggest the entry path `/mneme:plan` → migrate →
`/mneme:dev <spec-slug>`. Never fabricate a map.

### Honest limit

The coupling to the engine's log format and to the corpus layout is gone. What remains is a
coupling to the SHAPE of the survey's rendered lines and of `workflow_spec`'s spec and phase lines
(HANDOFF-RUN-SPEC-SHAPE), both pinned by the engine's own tests. A drift shows up as an odd map
line or a degraded graph, never as a wrong action — resume does nothing. Staged-note essences are not printed here: the count is the
engine's, the notes themselves belong to curation (the digit menus of plan / fix / dev).

### Language

Print user-facing text in Russian; keep engine/protocol tokens (`workflow_survey`, `Active run`,
`pending:`, `/mneme:dev`) literal.

## Rules

- ORIENT-ONLY = WRITES NOTHING — one read-only survey call, at most one read-only spec call, a
  map, and a STOP. `workflow_start` / `workflow_step` / `workflow_abandon` / `workflow_migrate` /
  submit, `recall` / `remember` / staging tools, Read / Grep / Edit / Write / Bash are ALL
  forbidden. VIOLATION = ABORT.
- TWO READ-ONLY ENGINE TOOLS — `mcp__plugin_mneme_memory__workflow_survey {}` once, and
  `mcp__plugin_mneme_memory__workflow_spec { run_id }` once for the branch's unfinished run; no
  file is read, no corpus path is computed.
- RESUME-VS-DEV — resume answers "where am I" and STOPS; `/mneme:dev` answers "carry on" and ACTS.
  resume SUGGESTS the command, it never runs it.
- REAL SYNTAX — the suggested continuation is a runnable `/mneme:dev` command, never pseudocode,
  and never a guessed slug.
- EVIDENCE-BASED — every map line comes from the survey or the run's spec; a non-answer of
  `workflow_spec` degrades to the named `граф:` line, never to a guess.
- LANGUAGE: English body + Russian runtime user-facing output.
