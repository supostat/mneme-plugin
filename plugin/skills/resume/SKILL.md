---
name: resume
description: orient on the current branch's run and stop — one read-only workflow_survey call plus the phase folder, rendered as a closed/ready/blocked map with the command to continue, without acting
allowed-tools: [Read, Grep, mcp__plugin_mneme_memory__workflow_survey]
disable-model-invocation: true
---

# /mneme:resume — Orient on the current branch's run, then stop

Read-only ORIENTATION. One call to the engine's read-only survey tool answers "where am I" for the
CURRENT git branch: the unfinished run, its pending directive, the staged-note count, live runs on
other branches, anomalies, the last terminal run. The phase folder of that run (its `phase-*.md`
files in the corpus) supplies the graph, from which the skill renders the closed / ready / blocked
map and the `until` boundary candidates, and SUGGESTS the `/mneme:dev` continuation in REAL syntax.
It never continues and never writes anything.

The difference from `/mneme:dev` with no argument is the whole point: dev CONTINUES (it calls
`workflow_step` and drives the loop); resume ORIENTS and STOPS. See `### RESUME-VS-DEV`.

## Arguments

`/mneme:resume` — no argument. The engine reads the branch itself (`git branch --show-current`);
there is nothing to pass.

## Permissions (VIOLATION = ABORT) — ORIENT-ONLY

ORIENT-ONLY means WRITES NOTHING: no event, no file, no stale mark. The guarantee is not "never
touches the engine" — it is "nothing is written", and the one engine tool granted here satisfies it
by construction.

- `mcp__plugin_mneme_memory__workflow_survey`: YES — the ONLY engine tool. Read-only by
  construction: it reads the engine's own state and git, and writes nothing (the engine's e2e suite
  proves the corpus tree is byte-identical before and after the call, brief and map alike, detached
  HEAD included). Calling it drains nothing and advances nothing. Verify the name against the
  session's tool registry after a reconnect.
- Read / Grep: YES, and ONLY for two targets — `.mneme.json` in the project root (the corpus name)
  and `<corpus>/workflow/*/phase-*.md` (the phase folders). Nothing else: not the engine's log, not
  git's internals, not staging.
- `workflow_start` / `workflow_step` / `workflow_abandon` / `workflow_migrate` / any submission:
  FORBIDDEN — resume never starts, syncs, advances, retries, or submits anything.
- `recall` / `remember` / `staging_list` / `staging_resolve` / any other memory tool: FORBIDDEN.
- Edit / Write / Bash / any change on disk: FORBIDDEN.

resume builds a map and STOPS. Acting on the map is `/mneme:dev`'s job, on the user's next move.

## Procedure

### Step 1: survey

Call `mcp__plugin_mneme_memory__workflow_survey {}` — the map form, not `brief`. The answer is
plain text; every map line below comes from it or from the phase folder, never from anywhere else.

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

### Step 4: the corpus and the phase folder — lookup by id, honest degradation

`<corpus>` is `~/.mneme/<name>/`. `<name>` is `corpus.name` from `.mneme.json` in the project root
(Read it if the file exists; the key is nested; pattern `^[a-z0-9][a-z0-9_-]{0,63}$`), otherwise
the real path of the project root with every `/` replaced by `-`, leading dash kept (a root
`…/Projects/example` becomes `-…-Projects-example`). The `MNEME_CORPUS_NAME` environment variable
overrides the name but is invisible to the skill — a miss then degrades honestly, below. Phase
folders are `<corpus>/workflow/<spec-slug>/phase-<id>.md`; the frontmatter holds one-line JSON
literals `id: "keep"`, `deps: ["pictures"]` (or `deps: []`), and no other identifying field.

The survey names no spec slug, so the folder is found by the phase ids it DID name:

- known ids = the pending phase from `phase <id> · pending: …`, plus the ids of the `ready:` line
  when it is present;
- Grep `^id: "<id>"` across `<corpus>/workflow/*/phase-*.md` for each known id; the candidates are
  the folders that contain ALL known ids;
- EXACTLY ONE candidate → spec-slug = the folder name; Grep `^(id|deps): ` across its `phase-*.md`
  for the graph;
- ZERO or SEVERAL candidates → no graph: the map carries the line
  `граф: папка фаз не определена однозначно — кандидаты: <slugs>` (or `— кандидатов нет`), the
  closed / blocked lines and the `until` candidates are not printed, and the continuation hint is
  the bare `/mneme:dev` and `/mneme:dev until <pending-id>`. Picking "the most recent" folder is
  FORBIDDEN: Read and Grep see no timestamps, and ids such as `wire` or `docs` live in most folders
  of a corpus — a guess would be a lie in the map.

Without an unfinished run there are no phase ids, so no lookup happens: a terminal run is reported
by its `Last terminal run` line alone.

### Step 5: the table from the ready set and the deps

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

- `/mneme:resume` = "where am I" — one read-only survey, a map, and a full stop. It never touches
  `workflow_step`.
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
- `граф: папка фаз не определена однозначно — кандидаты: <slugs>` (only on degradation, instead
  of the three lines above)
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

The coupling to the engine's log format is gone. What remains is a coupling to the SHAPE of the
survey's rendered lines (pinned by the engine's own tests) and to the phase-folder layout (pinned by
the engine's phase-document writer). A drift shows up as an odd map line or a degraded graph, never
as a wrong action — resume does nothing. Staged-note essences are not printed here: the count is the
engine's, the notes themselves belong to curation (the digit menus of plan / fix / dev).

### Language

Print user-facing text in Russian; keep engine/protocol tokens (`workflow_survey`, `Active run`,
`pending:`, `/mneme:dev`) literal.

## Rules

- ORIENT-ONLY = WRITES NOTHING — one read-only survey call, a map, and a STOP. `workflow_start` /
  `workflow_step` / `workflow_abandon` / `workflow_migrate` / submit, `recall` / `remember` /
  staging tools, Edit / Write / Bash are ALL forbidden. VIOLATION = ABORT.
- ONE ENGINE TOOL — `mcp__plugin_mneme_memory__workflow_survey` is the only engine call; Read /
  Grep touch only `.mneme.json` and `<corpus>/workflow/*/phase-*.md`.
- RESUME-VS-DEV — resume answers "where am I" and STOPS; `/mneme:dev` answers "carry on" and ACTS.
  resume SUGGESTS the command, it never runs it.
- REAL SYNTAX — the suggested continuation is a runnable `/mneme:dev` command, never pseudocode,
  and never a guessed slug.
- EVIDENCE-BASED — every map line comes from the survey or the resolved phase folder; an ambiguous
  folder degrades to a named line, never to a guess.
- LANGUAGE: English body + Russian runtime user-facing output.
