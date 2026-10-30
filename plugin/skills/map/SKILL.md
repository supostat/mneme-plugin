---
name: map
description: build or refresh the project map section by section — a static graph script clusters the files, a fresh subagent describes each cluster, and every domain or flow is written to the engine only on the user's digit
allowed-tools: [Read, Grep, Bash, Task, mcp__plugin_mneme_memory__map_list, mcp__plugin_mneme_memory__map_put, mcp__plugin_mneme_memory__map_delete]
disable-model-invocation: true
---

# /mneme:map — Build or refresh the project map, one digit per section

The project map is the engine's synthetic layer: domain sections (one area of the project each)
and flow sections (one path across domains each), stored in the corpus and served by `recall`
BEFORE the notes. This skill PRODUCES that layer: a deterministic graph script clusters the files
the repository tracks, a fresh subagent per cluster writes the section draft, and the user
accepts, renames, merges or rejects EVERY section by digit before `map_put` stores it. The consumer
of the map is the agent, never a human: a question about how the project is built goes through
`recall`, and `/mneme:plan` narrows its recall by the domains this skill wrote.

The gate lives HERE, in the plugin: the engine's `map_put` has no human gate (the map is a
synthetic layer the plugin rebuilds), so this skill's digit menus ARE the gate — ни один раздел не
пишется без цифры. Progress lives in the map itself: every accepted section is stored at once,
and a re-run after an interruption skips what is already covered.

## Arguments

`/mneme:map` — no arguments. Whether the run is a PRIMARY analysis or an UPDATE is decided by the
map itself in Step 0, never by a flag.

## Permissions (VIOLATION = ABORT)

- `mcp__plugin_mneme_memory__map_list`: YES — `{}` for the overview, `{ id }` for one section.
- `mcp__plugin_mneme_memory__map_put`: ONLY after the user's explicit DIGIT on THAT section
  (`1 — принять`, or the re-shown draft after `2 — переименовать` / `3 — слить с …`). A put
  without a digit is a VIOLATION. The call carries NO `menu` payload — the tool has no such field
  (an honestly uncovered menu, like the commit menu of dev).
- `mcp__plugin_mneme_memory__map_delete`: ONLY for the section a digit-chosen rename or merge
  absorbed, and only when that section was already stored. Never as a cleanup.
- Bash: THREE carve-outs and nothing else — (1) the graph script,
  `node <base-dir-скилла>/../../scripts/project-graph.mjs …`; (2) `git diff --name-only
  <commit>..HEAD` in UPDATE mode, to intersect stored anchors with the files changed since a
  section was written; (3) the session-tokens script: the read-only TOKEN-LINE call before every
  DECISION block and this skill's own RUN-COST bearer calls (`--mark map-…` right after Step 0,
  `--delta map-… --label карта` on the finale). Any other Bash — tests, installs, git writes — is
  FORBIDDEN.
- Task: YES, but ONLY to spawn a cluster describer per `### CLUSTER-SPAWN` — a FRESH spawn per
  cluster, at most 4 running at once, and each one answers from the files alone: a spawn never
  calls an engine tool and never writes anything.
- Read / Grep: YES — the main agent reads a cluster's files only to judge a draft (does the claimed
  entry point exist, which neighbour is the right merge target) and the project's `docs/` specs for
  flows. Reading to REWRITE a draft by hand is not this skill's job: a draft the main agent
  disagrees with is re-spawned with the objection, or rejected.
- Write / Edit: FORBIDDEN — the map lives in the corpus, and the project tree is never touched.
  The corpus files `map/`, `INDEX.md`, `glossary.md` are the ENGINE's: `INDEX.md` and
  `glossary.md` are derived and rewritten on every put, and `map/` is written only through
  `map_put`. Touching any of them on disk is a VIOLATION.
- `recall` / `remember` / staging tools / workflow tools: FORBIDDEN — the map is produced from
  the code, and curation here is by digit, not by staging.

## Procedure

### Step 0: `map_list {}` — primary or update

Call `mcp__plugin_mneme_memory__map_list {}` FIRST. The answer decides the mode:

- `The project map is empty.` → PRIMARY analysis: every cluster of the graph is new.
- otherwise → UPDATE: one line per section, `<id> [<kind>] anchors: N, dead: K, depends_on: …,
  terms: M — <первая строка>`, possibly `warning: depends_on of "<id>" names unknown section
  "<x>"` lines, and the closing `Bodies are not listed; call map_list with an id to read one
  section in full.` Read EVERY section whole with `map_list { id }`: its `anchors:` decide which
  clusters are already covered, its `commit:` is the project HEAD the section was written at.

Right after the answer, call the RUN-COST mark ONCE, silently (`### RUN-COST`):

```
node <base-dir-скилла>/../../scripts/session-tokens.mjs --cwd <корень-проекта> --mark map-<project-slug>
```

`<project-slug>` is the last path segment of the project root (`mneme-plugin` for
`…/Projects/mneme-plugin`) — deterministic, so a second `/mneme:map` in one session overwrites the
snapshot, which is the semantics «стоимость ТЕКУЩЕЙ карты».

### Step 1: the graph — one script call, its summary verbatim

PRIMARY:

```
node <base-dir-скилла>/../../scripts/project-graph.mjs --root <корень-проекта> --out <scratchpad>/project-graph.json
```

UPDATE — the graph is narrowed to what changed since the map was written:

- every stored section shares ONE `commit:` → `--since <commit>` on the same call;
- several distinct commits → one `git diff --name-only <commit>..HEAD` per distinct commit, the
  UNION of the paths, and `--changed <path,…>` on the same call;
- a `commit:` git no longer knows (history rewritten) → the full graph, as PRIMARY, with a PROSE
  line naming the section whose commit was lost.

The script prints ONE summary line — paste it VERBATIM to the user, it is the honest limit of the
graph: `project-graph: <N> files · <E> edges · <C> clusters · <languages> · <S> seams · LSP not
used: static graph; metaprogramming is invisible`, plus every `warnings` entry of the JSON as its
own line. Exit 2 (`is not inside a git repository`, a bad argument) is relayed verbatim and the
skill STOPS: there is no graph to map. The JSON holds `clusters[]` with `id`, `dirs`, `files`,
`symbols`, `edges_out`, `seams` and `draft { id, anchors, terms }`, and `seams[]` with `from`,
`to`, `kind`, `route`, `evidence`; in UPDATE mode only the touched clusters, each with
`changed_files`.

COVERED-SKIP: a cluster whose `dirs` ALL lie under the `anchors` of a stored domain (a directory
anchor without a trailing slash covers everything inside it) is already in the map. In PRIMARY
mode after an interruption it is reported as «принято ранее» and skipped; in UPDATE mode it is
re-described ONLY when its `changed_files` intersect those anchors — then the stored section is the
spawn's «предыдущая версия» and the put is a full replacement.

### Step 2: domains — `### CLUSTER-SPAWN`, one fresh spawn per cluster

For every cluster that is not covered, spawn ONE describer (Task) — fresh per cluster, at most 4
at once, the rest queued. The prompt is assembled in this FIXED order:

1. ROLE (literal): «описатель домена для карты проекта: читаешь только файлы своего кластера,
   пишешь раздел для агента, не для человека; каждый факт несёт путь файла; чего не знаешь — пишешь
   в «Открытые вопросы», не додумываешь; инструменты движка mneme не вызываешь; ничего не
   пишешь на диск».
2. INPUT: the cluster object from the JSON, verbatim — `id`, `dirs`, `files`, `symbols`,
   `edges_out`, `seams`, `draft` — and in UPDATE mode the stored section body as «предыдущая
   версия» with the `changed_files` list.
3. SHAPE — the etalon is the `domain-identity` skill of the boss plugin in STRUCTURE, never in
   text: the first line is the cluster's responsibility in ONE sentence (it becomes the section's
   line in `map_list`); then `## Сущности` (the classes and modules that matter, with paths),
   `## Инварианты` (what must always hold, with the predicate or validation that holds it),
   `## Точки входа` (controllers, routes, exported functions, jobs — the doors into the cluster),
   `## Зависимости` (the other clusters by their ids, from `edges_out` and `seams`, with what is
   taken from each), `## Открытые вопросы` (what the files do not answer). A heading with nothing
   under it is omitted.
4. LIMITS: read a file only where its NAME does not carry its meaning; LSP (`incomingCalls`,
   `findReferences`) on at most 20 symbols, never on the whole cluster; the body is at most 3000
   code points with a non-empty first line; at most 24 terms of at most 32 code points each, no
   duplicates, starting from `draft.terms` and adding only names the reading surfaced; anchors
   start from `draft.anchors` — up to 5 key files may be added, a directory is never removed.
5. RETURN (literal): one fenced JSON object `{ "id", "body", "anchors", "terms" }` and nothing
   else.

The main agent VALIDATES the return before it is offered: `id` matches
`^[a-z0-9][a-z0-9_-]{0,63}$`, body 1–3000 code points with a non-empty first line, terms ≤24 ×
≤32 without duplicates, anchors without a trailing slash. A draft outside the limits is re-spawned
ONCE with the limit named; a second miss is reported as «черновик не уложился в лимит» and the
cluster is skipped — never trimmed by hand into something nobody read.

### Step 3: flows — drafted by the main agent, from the edges and the specs

Flows are paths ACROSS domains, so they are drafted after the domains are curated, by the main
agent, from three sources: inter-cluster edges (`edges_out`), seams (a frontend literal hitting a
route — `seams[].route` and `evidence`), and the project's `docs/` specs when the directory exists
(Grep the accepted domain anchors across `docs/*.md`; a spec naming paths of two or more domains
is a flow candidate). Each flow draft: `kind: flow`, a slug `id`, `depends_on` = the ACCEPTED
domain ids on the path (a rejected domain cannot be depended on; a renamed one is named by its
new id), the body = the steps in order with the file of each hop, terms omitted — the glossary is
derived from the domains. A project with one accepted domain has no flows, and the step says so.

### Step 4: curation — every domain its own menu, flows as a list

Domains are shown ONE AT A TIME, in graph order (by cluster id), each with the раздел-меню
template (Output format) — the draft's head, its anchors, its terms count, its dependencies, the
TOKEN-LINE, then exactly these chips, answered by DIGIT ONLY:

- `1 — принять` → `map_put { kind: "domain", id, body, anchors, terms }` at once — ONE call per
  section. The engine's `Stored map section domain "<id>"; committed <sha>.` is relayed verbatim:
  progress is saved. A result carrying `Index not rebuilt: <reason>` is ALSO принято — the section
  is stored; the reason is relayed verbatim, the call is NEVER repeated (повторять нельзя: a
  retry writes a second event), and the finale carries one line «индекс не пересобран: <reason>;
  догонит при следующем чтении».
- `2 — переименовать` → a clarifying DECISION: up to 3 candidate slugs as chips (the cluster's
  seed directory name, its dominant term, its parent directory), and a typed slug matching the
  pattern is accepted as well; then the SAME draft is re-shown under the new id with the same
  five chips — a rename is not an acceptance. When the old id was already stored (UPDATE), the
  accepting put is followed by `map_delete { id: <old> }`.
- `3 — слить с <соседний домен>` → a clarifying DECISION over the neighbours (clusters and stored
  domains this cluster has edges or seams with, by edge weight, at most 4 chips); the MERGED
  draft — the surviving id, bodies joined under their first lines, anchors united, terms united
  and capped at 24 in that order — is shown AGAIN with the same five chips. On acceptance:
  `map_put` of the survivor, then `map_delete` of the absorbed id when it was stored.
- `4 — отклонить` → nothing is written; the cluster is listed in the finale as rejected, and its
  files stay unmapped (notes under them join no domain).
- `5 — показать целиком` → the MANDATORY full-body branch: the whole draft, verbatim, then the
  same menu for the same section.

Exactly ONE chip carries «← рекомендую: <причина одной строкой>» — the agent read the draft and
knows what the user has not seen yet (a thin cluster that is really part of its neighbour, a draft
whose open questions outnumber its facts). Silence = pause; the next section is shown only after
the digit. In UPDATE mode a re-described section carries the same five chips, and `1` is a full
replacement of the stored body.

Flows are offered as ONE numbered list (id — depends_on — first line) with the batch menu
`1 — прими все`, `2 — поштучно`, `3 — отклони все`; `2` re-renders each flow with its own
`1 прими · 2 отклони · 3 показать целиком` tail. An accepted flow is one `map_put { kind: "flow",
id, body, anchors, depends_on }` — its anchors are the files of its hops.

### Step 5: the finale — INFORMATIONAL

When the last section has its digit:

1. `mcp__plugin_mneme_memory__map_list {}` — pasted VERBATIM: that IS the map now.
2. The counts: принято / переименовано / слито / отклонено, and the clusters skipped as
   «принято ранее» or «черновик не уложился в лимит».
3. The RUN-COST line — the output of `--delta map-<project-slug> --label карта`, verbatim
   (`### RUN-COST`); empty output → no line. Under it, when any put answered
   `Index not rebuilt:`, the single line «индекс не пересобран: <reason>; догонит при следующем
   чтении».
4. When a `map_delete` happened: the PROSE warning «если на ветке есть незавершённый run с
   `domains`, удалённый домен уронит бандл его фазы — верни его через `map_put` или перезапусти
   run без него» (this skill cannot see runs; the line is unconditional on delete).
5. Three «дальше» lines as DATA — `/mneme:plan` сузит подборки доменами (`domains a,b` in its
   ready command); вопросы об устройстве проекта — через `recall` (сначала разделы карты, потом
   заметки); повторный `/mneme:map` — обновление по diff от commit разделов.

No DECISION: every section was decided by digit on the way, and the finale creates nothing it
could offer. FINALE-CLASS-INFORMATIONAL — the turn shows what was stored and stops.

### RUN-COST — the map's token cost (bearer replica; norm: dev's `### RUN-COST`)

map is a BEARER in the RUN_COST_BEARERS registry (dev — runs; grill-agent — interrogations; map —
maps): it drives the mark/delta modes of the session-tokens script for its own cycle. Two call
points:

- RIGHT AFTER STEP 0 (the graph and every spawn are part of the map's cost), call ONCE, silently:

  ```
  node <base-dir-скилла>/../../scripts/session-tokens.mjs --cwd <корень-проекта> --mark map-<project-slug>
  ```

- ON THE FINALE, call:

  ```
  node <base-dir-скилла>/../../scripts/session-tokens.mjs --cwd <корень-проекта> --delta map-<project-slug> --label карта
  ```

  and paste the output VERBATIM as the finale's RUN-COST line. The normal form:
  `карта ~Xk out · M турн · субагенты Yk out` (the cluster spawns ARE the subagent figure); a mark
  unavailable in this session's cache degrades honestly by naming its base —
  `карта (с начала текущей сессии) ~Xk out · M турн`.

Fail-open is ABSOLUTE exactly as everywhere: exit 0 always, EMPTY output → no line, the finale is
never delayed or broken by the script.

## Output format

Russian runtime (per the user's global ru-RU rule). Every render follows the shared five-block
grammar — STATUS / PROSE / DATA / VERDICT / DECISION — DEFINED once in the `mneme:dev` skill's
`## OUTPUT-GRAMMAR` section (dev is the anchor skill; re-stating the grammar here is a
VIOLATION). map OWNS three layer-3 templates: раздел-меню, потоки-меню and the финал. Fill the
placeholders, never reinvent the structure. Display as plain markdown (NOT inside a code fence).

TOKEN-LINE — compact replica (norm: dev's `### TOKEN-LINE`): every DECISION block OPENS with the
token-spend line — before rendering the menu run the read-only call
`node <base-dir-скилла>/../../scripts/session-tokens.mjs --cwd <корень-проекта>` and paste its
output VERBATIM above the chips (`контекст ≈574k/1M · 57%`, or a degradation
`окно: н/д — <причина>`); EMPTY output → no line. Fail-open is absolute: the script always exits
0 and NEVER delays or breaks a menu — a missing line is the degradation, never a wait.

**раздел-меню** — one domain, PROSE head + DATA draft + DECISION:

```
Домен <n>/<N>: `<id>` — <первая строка тела>
якоря: <anchors> · термов <M> · файлов <K> · зависит от: <ids | (none)>
<первые ~12 строк тела>
…

<строка TOKEN-LINE>
`1 — принять`
`2 — переименовать`
`3 — слить с <соседний домен>`
`4 — отклонить`
`5 — показать целиком`
```

(the «← рекомендую: <причина одной строкой>» suffix rides exactly ONE of the five chips; `5` shows
the whole draft and re-asks the same menu; a clarifying question raised by `2` or `3` is its own
numbered DECISION in the next message, never prose)

**потоки-меню** — all flow drafts, DATA list + DECISION:

```
Потоки (<N>):
1. `<id>` — <depends_on> — <первая строка тела>
2. …

<строка TOKEN-LINE>
`1 — прими все`
`2 — поштучно`
`3 — отклони все`
```

**финал** — DATA only, no DECISION:

```
<вывод map_list {} дословно>

принято <A> · переименовано <R> · слито <M> · отклонено <D> · принято ранее <S>
<строка RUN-COST — вывод `--delta map-<project-slug> --label карта` дословно; пусто — строки нет>
индекс не пересобран: <reason>; догонит при следующем чтении   (only when a put said so)

дальше:
- `/mneme:plan` сузит подборки доменами — хвост `domains <a,b>` в готовой команде
- вопросы об устройстве проекта — через `recall`: разделы карты идут перед заметками
- повторный `/mneme:map` — обновление по diff от commit разделов
```

### Honest limit

The graph is STATIC: imports, requires, Ruby constants, associations, routes and frontend-to-API
seams, no language server at the graph level — метапрограммирование не видно (`define_method`,
dynamic `send`, concerns included by string), and a cluster boundary the code does not express in
paths or edges is drawn by the user's `3 — слить` and `2 — переименовать`, not by the script. The
quality of a section body is a spawn's reading, judged by the user per section; nothing here
machine-checks it. A note's membership in a domain follows the anchors: a directory anchor binds
every note under it, so a domain with a too-wide anchor (`app`) swallows the corpus — the draft
anchors are the cluster's seed directories for that reason.

### Language

Print user-facing text in Russian; keep engine/protocol tokens (`map_list`, `map_put`,
`The project map is empty.`, `Stored map section`, `Index not rebuilt:`, `/mneme:map`) literal.

## Rules

- DIGIT-GATE — ни один раздел не пишется без цифры: `map_put` follows an explicit `1 — принять`
  (or the re-shown draft after a rename / merge), one call per section; `map_delete` only for an
  absorbed stored section. VIOLATION = ABORT.
- ENGINE-OWNED FILES — the corpus `map/`, `INDEX.md` and `glossary.md` are never touched on disk;
  the only way into the map is `map_put`.
- RESOLVE-INDEX — a put answering `Index not rebuilt:` is принято, not an error: the section is
  stored, the reason is relayed verbatim, the call is not repeated (не повторять), the finale
  carries the one-line summary.
- GRAPH-BY-SCRIPT — the clusters come from `project-graph.mjs` (PRIMARY: the whole repository;
  UPDATE: `--since <commit>` or the `--changed` union); the summary line is pasted verbatim; LSP
  is a spawn's tool inside ONE cluster, ≤20 symbols, never the graph's.
- FRESH-SPAWN — one describer per cluster, at most 4 at once, the fixed preamble order, no engine
  tools inside a spawn; a draft outside the engine limits (3000 code points, 24 terms of 32) is
  re-spawned once, then skipped — never hand-trimmed.
- PROGRESS-IN-THE-MAP — an interrupted run loses nothing: `map_list {}` on the next start skips
  the covered clusters, the graph is recomputed in seconds.
- TOKEN-LINE — every DECISION block opens with the token-spend line (compact replica above).
- RUN-COST — map is a bearer: `--mark map-<project-slug>` right after Step 0, `--delta
  map-<project-slug> --label карта` on the finale (`### RUN-COST`).
- FINALE — INFORMATIONAL: `map_list {}` verbatim, counts, the RUN-COST line, the three «дальше»
  lines; no DECISION.
- LANGUAGE: English body + literal English protocol tokens; RUSSIAN runtime user-facing output.
