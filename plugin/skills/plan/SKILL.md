---
name: plan
description: turn a task described in words into a reviewed delta-spec through option fan and user confirmation
allowed-tools: [Read, Grep, Bash, mcp__plugin_mneme_memory__recall, mcp__plugin_mneme_memory__remember, mcp__plugin_mneme_memory__workflow_migrate, mcp__plugin_mneme_memory__staging_list, mcp__plugin_mneme_memory__staging_resolve, Write]
disable-model-invocation: true
---

# /mneme:plan — Turn a task in words into a reviewed delta-spec

The ENTRY of the pipeline. It takes a task described in plain words, scouts the code and prior
memory, fans out 2-3 solution options with honest trade-offs, and — only after the user picks one
and approves the draft — writes a delta-spec to `docs/` and MIGRATES it into runnable phase files
as its finale, ending at the graph map with a ready dev command. It closes the loop "idea → spec →
phases → (/mneme:dev)" without ever writing code or running dev itself.

The internal fan mechanics (recall → options → trade-offs → recommendation) are borrowed from
`/mneme:arch`. The difference: arch stops at the analysis and stays read-only; plan RECOMMENDS but
the CHOICE is the user's, and plan continues — after that choice — all the way to a spec. plan does
NOT replace arch; arch remains the think-only tool for architecture questions.

Core requirement (this is the design's spine): the user wants to see solution options for EVERY
task — even a small one — and to CONFIRM before any code. Whether a task is "obvious" is the USER's
judgement, never the agent's. Hence two HARD gates inside this skill: a stop on the option choice,
and a stop on the spec review. The skill PHYSICALLY does not continue past either without an
explicit confirmation — the turn ends, and it is the user's move.

## Arguments

`/mneme:plan "<task in words>"` — the task or change to plan, described in plain language.

Examples:
- `/mneme:plan "rename the memory MCP server key"`
- `/mneme:plan "fix the filter so archived tickets stay hidden"`
- `/mneme:plan "add a staging-list command to the plugin"`

No argument → ask the user for the task in one line (numbered prompt), then proceed. Never invent a
task.

## Permissions (VIOLATION = ABORT)

- Read / Grep the codebase: YES — this is the recon in Step 2.
- `mcp__plugin_mneme_memory__recall`: YES — prior decisions and gotchas on the task's topic.
- Write: YES, but ONLY to persist the FINAL approved spec into `docs/`, and ONLY after the Step 6
  approval. Writing anything before approval, or writing anywhere other than the spec file, is a
  VIOLATION.
- Edit files / Bash / any code change: FORBIDDEN — plan plans, it never implements. It does not
  write code and does not call `/mneme:dev`. Its artifact ENDS at the migrated phases plus the map.
  ONE carve-out: Bash ТОЛЬКО for the read-only session-tokens call before rendering a
  DECISION block (the TOKEN-LINE replica in Output format) — any other Bash stays FORBIDDEN.
- `mcp__plugin_mneme_memory__workflow_migrate`: YES, but ONLY in Step 7 (PLAN-AUTOMIGRATE), AFTER
  the Step 6 approval and Write — never on a draft. The TOOL writes the phase files; the skill
  itself writes nothing outside the approved spec (and its Step 7 format repairs).
- `mcp__plugin_mneme_memory__remember`: YES, but ONLY in Step 8 to STAGE the choice decision AFTER
  the Step 6 approval and Write — it QUEUES a note for review, it never publishes. `remember`
  before approval is FORBIDDEN.
- `mcp__plugin_mneme_memory__staging_list` / `mcp__plugin_mneme_memory__staging_resolve`: YES, but
  ONLY applying the user's explicit DIGIT from the finale's HANDOFF-DECISION menu (per the
  curation contract in Output format): `staging_list` to SHOW the queue, `staging_resolve` to
  apply a per-note digit decision. Resolving without an explicit digit is a VIOLATION — the human
  gate is untouched. ANY other memory tool is FORBIDDEN.

## Procedure

Eight steps, two hard stops. Steps 1-3 run in one turn and END at Step 4. Step 5 runs after the
user's choice and ENDS at Step 6. The Write happens only after Step 6 approval; Step 7 then
MIGRATES the approved spec into phase files (fail-fast, hot context); Step 8 STAGES the choice as a
decision note (it queues for human accept — it does not publish).

### Step 1: Take the task

Read the task from the argument. Restate it in one sentence so the user can see how it was
understood. Do not widen the scope beyond what was asked.

### Step 2: Recon — code + memory

1. Call `mcp__plugin_mneme_memory__recall` with the task's key concepts (modules, files,
   technologies). Prior decisions and gotcha notes are the most valuable.
2. Grep + Read the relevant code (max ~15 files) to ground the options in real file paths.
3. Read repository context that exists anywhere — `CLAUDE.md`, `README`, `docs/` — for conventions
   and constraints, AND the project's RELEASE AUTOMATION: `.github/workflows/` (or the equivalent CI
   directory), release scripts, and the version fields of its manifests. That last target is what
   VERSION-BUMP-RULE decides on, and it lives nowhere near the prose documents — a recon that skips
   it makes the rule postmortem instead of preventive. Degrade gracefully when one is absent; "no
   automation found" is an ANSWER the rule acts on, not a gap. An empty or degraded recall (cold
   store, no stored vectors) is normal — note "memory empty" and continue.
4. If recall surfaces an antipattern note, EVERY option in Step 3 must state whether it triggers
   that antipattern. Silent ignore = VIOLATION.

### Step 3: Fan out options

Present a fan of **2-3 options**. Each option carries:
- a short summary and how it works (concrete file paths / module names);
- honest **trade-offs** (specific pros and cons, effort small/medium/large, risk);
- a **done-when sketch** — how this option would be verified (see Output format for the two kinds);
- whether it triggers any antipattern surfaced by recall.

Make recall findings VISIBLE in the fan as "prior experience: …" so the user sees what memory
contributed. A recommendation IS allowed (say which option and why), but it is a suggestion — the
choice is the user's.

If the task is genuinely single-option, do NOT skip the fan silently: state explicitly "one option,
here it is — confirm", with its trade-offs and done-when sketch. Even a trivial task passes through
confirmation, because obviousness is the user's judgement.

### Step 4: OPTION-FAN-HARD-STOP — wait for the user's choice

END THE TURN here. Present the fan, then STOP and wait for the user to pick an option (numbered
choice). Do NOT draft the spec, do NOT proceed to Step 5, do NOT assume the recommended option.
Continuing past this point without an explicit user choice is a VIOLATION = ABORT.

### Step 5: Draft the delta-spec

From the chosen option, draft a delta-spec in the project's delta format — all FIVE sections
(Baseline, Stack, Conventions, Knowledge, Gameplan). See Output format for the exact shape,
including the two done-when kinds and the mandatory justification of the kind chosen. Keep it as
short as the task warrants: a small task yields a one-phase spec — that is NORMAL, not a shortfall.
Do NOT inflate a small task into multi-phase.

If the task naturally decomposes into phases with dependencies, write it multi-phase — but add the
D2 warning (see Output format). If no executable done-when can be formulated for a phase that should
have one, that is a signal of an underspecified phase: raise the question with the user, do NOT
write a prose placeholder.

### Step 6: SPEC-REVIEW-HARD-STOP — review, then Write only on approval

Show the DRAFT spec in the chat and CLOSE THE TURN with the `### SPEC-REVIEW-MENU` block (Output
format) — that numbered menu IS the stop, and the turn ends there. `Write` into `docs/` fires ONLY
on digit `1`; digits `2` / `3` / `4` and silence all leave the disk untouched. Closing this stop
with a prose request for confirmation instead of the menu — the «Подтверди — пишу в docs/…» shape —
is a VIOLATION: layer 2 of dev's grammar makes any clarifying question a DECISION, numbered and
digit-answered. Writing the file before the digit, or continuing without it, is a VIOLATION = ABORT.

### Step 7: PLAN-AUTOMIGRATE — migrate the approved spec, end at the map

Immediately after the spec file is written, call
`mcp__plugin_mneme_memory__workflow_migrate { spec_path }` (dry-run), then `apply: true` when clean
— the same validate → apply-if-clean single pass as `/mneme:migrate`. This is the fail-fast point of
the pipeline: plan learns HERE, in the hot context where the spec was just authored, whether it is
runnable — not days later when someone tries to migrate it.

- FORMAT error (unparseable Gameplan, malformed done-when block): FIX THE SPEC YOURSELF and re-run
  the migration, repeating until it applies. This is the one sanctioned re-Write — repairing the
  FORM of the file the user already approved, never its MEANING. A meaning-level problem (a fix
  that would change decisions the user approved) goes back to the user — that is a Step 6 matter,
  not a format repair.
- CONFLICT (a target phase file diverged from an earlier migration): stop and surface it exactly as
  `/mneme:migrate` does — name the divergence, offer the numbered ways out, never force.

On success, the finale: render the graph map per the shared GRAPH-MAP convention (defined ONCE, in
the `mneme:migrate` skill — phase ids in deps order, criteria kinds, boundary candidates, ready
commands) and show the runnable `/mneme:dev <spec-slug> [until <id>]` command. plan still NEVER
runs it.

### Step 8: STAGE-CHOICE — stage the decision

After the migration finale, UNCONDITIONALLY stage the choice as a decision note — this closes the
back half of the plan's memory loop (choice → memory), mirroring how `/mneme:dev` stages harvest
artifacts. Call `mcp__plugin_mneme_memory__remember` with `type: "decision"`, a `body` distilling
the fork (the CHOSEN option, the REJECTED options each with compressed trade-offs, and WHY the
choice won), and `anchors` set to the affected files (see Output format for how body and anchors are
built). `remember` only QUEUES the note — it does not publish and the skill never assumes
acceptance. The queue is then curated BY DIGIT through the finale's HANDOFF-DECISION menu (the
curation contract in Output format) — NEVER by telling the user to operate MCP tools.

This remember is the plan-fan door of MENU-CONTEXT — the ONE point where the menu payload rides
`remember` instead of `staging_resolve`: it carries
`menu {decision_class: "plan-fan", options_n: <ФАКТИЧЕСКИЙ размер веера (2-3)>,
recommended_position: <позиция реальной пометки «← рекомендую» в веере — НЕ привычная 1>,
chosen_position: <цифра пользователя на OPTION-FAN-HARD-STOP>}`. The skill MUST carry the user's
Step 4 digit (and the fan's size and recommended position) through BOTH hard stops to this call —
losing it and stamping a guess is worse than stamping nothing.

plan's artifact ends at the spec on disk, the migrated phase files, the map with its closing menu,
and the staged decision note. Launch is ALWAYS manual: `/mneme:dev` carries
`disable-model-invocation` — the agent cannot invoke it even on an explicit digit, so a menu digit
makes the skill accept/reject the note itself and hand over the READY command as a fenced block;
running it is the user's move.

## Output format

Every render below follows the shared five-block grammar — STATUS / PROSE / DATA / VERDICT /
DECISION — DEFINED once in the `mneme:dev` skill's `## OUTPUT-GRAMMAR` section (dev is the anchor
skill; re-stating the grammar here is a VIOLATION). plan OWNS two layer-3 templates: the option
fan (PROSE context + DATA options + a closing DECISION) and the finale map (VERDICT counts +
GRAPH-MAP per the `mneme:migrate` convention + the staged-note queue + a closing HANDOFF-DECISION
menu). Fill the placeholders, never reinvent the structure.

### The fan (Step 3)

Display as plain markdown (NOT inside a code fence):

## PLAN: <task short form>

**Context** — Project · Branch · files scouted · recalled memory (decisions / antipatterns, or
"none — memory empty")

### Option A: <name>
<summary> · **How** (files/modules) · **Trade-offs** (pros / cons / effort / risk) · **Done-when
sketch** · **Antipattern?** · **Prior experience** (from recall, if any)

### Option B / C: <same structure>

### RECOMMENDATION
**Option <A/B/C>: <name>** — why, and which trade-offs it accepts.

The fan CLOSES with a DECISION block — the numbered option menu, digit-answered, nothing after it
(this IS the OPTION-FAN-HARD-STOP):

```
1 — вариант A: <name>
2 — вариант B: <name>
3 — вариант C: <name>
```

(the «← рекомендую: <причина одной строкой>» suffix rides exactly the recommended option's line)

### The delta-spec (Step 5)

Five sections, matching the project's existing `docs/SPEC-*.md` delta format:

- **Baseline** — prior spec reference + a `Prior spec-hash: sha256:<placeholder — confirm>` line +
  what already exists and is not touched + a SOFT traceability line "обоснование выбора — staged
  decision note (id после accept)" (the note is staged in Step 8; its id is unknown until a human
  accepts it, so the reference stays SOFT — never hard-code an id).
- **Stack** — new/changed components (files, tools), concrete.
- **Conventions** — rules this change must hold to.
- **Knowledge** — self-contained rationale and gotchas (from-spec carries Knowledge into the phase
  document, so a phase task may reference "see Knowledge").
- **Gameplan** — one or more phases, each a task checklist + a **Done when** block.

**done-when is one of two kinds, and the skill MUST justify which:**
- **executable** — a fenced, concrete command with a definite target (a specific test file, a
  `grep -q MARKER path`), NOT a bare `bun test`. Use when the outcome is machine-verifiable.
- **agent-judged** — explicitly MARKED as agent-judged. Use only when the outcome is visual or
  otherwise not machine-checkable.

**Multi-phase is native:** `/mneme:dev` takes the WHOLE phase graph in one run and the engine's
reducer orders execution by dependencies; `until <phase-id>` boundaries give staged entry. Do NOT
warn about one-phase-at-a-time — that limit is gone. Write the graph the task actually needs and
let the map's boundary candidates suggest the `until` points.

**TYPECHECK-CRITERION-RULE — the done-when generator's rule:** every CODE phase automatically gets
the project's typecheck criterion as an ADDITIONAL executable done-when — IF the project carries a
typecheck script (its own, e.g. a `typecheck` entry in package.json; the concrete command, never a
guessed one). The GENERATOR holds this rule, not the author: the user does not have to remember to
ask for it, and a code phase missing the project's typecheck gate is a generator bug, not a style
choice. Non-code phases (docs, prose skills) do not get it.

**WIRE-PHASE-RULE — the integration-phase generator's rule:** every Gameplan with 2+ CODE phases
automatically ENDS with a terminal `wire` phase whose deps list ALL the code phases. The GENERATOR
holds this rule, not the author (the TYPECHECK-CRITERION-RULE precedent): unit gates look INSIDE
their module by construction, so wiring — the imports, the composition in the entrypoint — is work
that belongs to NO phase unless one is generated for it; a multi-phase spec whose gates are all
green while the application does not start is a generator bug, not an author lapse. The wire
phase's content is the e2e scenario of the MAIN PATH: an end-to-end test assembling the REAL
modules, with mocks ONLY at the network/system boundary. Its done-when is EXECUTABLE with a
definite target (a specific test file — never a bare test runner). UI-limit honesty: where "really
works in a browser" exceeds what the test harness can prove, the executable criterion goes exactly
as far as the harness proves real-module connectivity (happy-dom and the like), and the remainder
is NOT disguised as an agent-judged criterion — the spec's Knowledge carries an honest limit note,
and the wire phase's boundary is declared the human-acceptance point. Removing an unwanted wire
phase is the USER's move at the Step 6 review — that review IS the opt-out; no separate mechanism
exists. Specs with 0-1 code phases are untouched by this rule.

**ETALON-ACCEPTANCE-RULE — the etalon-implementation generator's rule:** a spec whose task is
"реализовать по эталону <design/pages/<slug>/…>" automatically carries the acceptance checklist
in its Knowledge — the implementation is accepted by comparing AGAINST the etalon folder:
section structure, the full state set, the accent-dosage rule, and the measurement units. The
GENERATOR holds this rule, not the author (the TYPECHECK-CRITERION-RULE precedent); it is a
HUMAN acceptance procedure, never disguised as an agent-judged criterion.

**REAL-DEP-SMOKE-RULE — honest dep edges:** in a multi-phase Gameplan every dep edge must declare
what it carries. An edge that carries CODE CONSUMPTION ("phase B uses X from phase A") gives the
CONSUMER phase an ADDITIONAL executable done-when criterion that exercises the REAL X — importing
the actual upstream module; a mock in THIS criterion is forbidden. An edge that is pure ordering
is explicitly marked `order-only` in the phase's deps line. The generator makes the distinction at
draft time — plan has just designed who consumes whom, so an unmarked, criterion-less dep edge is
a generator bug. This keeps `deps` from lying about connectivity: bare "deps [phase 3]" means
execution order only, and an agent can honestly finish phase 4 without importing anything from
phase 3 — a failure the wire phase alone would catch only at the very end, while the smoke
criterion catches it fail-fast at the consumer's own gate.

**VERSION-BUMP-RULE — the version-phase generator's rule:** a phase that raises the PROJECT's
version is generated ONLY when the recon found NO automation that already does it (a CI bump job, a
release script, a release workflow). Evidence found → NO such phase, and the finding goes into
Baseline as a line naming the automation — a silent omission is forbidden exactly as a silently
ignored antipattern is. The GENERATOR holds this rule, not the author (the TYPECHECK-CRITERION-RULE
precedent): the user does not have to remember which of their projects bumps itself, and a phase
that duplicates the project's own automation is a generator bug, not a style choice. The evidence is
always READ from the project, never assumed in either direction — «the concrete command, never a
guessed one» applies here too.

Where a bump phase IS legitimate, two constraints follow:

- Its task is stated as an INCREMENT («raise the patch version»), never as a literal pair «X → Y» —
  a version number written into a spec goes stale between the drafting and the execution, so a
  literal is wrong by the time the phase runs.
- A manual bump drags the synchronization of DERIVED artifacts behind it (release pins, version
  stamps duplicated in manifests). The ones the recon actually FOUND enter the same phase as tasks;
  ones it did not find are NOT invented. A bump phase that leaves a derived artifact stale hands the
  project a red test suite.

### SPEC-REVIEW-MENU (Step 6) — меню подтверждения спеки

The layer-3 template of the SPEC-REVIEW-HARD-STOP. Composition per layer 1: PROSE — what the draft
is and where it departs from the option the user picked at Step 4; DATA — the draft spec itself;
DECISION — the menu below, with NOTHING after it. The TOKEN-LINE replica opens this DECISION block
exactly as it opens every other one. Literal shape (fill the placeholder, never re-lay it out):

```
`1 — принять: пишу docs/SPEC-<slug>.md и мигрирую в фазы`
`2 — правки: <самое слабое место черновика одной строкой>`
`3 — вернуться к вееру: перевыбрать вариант`
`4 — отмена: ничего не пишу`
```

DIGIT SEMANTICS — what each digit commits the skill to, and nothing beyond it:

- `1` → `Write` the spec into `docs/`, then Step 7 (PLAN-AUTOMIGRATE) and Step 8 (STAGE-CHOICE).
- `2` → rework the draft and RETURN to this same hard stop; no `Write` happens on the way, and the
  reworked draft is re-shown under this same menu.
- `3` → back to Step 4, the option fan, with no `Write` — the fan is re-presented for a fresh digit.
- `4` → the turn ends and nothing reaches the disk.
- молчание = пауза: the draft stands, nothing is written, the skill does not move.

**ANTI-SELF-ENDORSEMENT (VIOLATION = ABORT).** «← рекомендую» on option `1` is FORBIDDEN. The
reason is not stylistic. `### BOUNDARY-CURATION` permits a recommendation precisely because «the
agent WROTE these notes and knows what the user cannot see» — there authorship gives the agent real
knowledge (a duplicate versus a find). At a spec review the subject of the decision is «та ли это
спека, которую ты хотел», and authorship gives the agent NOTHING: it would be recommending its own
artifact. By the doctrine «a recommendation without a reason is pressure without information» that
is pressure at zero information. The recommendation is not banned outright — it MOVES to option `2`
and MUST name the agent's OWN doubt about the draft: a generated wire phase the user may not want, a
done-when taken agent-judged for want of an executable one, a phase whose size the agent considers
inflated. Having no recommendation at all is legal — layer 1 says «MAY carry», not «MUST».

**MENU-CONTEXT is NOT passed here.** No engine call exists at the moment of this choice, and dev's
list of honestly UNCOVERED menus already names «SPEC-REVIEW approve». Synthesizing a call to stamp
this menu for coverage is FORBIDDEN — it would make agreement count a decision the engine never saw.

### The finale map (Step 7) — финал-карта (FINALE-CLASS-HANDOFF)

VERDICT (migrate's counts + apply confirmation, verbatim) + the GRAPH-MAP per the shared
convention (defined in the `mneme:migrate` skill — never re-drawn differently here) + the staged
note rendered WHOLE as a numbered queue + the closing HANDOFF-DECISION menu (dev's
`## OUTPUT-GRAMMAR`, layer 2): this turn just CREATED unlaunched phases and a queued note, so the
message MUST close with the menu — a prose list of next commands, or naming `staging_list` /
`staging_resolve` to the user, is a VIOLATION. Menu composition (2-4 items): early boundary = the
FIRST boundary candidate from GRAPH-MAP + the full run to the terminal + note curation. The
combined item «принять заметку и выдать команду …» is legal by COMBINE-VISIBILITY — the note is
shown whole in this same message. Launch is ALWAYS manual (`disable-model-invocation`): on a digit
the skill resolves the note itself and prints the chosen ready command as a fenced block — the
user runs it. Literal shape:

```
create: <N> · identical: <M> · conflict: <K>
Спека записана: docs/<SPEC-…>.md · фазовых файлов применено: <W>

<GRAPH-MAP по конвенции mneme:migrate — таблица фаз, кандидаты границ, готовые /mneme:dev команды>

В staging 1 заметка (показана целиком):

1. [decision] <суть выбора одной строкой> — якоря: <anchors>

`1 — принять заметку и выдать команду полного прогона`
`2 — принять заметку и выдать команду until <первый-кандидат>`
`3 — отклонить заметку`
```

(the «← рекомендую: <причина одной строкой>» suffix rides exactly ONE option; silence = pause —
plan does not move without a digit)

### Curation contract — compact replica (full protocol: dev's `### BOUNDARY-CURATION`)

- The queue renders as a NUMBERED list — number, `[type]`, one-line essence, anchors.
- Every decision is a DIGIT menu (rendered as vertical chips per the grammar); the batch form is
  `1 — прими все` / `2 — поштучный разбор` / `3 — отклони все` / `4 — дальше`; answers by DIGIT
  ONLY.
- Exactly ONE option carries «← рекомендую: <причина одной строкой>»; the recommendation never
  shifts the default; silence = pause.
- NEVER tell the user to operate `staging_list` / `staging_resolve` — the agent calls the tools on
  the user's digit; every per-note decision stays the human's.
- Per-note mode and the mandatory full-body branch live in dev's `### BOUNDARY-CURATION`; this
  replica defers to it for details.

TOKEN-LINE — compact replica (norm: dev's `### TOKEN-LINE`): every DECISION block OPENS with the
token-spend line — before rendering the menu run the read-only call
`node <base-dir-скилла>/../../scripts/session-tokens.mjs --cwd <корень-проекта>` and paste its
output VERBATIM above the chips (`контекст ≈574k/1M · 57%`, or a degradation
`окно: н/д — <причина>`); EMPTY output → no line. Fail-open is absolute: the script always exits
0 and NEVER delays or breaks a menu — a missing line is the degradation, never a wait.

MENU-CONTEXT — compact replica (norm: dev's `### MENU-CONTEXT`):

- RULE — a property of the CALL, not a separate step: every `staging_resolve` that follows a
  PRESENTED digit menu MUST carry the menu payload; resolve после меню без menu-поля = VIOLATION.
- plan's finale payload (literal): the note resolve after the finale menu carries
  `{decision_class: "curation", options_n: 3, recommended_position: <позиция «← рекомендую»>,
  chosen_position: <фактическая цифра>}`. Combined options (COMBINE-VISIBILITY) change NOTHING:
  menu describes the PRESENTED menu, not the actions — the resolve is the only engine call of the
  option; the handed-over command has no call and never enters menu.
- NON-EVENTS (дословно): «позже / показать целиком / дальше / молчание → вызова нет, ничего не
  пишется» — never synthesize a call for coverage.
- NEUTRALITY: agreement-цифры, coverage и menu-контекст никогда не рендерятся в тексты, где
  вырабатывается рекомендация.

### The choice decision note (Step 8)

Staged via `remember(type: "decision", body, anchors, menu)` — `menu` is the plan-fan payload
defined in Step 8:
- **body** — the fork distilled: the CHOSEN option, the REJECTED options each with compressed
  trade-offs, and WHY the choice won. This is the ADR moment from the fan, compressed into one note.
- **anchors** — the affected files, and they MUST be repo-relative AND git-tracked (an untracked
  anchor is a dead-anchor sink that drops the note to the bottom of recall). A plan often touches
  files that do not exist yet — anchor to the already-tracked files it affects, never to
  not-yet-created ones.

### Language

Print all user-facing text in Russian (per the user's global ru-RU rule); this governs runtime
output independent of this file's English source. The spec written to `docs/` follows the language
of the existing specs in that directory.

## Rules

- TWO HARD STOPS — `OPTION-FAN-HARD-STOP` (Step 4) and `SPEC-REVIEW-HARD-STOP` (Step 6). The turn
  ENDS at each; continuing without an explicit user confirmation is a VIOLATION = ABORT.
- SPEC-REVIEW-MENU — the Step 6 stop is CLOSED BY THE MENU (`### SPEC-REVIEW-MENU`), never by
  prose; `Write` fires only on digit `1`, and silence leaves the disk untouched.
  ANTI-SELF-ENDORSEMENT: «← рекомендую» on «принять» is FORBIDDEN — the agent authored the spec
  under review, so self-endorsement is pressure at zero information; the recommendation, if any,
  rides «правки» and names the agent's OWN doubt. No menu-контекст rides this choice.
- PLAN, NEVER RUN — no code, no `/mneme:dev`. Migration IS plan's finale (Step 7), but RUNNING the
  phases is dev's job: plan creates and migrates the plan (the user reviews the plan); dev executes
  it (the engine gates execution). Merging the two loses the review point. Launch is always
  manual — `/mneme:dev` carries `disable-model-invocation`, so the finale menu only hands over the
  ready command; wording that promises the agent will launch is a VIOLATION.
- FINALE = HANDOFF-DECISION (FINALE-CLASS-HANDOFF) — the Step 7 finale closes with the digit menu
  (early boundary / terminal / note curation, 2-4 items); a prose list of next commands, or naming
  MCP tools to the user, is a VIOLATION; curation follows the compact contract (replica of dev's
  `### BOUNDARY-CURATION`).
- PLAN-AUTOMIGRATE FAIL-FAST — Step 7 drives `workflow_migrate` validate → apply-if-clean in one
  pass; a FORMAT error is fixed by the skill itself in the hot context (re-Write + re-migrate,
  meaning untouched), a MEANING-level fix goes back to the user; the finale is the GRAPH-MAP
  (shared convention, defined in the `mneme:migrate` skill) plus a ready dev command.
- FAN IS MANDATORY — at least 2 options with honest trade-offs; a genuine single-option task is
  stated explicitly as "one option, confirm", never resolved silently. Even trivial tasks pass
  through confirmation.
- WRITE ONLY THE APPROVED SPEC — `Write` fires after Step 6, into `docs/`, nowhere else and never
  before approval; the ONLY re-Write is Step 7's format repair of that same approved file.
- STAGE THE CHOICE — Step 8 UNCONDITIONALLY stages the decision (chosen + rejected + why) via
  `remember`, closing the choice → memory loop; it only QUEUES for human accept and NEVER publishes.
  Anchors must be git-tracked (already-existing files, not future ones).
- EVIDENCE-BASED — every option references a specific file or recalled note; name files and
  modules, not "consider separating concerns".
- RECALL IS VISIBLE — surface what memory contributed in the fan; an antipattern note forces every
  option to declare whether it triggers it.
- DONE-WHEN JUSTIFIED — pick executable or agent-judged per the outcome's nature and justify the
  choice; an unformulatable executable criterion is a signal to raise the question, not to write a
  prose stub.
- SIZE FOLLOWS THE TASK — a one-phase spec for a small task is normal; do not inflate to
  multi-phase. Multi-phase is native to dev (one run, until boundaries) — no warning needed.
- TYPECHECK-CRITERION-RULE — the generator, not the author, adds the project's typecheck criterion
  to every code phase when the project carries a typecheck script.
- WIRE-PHASE-RULE — the generator, not the author, appends a terminal `wire` phase (real-module
  e2e of the main path, mocks only at the network/system boundary, definite-target executable
  done-when) to every Gameplan with 2+ code phases; removal is the user's Step 6 move.
- REAL-DEP-SMOKE-RULE — the generator, not the author, makes every dep edge honest: a
  code-consuming edge adds a real-module executable smoke criterion to the consumer phase, and a
  pure-ordering edge is explicitly marked `order-only`.
- VERSION-BUMP-RULE — the generator, not the author, decides whether a version-bump phase exists: it
  is generated ONLY when the recon (Step 2.3, release automation included) found no automation that
  bumps the project itself; evidence found → no phase, and Baseline names the automation. Where the
  phase is legitimate its task is an INCREMENT, never a literal «X → Y», and the derived artifacts
  the recon found (release pins, version stamps) enter the same phase.
- LANGUAGE: English body + Russian runtime user-facing output.
