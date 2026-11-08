---
name: plan
description: turn a task described in words into a reviewed delta-spec through option fan and user confirmation
allowed-tools: [Read, Grep, Bash, mcp__plugin_mneme_memory__recall, mcp__plugin_mneme_memory__map_list, mcp__plugin_mneme_memory__remember, mcp__plugin_mneme_memory__workflow_migrate, mcp__plugin_mneme_memory__staging_list, mcp__plugin_mneme_memory__staging_resolve, mcp__plugin_mneme_memory__notes_list, Write]
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
- `/mneme:plan "hide archived tickets from the default list"`
- `/mneme:plan "add a staging-list command to the plugin"`

No argument → ask the user for the task in one line (numbered prompt), then proceed. Never invent a
task.

## Permissions (VIOLATION = ABORT)

- Read / Grep the codebase: YES — this is the recon in Step 2.
- `mcp__plugin_mneme_memory__recall`: YES — prior decisions and gotchas on the task's topic.
- `mcp__plugin_mneme_memory__map_list`: YES — the project map, READ ONLY, in Step 2: `{}` for the
  overview, `{ id }` for the candidate domains of the task. plan never writes the map —
  `map_put` / `map_delete` are `/mneme:map`'s and FORBIDDEN here.
- Write: YES, but ONLY to persist the FINAL approved spec into `docs/`, and ONLY after the Step 6
  approval. Writing anything before approval, or writing anywhere other than the spec file, is a
  VIOLATION.
- Edit files / Bash / any code change: FORBIDDEN — plan plans, it never implements. It does not
  write code and does not call `/mneme:dev`. Its artifact ENDS at the migrated phases plus the map.
  TWO carve-outs, Bash ТОЛЬКО for: (1) the read-only session-tokens call before rendering a
  DECISION block (the TOKEN-LINE replica in Output format); (2) the SUFFICIENCY-RUN-RULE run of
  Step 3 — an existing mechanism of the project run as it is on the goal's real input, its entry
  point read first, with no flag or step that writes and no network; any other Bash stays FORBIDDEN.
- `mcp__plugin_mneme_memory__workflow_migrate`: YES, but ONLY in Step 7 (PLAN-AUTOMIGRATE), AFTER
  the Step 6 approval and Write — never on a draft. The TOOL writes the phase files; the skill
  itself writes nothing outside the approved spec (and its Step 7 format repairs).
- `mcp__plugin_mneme_memory__remember`: YES, but ONLY in Step 8 to STAGE the choice decision AFTER
  the Step 6 approval and Write — it QUEUES a note for review, it never publishes. `remember`
  before approval is FORBIDDEN.
- `mcp__plugin_mneme_memory__staging_list` / `mcp__plugin_mneme_memory__staging_resolve`: YES, but
  ONLY applying the user's explicit DIGIT from the finale's HANDOFF-DECISION menu (per the
  curation contract in Output format): `staging_list` to SHOW the queue — and the staged note's
  card right after Step 8's `remember` — and `staging_resolve` to apply a per-note digit decision.
  Resolving without an explicit digit is a VIOLATION — the human gate is untouched.
- `mcp__plugin_mneme_memory__notes_list`: ONLY `{ id }` of the note the card's judge line names —
  the second body JUDGE-SUPERSEDE reads before a supersede recommendation; never a listing. ANY
  other memory tool is FORBIDDEN.

## Procedure

Eight steps, two hard stops. Steps 1-3 run in one turn and END at Step 4. Step 5 runs after the
user's choice and ENDS at Step 6. The Write happens only after Step 6 approval; Step 7 then
MIGRATES the approved spec into phase files (fail-fast, hot context); Step 8 STAGES the choice as a
decision note (it queues for human accept — it does not publish). Step 1's INPUT-CHECK may end the
turn before any recon: a spec input stops it, a failure or a page without an etalon asks first.

### Step 1: Take the task

Read the task from the argument. Restate it in one sentence so the user can see how it was
understood. Do not widen the scope beyond what was asked.

INPUT-CHECK — right after the restatement and BEFORE any recon, test the input against three
signals, in this order; the first that fires decides:

1. SPEC — the argument names a file whose text carries a `# Gameplan` heading (Grep it). That is a
   spec, not a task: END THE TURN with one line «это спека → `/mneme:migrate <путь>`» — no recon,
   no fan. The heading is a fact, so there is nothing to ask (dev's SPEC-FILE GUARD wording).
2. FAILURE — the argument reports a failure (an error text, a red test, «работало — сломалось»,
   behaviour that diverges from what the code should already do) and asks for no new behaviour.
3. PAGE-WITHOUT-ETALON — the argument describes a new page or screen, or names a page brief, and
   `design/pages/` holds no etalon for it.

Signals 2 and 3 are judgements, and whether the input really is a failure or a page is the
USER's call — so they close the turn with a DECISION menu (the TOKEN-LINE replica opens it):

```
`1 — выдать команду /mneme:fix: <симптом одной фразой>`
`2 — продолжить plan: <задача, как понята>`
```

For signal 3 the first chip reads `1 — выдать команду /mneme:design: <страница одной фразой>`.
Exactly one chip carries «← рекомендую: <причина одной строкой>»; silence = pause. Digit `1` →
print the ready line as a fenced block and END — plan writes nothing. The line follows the
target's template, the same literal `/mneme:prompt` carries:

```
/mneme:fix "<симптом: что делал, что ожидал, что получил; текст ошибки дословно>"
/mneme:design "<страница или фича: для кого она и что на ней делают>"
```

The symptom goes in as the user described it — a hypothesis or a ready fix stays out, fix builds
its own hypothesis fan. Digit `2` → Step 2, the task as restated. No engine call exists at this
choice, so nothing is stamped. The SPEC stop prints `/mneme:migrate <путь>` with the real path.

### Step 2: Recon — code + memory

1. Call `mcp__plugin_mneme_memory__recall` with the task's key concepts (modules, files,
   technologies). Prior decisions and gotcha notes are the most valuable.
2. Call `mcp__plugin_mneme_memory__map_list {}` — the project map, one line per section.
   `The project map is empty.` → note «карта не построена» and continue without domains; the map
   is `/mneme:map`'s to build, never plan's.
3. Grep + Read the relevant code (max ~15 files) to ground the options in real file paths.
4. DOMAINS-PICK — when the map is not empty: the candidates are the domains whose `map_list` line
   names the task's area; read ONLY the candidates whole (`map_list { id }`) and keep a domain
   when one of its `anchors` is a file of the recon or a directory above one (a directory anchor
   covers everything inside it). The kept ids are the task's DOMAINS: call `recall` again with
   `domains: [<ids>]` — the narrowed answer opens with the domains' MAP blocks (the frame: the
   responsibility, invariants and entry points of the area) and keeps only the notes linked to
   them; `no map domain "<id>"` means the map changed under the recon — drop that id and say so.
   The domains ride into the finale's ready commands (Step 7). No candidate intersects → no
   domains, and the fan says so in its Context line.
5. Read repository context that exists anywhere — `CLAUDE.md`, `README`, `docs/` — for conventions
   and constraints, AND the project's RELEASE AUTOMATION: `.github/workflows/` (or the equivalent CI
   directory), release scripts, and the version fields of its manifests. That last target is what
   VERSION-BUMP-RULE decides on, and it lives nowhere near the prose documents — a recon that skips
   it makes the rule postmortem instead of preventive. Degrade gracefully when one is absent; "no
   automation found" is an ANSWER the rule acts on, not a gap. An empty or degraded recall (cold
   store, no stored vectors) is normal — note "memory empty" and continue.
6. If recall surfaces an antipattern note, EVERY option in Step 3 must state whether it triggers
   that antipattern. Silent ignore = VIOLATION.
7. ETALON-READ: when the task is «реализовать по эталону design/pages/<slug>/<slug>.json», Read
   the etalon file itself BEFORE the fan — it is the source of truth for the plan; corpus notes
   and `docs/` are the history of its decisions. Take from the file: every `proposal:<Name>`
   node (its `note`, props and slots) and every registry component the etalon uses (the names,
   the props it binds, its `data` and `states`). An etalon that is missing or does not read ENDS
   THE TURN with one named line (the path and what is wrong) — plan never invents an etalon.
   HTML etalons are unchanged by this rule.
8. GRILL-READ: when the task names an interrogation protocol `docs/GRILL-<slug>.md` — the phrase
   grill and grill-agent hand over is «по протоколу docs/GRILL-<slug>.md», the trigger is
   `по протоколу docs/GRILL-` — Read the protocol WHOLE BEFORE the fan. Its «Заблокированные
   решения» and the closed branches of its Knowledge and Conventions seeds are GIVEN: the fan does
   not re-open them, and they carry into the spec's Knowledge and Conventions. The branches marked
   «отдать plan'у (нужен веер)» ARE the fan's subject. The branches «отложено пользователем» stay
   out of scope, and Baseline names them. A protocol that is missing or does not read ENDS THE
   TURN with one named line (the path and what is wrong) — plan never reconstructs a protocol.

### Step 3: Fan out options

Present a fan of **2-3 options**. Each option carries:
- a short summary and how it works (concrete file paths / module names);
- honest **trade-offs** (specific pros and cons, effort small/medium/large, risk);
- a **done-when sketch** — how this option would be verified (see Output format for the two kinds);
- whether it triggers any antipattern surfaced by recall;
- when a sufficiency claim rejects it, or turns the recommendation away from it, that claim's check
  (SUFFICIENCY-RUN-RULE below).

Make recall findings VISIBLE in the fan as "prior experience: …" so the user sees what memory
contributed. A recommendation IS allowed (say which option and why), but it is a suggestion — the
choice is the user's.

**SUFFICIENCY-RUN-RULE — a sufficiency claim is proven by a run, not by a reading:** when an
option is rejected, or the recommendation leans away from it, on the claim «the existing mechanism
already handles the goal» — code the project already has (a script, a CLI, a function, a test)
would give the same or nearly the same result; a function counts only as called by a driver that
does nothing else, a test only under a runner that writes no cache or coverage — the fan attaches
that mechanism's RUN on the goal's REAL input: the command line and the deciding part of its
output, verbatim, in the option's «Проверка довода» field. Reading one of its functions is not a
run: in run df97db26 a reading of `seedOf` promised «почти то же» for jsmbars, and the run after
the code showed the seeds merged by slug in `mergeSameSlugSeeds`. The run rides the second Bash
carve-out in Permissions — the mechanism as it is, its entry point read first, no flag or step
that writes, no network. When no such run is possible (the mechanism writes by construction, the
input is not on this machine, the run needs a service), the claim is marked «не проверено» and is
never a reason to reject: the option stays in the fan on its other trade-offs, the RECOMMENDATION
does not cite the claim, and the spec (its Knowledge and its header comment alike) and the Step 8
note quote it only with its mark, never as a fact. A claim about a skill's own rule text is not a
mechanism — no input runs it, and this rule does not cover it.

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

ETALON-TASKS — for an implement-by-etalon `.json` task the Gameplan's tasks come from the etalon
file read at Step 2: every `proposal:<Name>` node becomes a task «компонент <Name>: <note>» with
the props and slots the node carries, and every registry component the etalon uses enters the
SAME task list as «привести <Component> к эталону» — the props, states and fixtures the etalon
binds. One plan per etalon, never two. The fan of Step 3 is about HOW (the phase split, where a
component lives), never about WHETHER a proposal is implemented — the digit at design's stage 4
decided that.

DESIGN-BOOK FIRST — when the etalon is the design book
(`design/pages/design-book/design-book.json`), its `proposal:<Name>` nodes are the project's BASE
KIT: they form the FIRST phase of the Gameplan, before the tasks of any page, one task per sample
(«компонент <Name>: <note>» — the sample's composition in the book is the visual reference); the
LAST task of that phase is the book's rebinding — an Edit of `design-book.json` that replaces every
proposal node with the registry component the server now lists, the checker green. A page planned
later takes the kit from the registry.

### Step 6: SPEC-REVIEW-HARD-STOP — review, then Write only on approval

Before showing it, walk the draft's `# Knowledge` and `# Gameplan` line by line against
SPEC-LINE-SHAPES (Output format) and repair every line outside those forms — the spec the user
approves must migrate on the first call. When a phase requires a self-test or a fixture of a tool,
compare the two Knowledge lists of SELF-TEST-CASES-RULE (Output format) — every rule of the tool
has a case, every case names its rule — and repair a rule left uncovered before the menu with a
case for it; only a rule no case can exercise becomes a named limit.

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
commands) and show the runnable `/mneme:dev <spec-slug> [until <id>] [domains <a,b>]` command.
DOMAINS-TAIL: when Step 2 picked domains, BOTH ready commands — the full run and every `until`
candidate — carry the tail `domains <a,b>` (the ids comma-separated, no spaces, after `until`);
`/mneme:dev` turns it into `recall_domains` for EVERY phase of the run, so each phase's bundle
opens with the same domains' MAP blocks the fan was framed by. The convention makes the tail
optional and printed only by a renderer that KNOWS the domains — plan is that renderer; migrate
never prints it. No domains → the commands exactly as before. plan still NEVER runs it.

### Step 8: STAGE-CHOICE — stage the decision

After the migration finale, UNCONDITIONALLY stage the choice as a decision note — this closes the
back half of the plan's memory loop (choice → memory), mirroring how `/mneme:dev` stages harvest
artifacts. Call `mcp__plugin_mneme_memory__remember` with `type: "decision"`, a `body` distilling
the fork (the CHOSEN option, the REJECTED options each with compressed trade-offs, and WHY the
choice won), and `anchors` set to the affected files (see Output format for how body and anchors are
built). `remember` only QUEUES the note — it does not publish and the skill never assumes
acceptance. Right after it, `staging_list` shows the note's card: its cosine line and, when a
judge is configured, its judge line ride the finale's queue entry as DATA. The second line of the
`remember` answer is relayed verbatim and enables nothing on its own — the finale's judge chip
comes from the card alone (JUDGE-SUPERSEDE in the curation contract). The queue is then curated
BY DIGIT through the finale's HANDOFF-DECISION menu (the curation contract in Output format) —
NEVER by telling the user to operate MCP tools.

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
"none — memory empty") · домены карты (`<ids>`, or «карта пуста» / «ни один домен не задет»)

### Option A: <name>
<summary> · **How** (files/modules) · **Trade-offs** (pros / cons / effort / risk) · **Done-when
sketch** · **Antipattern?** · **Prior experience** (from recall, if any) · **Проверка довода**
(SUFFICIENCY-RUN-RULE: the run's command and output, or «не проверено»; only when a sufficiency
claim rejects the option or turns the recommendation away from it)

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

**SPEC-LINE-SHAPES — the line forms the engine's spec parser accepts:** `workflow_migrate` reads
only `# Knowledge` and `# Gameplan`, and over both it is TOTAL — one line no rule covers refuses the
whole migration (Baseline, Stack and Conventions stay free prose). The forms, exhaustively:

- `# Knowledge` — after its first bullet every non-blank line is a top-level bullet `- …`, a
  continuation line indented under the bullet above, or an HTML comment. A paragraph with a bold
  label is written as a bullet, `- **Label.** …`; multi-line text (a command's output, an error
  text) goes as indented lines under its bullet, never as an unindented block.
- `# Gameplan` before the first phase — a preamble, customarily an HTML comment.
- A phase heading — `### Phase <N>: <id> — <title>`, the id at most 64 characters: a lowercase
  Latin letter first, then lowercase letters, digits and single hyphens. A dep-edge mark rides the
  title, after « — » — `(потребляет фазу N: <что берёт>)` or `(order-only после фазы N)`; written
  before « — » it would fold into the id.
- A task — `- [ ] <task>`; its continuation is indented and follows with NO blank line: a blank
  line closes the item, and an indented line after it is an error.
- Executable criteria — the line `**Done when (EXECUTABLE):**` with the first fence on the very next
  line, then the criteria back to back with no blank line between them, each one: an opening fence
  of three backticks (optionally `timeout=<N>s`, N from 1 to 3600), exactly one command line, the
  closing fence, then a line describing it; a blank line closes the block — a line right after the
  description (a marker, a task, a comment) is glued into it silently. The command is ONE argv that
  starts with a program, not a flag: no quotes, no `$(`, `&&`, `||`, `|`, `;`.
- `**Done when (AGENT-JUDGED):** <criterion and its justification>` — ONE line.
- `**Done when:** <acceptance prose>` — ONE line.
- Blank lines and HTML comments — between elements.
- Every phase carries at least one task and at least one executable criterion.

Step 6 checks the draft against these forms before the menu; Step 7's format repair is the safety
net for a parser change this list has not caught up with, never the plan.

**Multi-phase is native:** `/mneme:dev` takes the WHOLE set of phases in one run, and `until
<phase-id>` boundaries give staged entry. Do NOT warn about one-phase-at-a-time — that limit is
gone. A spec yields a CHAIN: the engine's spec parser makes every phase depend on the one before
it, so the order of phases in the Gameplan IS the order of the run — choose it deliberately, and
let the map's boundary candidates suggest the `until` points. What each edge carries is a mark in
the phase title (REAL-DEP-SMOKE-RULE); a spec has no line of dependencies to write.

**TYPECHECK-CRITERION-RULE — the done-when generator's rule:** every CODE phase automatically gets
the project's typecheck criterion as an ADDITIONAL executable done-when — IF the project carries a
typecheck script (its own, e.g. a `typecheck` entry in package.json; the concrete command, never a
guessed one). The GENERATOR holds this rule, not the author: the user does not have to remember to
ask for it, and a code phase missing the project's typecheck gate is a generator bug, not a style
choice. Non-code phases (docs, prose skills) do not get it.

**WIRE-PHASE-RULE — the integration-phase generator's rule:** every Gameplan with 2+ CODE phases
automatically ENDS with a terminal `wire` phase — the last link of the chain, its title marked
`(потребляет фазы 1-N)` over all the code phases. The GENERATOR holds this rule, not the author
(the TYPECHECK-CRITERION-RULE precedent): unit gates look INSIDE their module by construction, so
wiring — the imports, the composition in the entrypoint — is work
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
"реализовать по эталону design/pages/<slug>/…" automatically carries the acceptance checklist
in its Knowledge — the implementation is accepted by comparing AGAINST the etalon folder, and
the checklist follows the etalon's FORMAT, read from the extension in the task phrase:
`<slug>.html` — section structure, the full state set, the accent-dosage rule, and the
measurement units; `<slug>.json` — the node structure, the full state set, the data bindings,
the absence of raw values, and the proposals: every `proposal:<Name>` node exists as a component
the registry lists after the server's rebuild, with the props the node binds. A section drawn with
`Element` over a third-party primitive that renders bare and takes only a `className` never
becomes a registry component, so it is accepted visually — the rendered page against the etalon's
preview — never by comparing nodes to props; that same acceptance covers the typography of native
controls, which inherit nothing: the `font: inherit` declaration, or an explicit binding to the
same token, must survive the move to tokens. The GENERATOR holds
this rule, not the author (the TYPECHECK-CRITERION-RULE precedent); it is a HUMAN acceptance
procedure, never disguised as an agent-judged criterion.

**REAL-DEP-SMOKE-RULE — honest dep edges:** a spec's phases form a chain — each depends on the one
before it — and in a multi-phase Gameplan every edge must declare what it carries, as a mark in the
consumer phase's heading title, after « — ». An edge that carries CODE CONSUMPTION ("phase B uses X
from phase A") is marked `(потребляет фазу N: <что берёт>)` — `(потребляет фазы N-M: …)` for
several — and gives the CONSUMER phase an ADDITIONAL executable done-when criterion that exercises
the REAL X — importing the actual upstream module; a mock in THIS criterion is forbidden. An edge
that is pure ordering is marked `(order-only после фазы N)`. The generator makes the distinction at
draft time — plan has just designed who consumes whom, so an unmarked, criterion-less edge is a
generator bug. This keeps the chain from lying about connectivity: `(order-only после фазы 3)`
means execution order only, and an agent can honestly finish phase 4 without importing anything
from phase 3 — a failure the wire phase alone would catch only at the very end, while the smoke
criterion catches it fail-fast at the consumer's own gate.

**SELF-TEST-CASES-RULE — the self-test generator's rule:** when a phase requires a self-test or a
fixture of a tool (a script, a checker, a guard, a parser), the spec's Knowledge carries two lists
and derives the second from the first one to one. The tool's RULES: every guarantee its contract
states — what it refuses, what it counts only under a condition, its exit codes, its flags and
modes, what it restores, compares or leaves untouched; for a new tool that is what the spec itself
says of it, for an existing one its header and usage. The CASES, each written as
`<правило> → <случай, который падает без него>`: every rule has at least one case, and every case
names the rule it proves. A rule without a case is a hole only a reviewer finds later, by
corrupting a copy of the tool: in run dc9ade0c the spec gave the self-test of prove-guard-mutations
7 cases, four of the script's rules got none, the reviewer's corruptions landed exactly there, and
the self-test grew to 18. A rule no case can exercise is named in the Knowledge's limit note,
visible at the review — never dropped silently (the UI-limit honesty of WIRE-PHASE-RULE). The
GENERATOR holds this rule, not the author (the TYPECHECK-CRITERION-RULE precedent); Step 6
compares both lists before the menu.

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
FIRST boundary candidate from GRAPH-MAP + the full run to the terminal + note curation, plus the
judge chip when the card carries the judge's recommendation (JUDGE-SUPERSEDE). The
combined item «принять заметку и выдать команду …» is legal by COMBINE-VISIBILITY — the note is
shown whole in this same message. Launch is ALWAYS manual (`disable-model-invocation`): on a digit
the skill resolves the note itself and prints the chosen ready command as a fenced block — the
user runs it. Literal shape:

```
create: <N> · identical: <M> · conflict: <K>
Спека записана: docs/<SPEC-…>.md · фазовых файлов применено: <W>

<GRAPH-MAP по конвенции mneme:migrate — таблица фаз, кандидаты границ, готовые /mneme:dev команды,
каждая с хвостом domains <a,b>, когда домены выбраны в Step 2>

В staging 1 заметка (показана целиком):

1. [decision] <суть выбора одной строкой> — якоря: <anchors>
   <строка косинуса и строка судьи с карточки staging_list, дословно>

`1 — принять заметку и выдать команду полного прогона`
`2 — принять заметку и выдать команду until <первый-кандидат>`
`3 — отклонить заметку`
`4 — заменить заметку <id> и выдать команду полного прогона`
```

(the fourth chip is present ONLY when the card carries `recommends supersede of <id>` —
JUDGE-SUPERSEDE in the curation contract; digit `4` resolves
`{ decision: "supersede", supersede_target: <id> }` and prints the full-run command. The
«← рекомендую: <причина одной строкой>» suffix rides exactly ONE option; silence = pause — plan
does not move without a digit)

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
- JUDGE-SUPERSEDE — the staged note's card (`staging_list` right after Step 8's `remember`) may
  carry the judge line in one of three forms: `recommends supersede of <id>`,
  `supersede not recommended`, `judge: unavailable`. ONLY the first adds a fourth chip to the
  finale menu, `4 — заменить заметку <id> и выдать команду полного прогона`; the other two and a
  missing line give no supersede recommendation. Before «← рекомендую» lands on that chip,
  read both bodies — the staged note from its card, `<id>` through `notes_list { id }` — and
  confirm the new note replaces the old one; otherwise the recommendation moves to accept or
  reject with the reason, and the chip stays — the digit is the human's. The chip resolves as
  `staging_resolve { id, decision: "supersede", supersede_target: <id> }` with the same menu
  payload as an accept.
- RESOLVE-INDEX — a `staging_resolve` may answer three lines: the usual outcome line,
  `Index not rebuilt: <reason>`, and `The decision is committed — do not retry it; the index
  catches up on the next successful rebuild.` That is a принятое решение, не ошибка: the note is
  accepted (or rejected) and committed, it counts in «принято / отклонено» as usual, the reason is
  relayed verbatim, the call is NOT repeated — не повторять, a second call writes a second event —
  and the finale carries one line «индекс не пересобран: <reason>; догонит при следующем чтении».

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
  chosen_position: <фактическая цифра>}`; with the judge chip the menu has four options, so the
  payload is `options_n: 4` and chosen_position stays the actual digit — the supersede resolve is
  stamped like an accept. Combined options (COMBINE-VISIBILITY) change NOTHING:
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
  A sufficiency claim the fan marked «не проверено» keeps that mark in the body and is never the
  WHY of a rejection (SUFFICIENCY-RUN-RULE).
- **anchors** — the affected files, and they MUST be repo-relative AND git-tracked (an untracked
  anchor is a dead-anchor sink that drops the note to the bottom of recall). A plan often touches
  files that do not exist yet — anchor to the already-tracked files it affects, never to
  not-yet-created ones.
- **anchors when the decision shapes code that does not exist yet** — the prohibition above has a
  POSITIVE half: a note about not-yet-written code carries tags, not invented anchors. Give NO path
  anchors at all and tag it instead — domain concepts, planned module names, the feature slug. Do
  NOT anchor to neighbouring existing files "for coverage", and never to the spec (it lives in
  gitignored `docs/`). Path anchors belong to the implementation notes `/mneme:dev` harvests once
  the files exist. The engine legalizes this: a note is valid when EITHER `anchors` or `tags` is
  non-empty, and a pathless note takes a NEUTRAL rank pin, not the dead-anchor penalty. A decision
  that touches BOTH — some files already tracked, some yet to be written — anchors the tracked ones
  and tags the rest; it never invents a path for the rest.

  The pathless form, literally:

  ```
  remember({
    type: "decision",
    body: "<the fork distilled>",
    anchors: [],
    tags: ["<feature-slug>", "<planned module name>", "<domain concept>"],
    menu: { ... }
  })
  ```

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
- JUDGE-SUPERSEDE — the fourth chip of the finale exists only on the card's
  `recommends supersede of <id>` and is recommended only after both bodies were read.
- PLAN-AUTOMIGRATE FAIL-FAST — Step 7 drives `workflow_migrate` validate → apply-if-clean in one
  pass; a FORMAT error is fixed by the skill itself in the hot context (re-Write + re-migrate,
  meaning untouched), a MEANING-level fix goes back to the user; the finale is the GRAPH-MAP
  (shared convention, defined in the `mneme:migrate` skill) plus a ready dev command.
- SPEC-LINE-SHAPES — every line of the draft's Knowledge and Gameplan takes one of the forms the
  engine's spec parser accepts (Output format); Step 6 checks the draft against them before the
  menu, and Step 7's format repair stays the safety net, never the plan.
- FAN IS MANDATORY — at least 2 options with honest trade-offs; a genuine single-option task is
  stated explicitly as "one option, confirm", never resolved silently. Even trivial tasks pass
  through confirmation.
- WRITE ONLY THE APPROVED SPEC — `Write` fires after Step 6, into `docs/`, nowhere else and never
  before approval; the ONLY re-Write is Step 7's format repair of that same approved file.
- STAGE THE CHOICE — Step 8 UNCONDITIONALLY stages the decision (chosen + rejected + why) via
  `remember`, closing the choice → memory loop; it only QUEUES for human accept and NEVER publishes.
  Anchors must be git-tracked (already-existing files, not future ones), and a note about
  not-yet-written code carries tags, not invented anchors — no path anchors at all, never a pulled-in
  neighbour and never the spec.
- EVIDENCE-BASED — every option references a specific file or recalled note; name files and
  modules, not "consider separating concerns".
- SUFFICIENCY-RUN-RULE — a rejection, or a recommendation turned away, on «the existing mechanism
  already handles the goal» carries that mechanism's run on the goal's real input (the second Bash
  carve-out); without a run the
  claim is «не проверено», never a reason to reject, and keeps its mark in the spec and the note.
- ETALON-READ — an implement-by-etalon `.json` task reads the etalon file at Step 2, before the
  fan: proposal nodes become tasks, the registry components it uses are brought to the etalon in
  the same task list, the design book's proposals build the base kit first, before any page, and
  a missing or unreadable etalon ends the turn with a named line; plan never invents an etalon.
- INPUT-CHECK — Step 1 tests the input before any recon: a file carrying `# Gameplan` ends the turn
  with «это спека → `/mneme:migrate <путь>`»; a failure or a page without an etalon closes the
  turn with the two-chip menu (hand over the ready `/mneme:fix` or `/mneme:design` line, or go on
  with plan), because what the input is stays the user's judgement; plan writes nothing on digit 1.
- GRILL-READ — a task naming `docs/GRILL-<slug>.md` reads the protocol whole at Step 2, before the
  fan: its locked decisions are given, its «отдать plan'у» branches are the fan's subject, its
  deferred branches stay out of scope, and a missing protocol ends the turn with a named line.
- RECALL IS VISIBLE — surface what memory contributed in the fan; an antipattern note forces every
  option to declare whether it triggers it.
- DOMAINS — Step 2 reads the map (`map_list {}`, then `{ id }` for candidates only), keeps the
  domains whose anchors meet the recon's files, recalls again with `domains`, names them in the
  fan's Context line and prints the `domains <a,b>` tail in BOTH ready commands of the finale;
  plan never writes the map.
- RESOLVE-INDEX — a resolve answering `Index not rebuilt:` is a принятое решение, не ошибка:
  counted as usual, reason relayed verbatim, the call не повторять.
- DONE-WHEN JUSTIFIED — pick executable or agent-judged per the outcome's nature and justify the
  choice; an unformulatable executable criterion is a signal to raise the question, not to write a
  prose stub.
- SIZE FOLLOWS THE TASK — a one-phase spec for a small task is normal; do not inflate to
  multi-phase. Multi-phase is native to dev (one run, until boundaries) — no warning needed.
- TYPECHECK-CRITERION-RULE — the generator, not the author, adds the project's typecheck criterion
  to every code phase when the project carries a typecheck script.
- WIRE-PHASE-RULE — the generator, not the author, appends a terminal `wire` phase (the last link
  of the chain, titled `(потребляет фазы 1-N)`; real-module e2e of the main path, mocks only at
  the network/system boundary, definite-target executable done-when) to every Gameplan with 2+ code
  phases; removal is the user's Step 6 move.
- REAL-DEP-SMOKE-RULE — the generator, not the author, makes every edge of the chain honest by a
  mark in the consumer phase's title: a code-consuming edge is `(потребляет фазу N: …)` and adds a
  real-module executable smoke criterion to the consumer phase, a pure-ordering edge is
  `(order-only после фазы N)`.
- SELF-TEST-CASES-RULE — the generator, not the author, derives a tool's self-test or fixture
  cases in Knowledge from the tool's rules one to one (rule → the case that fails without it);
  Step 6 compares both lists before the menu, and a rule no case can exercise is a named limit.
- VERSION-BUMP-RULE — the generator, not the author, decides whether a version-bump phase exists: it
  is generated ONLY when the recon (Step 2.5, release automation included) found no automation that
  bumps the project itself; evidence found → no phase, and Baseline names the automation. Where the
  phase is legitimate its task is an INCREMENT, never a literal «X → Y», and the derived artifacts
  the recon found (release pins, version stamps) enter the same phase.
- LANGUAGE: English body + Russian runtime user-facing output.
