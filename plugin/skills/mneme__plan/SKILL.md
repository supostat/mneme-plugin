---
name: mneme:plan
description: turn a task described in words into a reviewed delta-spec through option fan and user confirmation
allowed-tools: [Read, Grep, mcp__plugin_mneme_memory__recall, mcp__plugin_mneme_memory__remember, mcp__plugin_mneme_memory__workflow_migrate, Write]
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
- `mcp__plugin_mneme_memory__workflow_migrate`: YES, but ONLY in Step 7 (PLAN-AUTOMIGRATE), AFTER
  the Step 6 approval and Write — never on a draft. The TOOL writes the phase files; the skill
  itself writes nothing outside the approved spec (and its Step 7 format repairs).
- `mcp__plugin_mneme_memory__remember`: YES, but ONLY in Step 8 to STAGE the choice decision AFTER
  the Step 6 approval and Write — it QUEUES a note for review, it never publishes; a human accepts it
  via `staging_list` / `staging_resolve`. `remember` before approval, or ANY other memory tool
  (recall excepted, per above), is FORBIDDEN.

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
   and constraints. Degrade gracefully when one is absent; an empty or degraded recall (cold store,
   no stored vectors) is normal — note "memory empty" and continue.
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

Show the DRAFT spec in the chat and END THE TURN. STOP and wait for explicit approval. Only AFTER
the user approves may you `Write` the spec into `docs/`. Writing the file before approval, or
continuing without it, is a VIOLATION = ABORT.

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
built). `remember` only QUEUES the note — it does not publish; tell the user (Russian) to review and
accept it via `staging_list` / `staging_resolve`, and never assume it was accepted.

plan's artifact ends at the spec on disk, the migrated phase files, the map with its ready dev
command, and the staged decision note. Running `/mneme:dev` is the user's move.

## Output format

Every render below follows the shared five-block grammar — STATUS / PROSE / DATA / VERDICT /
DECISION — DEFINED once in the `mneme:dev` skill's `## OUTPUT-GRAMMAR` section (dev is the anchor
skill; re-stating the grammar here is a VIOLATION). plan OWNS two layer-3 templates: the option
fan (PROSE context + DATA options + a closing DECISION) and the finale map (VERDICT counts +
GRAPH-MAP per the `mneme:migrate` convention + the staged-note notice, NO DECISION). Fill the
placeholders, never reinvent the structure.

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

### The finale map (Step 7) — финал-карта

VERDICT (migrate's counts + apply confirmation, verbatim) + the GRAPH-MAP per the shared
convention (defined in the `mneme:migrate` skill — never re-drawn differently here) + the
staged-note notice. NO DECISION: plan ends at the map — running `/mneme:dev` is the user's move.
Literal shape:

```
create: <N> · identical: <M> · conflict: <K>
Спека записана: docs/<SPEC-…>.md · фазовых файлов применено: <W>

<GRAPH-MAP по конвенции mneme:migrate — таблица фаз, кандидаты границ, готовые /mneme:dev команды>

Заметка-решение (выбор варианта) в очереди staging — принять/отклонить: staging_list /
staging_resolve.
```

### The choice decision note (Step 8)

Staged via `remember(type: "decision", body, anchors)`:
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
- PLAN, NEVER RUN — no code, no `/mneme:dev`. Migration IS plan's finale (Step 7), but RUNNING the
  phases is dev's job: plan creates and migrates the plan (the user reviews the plan); dev executes
  it (the engine gates execution). Merging the two loses the review point.
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
- LANGUAGE: English body + Russian runtime user-facing output.
