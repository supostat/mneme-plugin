---
name: design
description: design UI pages as HTML or JSON etalons before any code
allowed-tools: [Read, Grep, Write, Edit, Bash, mcp__plugin_mneme_memory__recall, mcp__plugin_mneme_memory__remember, mcp__plugin_mneme_memory__staging_list, mcp__plugin_mneme_memory__staging_resolve]
disable-model-invocation: true
---

# /mneme:design — Design UI pages as reviewed HTML or JSON etalons, before any code

An ENTRY skill of the plan family: multi-turn, gated by HARD STOPS, and NOT an engine run — every
design gate is HUMAN, at the skill level (the two-hard-stop precedent of `/mneme:plan`). The
engine and the mneme MCP tools are untouched. Its place in the pipeline:

задача/спека → `/mneme:design` (эталоны) → `/mneme:plan` «реализовать по эталону
`design/pages/<slug>/<slug>.<html|json>`» → migrate → `/mneme:dev`.

design NEVER launches plan — the finale hands over the READY phrase as a fenced block (the grill
precedent); running it is the user's move.

The skill drives ONE UI task through FOUR stages; each stage ends in a HARD STOP — the turn ends,
and continuation happens only on the user's explicit confirmation. Whether a stage's outcome is
"obviously fine" is the USER's judgement, never the agent's.

## Arguments

`/mneme:design "<UI task in words>"` — the feature or page(s) to design, in plain language.

No argument → ask for the task in one line (numbered prompt). Never invent a task.

## Mode — HTML or JSON, decided by the registry

The etalon FORMAT is a function of ONE fact: `design/system/registry.json` EXISTS → JSON mode;
it does not → HTML mode. Nothing else switches the mode — not a flag, not the user's wording, not
the presence of a running server.

- The registry is the project's component truth, GENERATED and REWRITTEN by the Melete design
  server (`/mneme:design-server`) at every start and whenever the component sources change. This
  skill READS it and NEVER writes it — a hand-edited registry is a VIOLATION.
- JSON mode changes stages 2 and 3 (what gets written) and the fixation list of stage 4 (what
  gets checked); stage 1 is the same text analysis in both modes, and stage 4 keeps its shape.
- At the ENTRY of stage 2 in JSON mode the skill Reads the registry: its component names and
  props are the composition material. A registry that does not read as JSON or is off its shape
  ENDS THE TURN with one named line and its remedy — «реестр не читается: <что> — подними
  `/mneme:design-server`, реестр пишет только сервер» — and the skill never slides into HTML mode.
- STALE-REGISTRY RULE: a component that exists in the code but not in the registry means the
  server is not running or has not rebuilt yet. The remedy is always the server, never the file.
- PREVIEW URL: once, at the entry of stage 2 in JSON mode, if `.melete/server.out` exists, Read
  it and print its first `http://127.0.0.1:<port>` line as DATA — the preview is the user's window
  onto every JSON file of the page folder. No file → nothing is printed; the skill never probes
  the server and never starts it.
- In the server's OWN chat session a PostToolUse hook validates every write of `<slug>.json` and
  feeds its verdict back as context; in a terminal session there is no such hook. The skill
  treats that context as VERDICT input when it arrives (stage 3) and works exactly the same when
  it does not.

## Artifacts — in the TARGET project's repo, never in the corpus

- **A page is a FOLDER** `design/pages/<slug>/` — the etalon `design/pages/<slug>/<slug>.html`
  (HTML mode: ONE file per page, all states and fixtures INSIDE, deliberate decisions annotated
  via HTML comments / data-attributes) or `design/pages/<slug>/<slug>.json` (JSON mode: the etalon
  v1 document of `### JSON-ETALON-CONTRACT`, decisions annotated in node `note`s) plus THAT page's
  composition drafts (`<slug>-draft-*.html` / `<slug>-draft-*.json`) and future iterations. The
  slug `index` is RESERVED for the pages index and FORBIDDEN as a page.
- **Pages index** `design/pages/index.html` — links to every page folder as `<slug>/<slug>.html`
  or `<slug>/<slug>.json`; maintained at fixation (see PAGES-INDEX in Stage 4) and guarded by the
  checker's NO-INDEX-LINK error.
- **Shared layer** `design/system/` — HTML mode: `tokens.css`, `components.html` (a living pattern
  catalog), `DESIGN.md` with a MANDATORY anti-patterns-and-selection-rules section. JSON mode:
  `tokens.css` (the token vocabulary — every `$token.<name>` must be declared there) and the
  generated `registry.json`, which the server owns; `components.html` and `DESIGN.md` are neither
  created nor required in JSON mode.
- Etalons LINK the shared layer, they never copy it into themselves — copying = VIOLATION.

## Permissions (VIOLATION = ABORT)

- Read / Grep: YES — recon of the task's context, project schemas/migrations/fixtures (hypothesis
  material only, see CARDINALITY-SOURCE), the shared design layer, the registry, the preview
  banner in `.melete/server.out`, and the screenshot the server's hook names (stage 3).
- Write / Edit: YES, but ONLY under `design/` of the target repo (pages/ and system/), and each
  file only at the stage that owns it (stage 2 rough variants, stage 3 the detailed etalon +
  EMPTY-LIBRARY scaffold, stage 4 annotations/final touches). Edit is what a SECOND version of a
  reviewed etalon takes — a patch of the file that exists, never a rewrite of the whole page.
  `design/system/registry.json` is never written — the server owns it. Writing or editing
  anywhere outside `design/` is a VIOLATION.
- Bash: ONLY to invoke the bundled etalon checker at stage 4 (see FIXATION-CHECK) and the
  read-only session-tokens call before rendering a DECISION block (the TOKEN-LINE replica in
  Output format). Any other Bash use is a VIOLATION — the design server is started and stopped
  by `/mneme:design-server`, never from here.
- `mcp__plugin_mneme_memory__recall`: YES — at the ENTRY of stage 1 (selection rules and prior
  decisions are the most valuable context; render findings as «prior experience»).
- `mcp__plugin_mneme_memory__remember`: YES, but ONLY at stage 4 (fixation) — it QUEUES notes for
  review, it never publishes; the skill never assumes acceptance.
- `mcp__plugin_mneme_memory__staging_list` / `staging_resolve`: YES, but ONLY applying the user's
  explicit DIGIT from the finale's HANDOFF-DECISION menu, per the curation contract below.
  Resolving without an explicit digit is a VIOLATION — the human gate is untouched.

## Procedure — four stages, four stops

### Stage 1: UI-анализ (text, NO HTML, NO JSON) → DESIGN-ANALYSIS-HARD-STOP

Recall first (task topic), then produce a TEXT analysis:

- pages of the feature and what each one does;
- data with CARDINALITIES and extremes (see CARDINALITY-SOURCE below);
- actions with hierarchy — primary/secondary, and where icons are warranted;
- decisions DERIVED from the cardinalities (filter / search / sort / pagination — each tied to the
  number that forces it);
- the FULL state set: empty / loading / error / partial states;
- STRICTLY SEPARATE blocks: решения / допущения / вопросы к пользователю — silent assumptions are
  a VIOLATION;
- a separate block «предложения сверх спеки», each item marked [ui] or [functional]; the verdict
  on every proposal is the USER's. A [functional] proposal NEVER enters the etalon without an
  explicit user verdict; a rejected proposal leaves as a staged note with the reason (stage 4).

END THE TURN (DESIGN-ANALYSIS-HARD-STOP). Questions and proposal verdicts are answered by the
user; iterate the analysis until the user says to proceed.

CARDINALITY-SOURCE: the PRIMARY source is the user's answers to the stage-1 questions. Read/Grep
of the project's schemas, migrations and code fixtures is allowed as a source of HYPOTHESES only —
they are presented in the допущения block, never as решения. Reading a live DB/API is outside this
skill's tools and FORBIDDEN.

### Stage 2: Композиция (rough drafts) → DESIGN-LAYOUT-HARD-STOP

HTML mode: 2-3 rough layout variants written to the PAGE'S OWN folder `design/pages/<slug>/` as
clearly-marked drafts (`<slug>-draft-*.html`). STRUCTURE, not aesthetics — style adjectives are
FORBIDDEN at this stage. The variants close with a DIGIT menu (per dev's `## OUTPUT-GRAMMAR`:
vertical chips, exactly one reasoned «← рекомендую», silence = pause). END THE TURN; the layout
choice is the user's digit.

JSON mode — ONE DRAFT PER TURN: the preview shows exactly one file at a time (the last one
written), so the stage moves at the pace the user can see. Read the registry and, if present, the
preview banner (see `## Mode`); then Write ONE draft `design/pages/<slug>/<slug>-draft-a.json` —
an etalon v1 document built from the four primitives only (`Stack`, `Row`, `Text`,
`Placeholder` with a label naming what will stand there), structure without aesthetics — and
close the turn with the draft menu (a layer-3 template of this skill, see Output format):

```
`1 — взять этот вариант`
`2 — следующий вариант`
`3 — правки этого варианта`
```

`2` writes the NEXT letter (`<slug>-draft-b.json`, then `-draft-c.json`) as a new file and
re-asks; more than three drafts only on the user's explicit word. `3` patches the current draft
with Edit and re-asks. Drafts STAY on disk — the skill cannot delete files, and the checker, the
lint and the server's hook all ignore drafts. END THE TURN at every draft; the layout choice is
the user's digit.

Iterations at any stage are REPLACE (refine the chosen direction) or BRANCH (alternatives to
compare) — never mixed in one pass; the NUMBER of variants is the user's decision.

### Stage 3: Детализация → DESIGN-DETAIL-HARD-STOP

HTML mode: the full HTML of the chosen variant in `design/pages/<slug>/<slug>.html`: components
and tokens from the shared library, ALL states from stage 1, STRESS FIXTURES — типичная /
минимальная / экстремальная (long strings, 100-200 items) — with an in-file switcher (inline JS +
data-attributes, zero external dependencies). The etalon declares its fixtures and states in a
machine-readable MANIFEST (meta/data-attributes) — the checker's contract: declared ↔ present.

JSON mode: the full etalon of the chosen variant in `design/pages/<slug>/<slug>.json` per
`### JSON-ETALON-CONTRACT`, components from the registry (primitives only where the registry has
nothing to offer), every prop value a literal, a `$data.<path>` or a `$token.<name>`:

- WRITE ONCE, THEN PATCH — the first version is ONE `Write` of the whole file (the preview streams
  a Write as it grows); every later change is an `Edit` patch of the file that exists.
- STRESS FIXTURES IN DATA — `data` carries the same three fixtures `typical` / `minimal` /
  `extreme`, and EVERY fixture carries EVERY bound `$data` path: minimality lives in the VALUES
  (empty lists, nulls, zeros), never in a missing key.
- STATES ARE OVERRIDES — `states` carries every state of stage 1 except `default`, each as an
  override of at least one bound path (empty / loading / error are expressed through data, never
  through markup); `default` is implied and NEVER declared. The `data` and `states` keys ARE the
  manifest: declared ↔ present means every fixture is complete for the bindings and every state
  overrides something a node binds.
- HOOK VERDICT — in the server's session every write of `<slug>.json` returns context from the
  Melete hook: a first line `etalon <slug>: N issues, M proposals`, then `- CODE [nodeId]: message`
  lines, last a `screenshot: <path>` line. Treat it as VERDICT input: repair every issue line by
  Edit BEFORE the hard stop, and look at the screenshot ONCE with Read right before the stop. No
  context (a terminal session) → the stage runs exactly as in HTML mode.

EMPTY-LIBRARY: an absent or empty `design/system/` is initialized HERE with a minimal scaffold —
announced EXPLICITLY in the turn. HTML mode: tokens.css with a base scale, an empty
components.html, DESIGN.md with the mandatory anti-patterns-and-rules section. JSON mode: ONLY
`tokens.css` — created (or given its custom properties) before the first `$token` binding; the
registry is the server's, and `components.html` / `DESIGN.md` are not part of the JSON layer.
This is initialization of an empty layer, NOT bootstrap-extraction from existing pages (that is
out of scope). The scaffold DESIGN.md's anti-patterns section SEEDS fifteen one-liners (data for
humans and review — no detector exists for them; each written as "name — why", own wording):
nested-cards (a card inside a card reads as chrome, not content), gradient-text (decorates the
words instead of the message), ai-color-palette (purple-teal-on-dark reads as generated),
pulsing-dot (fake liveness), marketing-buzzword (streamline/empower say nothing literal),
low-contrast (style that costs readability), tight-leading (dense lines exhaust the eye),
justified-text (rivers of whitespace on the web), all-caps-body (shouting body copy), oversized-h1
(a heading that crowds out the content), dark-glow (halo effects around panels), marquee (motion
that steals attention from reading), icon-tile-stack (rows of icon tiles as filler), cream-palette
(the safe beige default of generated pages), flat-type-hierarchy (every line the same weight —
nothing leads).

END THE TURN; the user reviews the detailed etalon (open the file, flip fixtures — or watch the
preview) and confirms or iterates (replace/branch).

### Stage 4: Фиксация → finale (FINALE-CLASS-HANDOFF)

0. PROPOSAL-VERDICTS (JSON mode, BEFORE the fixation check) — for EVERY `proposal:<Name>` node
   of the etalon, one separate DECISION turn with the proposal menu (a layer-3 template of this
   skill, see Output format):

   ```
   `1 — принять как задачу`
   `2 — заменить существующим <кандидат из реестра>`
   `3 — отклонить`
   ```

   `1` keeps the node as `proposal:<Name>` — it becomes a decision note at MEMORY below and a task
   of the implementation; `2` patches the node with Edit to the named registry component and its
   props; `3` removes the node and every reference to it in `children` / `slots`, by Edit. The
   candidate in `2` is named only when the registry offers one; without a candidate the chip reads
   «заменить существующим» and the user names the component.
1. FIXATION-CHECK — the mechanical postconditions, ONE list checked by BOTH layers. HTML mode:
   (1) the shared layer is linked (`../../system/tokens.css`);
   (2) every DECLARED fixture and state is present (manifest ↔ file);
   (3) no values bypassing tokens.css (raw hex/px outside `var(--…)` — a heuristic; its
   false-negatives are honestly documented in DESIGN.md).
   JSON mode:
   (1) every non-proposal node's component is a registry component or a primitive, and its props
   exist there (required ones present, enums within their values);
   (2) every fixture carries every bound `$data` path and every state overrides a bound path;
   `default` is not declared;
   (3) node ids are unique, parents come before their children, every referenced id exists and
   has one parent, every proposal carries a `note`, every `$token` is declared in tokens.css;
   (4) the file is `<slug>/<slug>.json` and its `slug` field equals the folder.
   Layer 1 — the MANDATORY checklist run by the skill itself (Read/Grep, rendered as a verdict
   list). Layer 2 — the bundled machine checker, the same call in both modes:
   `node "$CLAUDE_PLUGIN_ROOT/scripts/check-design-etalon.mjs" design/pages/<slug>/<slug>.html`
   (JSON mode: the same path with `.json`). Its JSON branch prints the codes of the Melete
   validator plus its own (`### JSON-ETALON-CONTRACT`), and after any UNKNOWN-* code a hint that
   the registry and tokens are the server's to rewrite. DEGRADE honestly: if
   `$CLAUDE_PLUGIN_ROOT` is empty in the Bash environment, SKIP layer 2 WITH an explicit message
   (layer 1 stands) — never fake a machine verdict. The server's hook, where it exists, only
   ACCELERATES stage 3; the checker remains the gate in both environments.
2. PAGES-INDEX — a PROPERTY of fixation, like the checklist above: update
   `design/pages/index.html` with the page's link (`<slug>/<slug>.html` or `<slug>/<slug>.json` +
   a human-readable page name); a missing index is CREATED at the first fixation (a minimal link
   list — the index is utility, linking the system layer is optional). The checker guards this
   duty with the NO-INDEX-LINK error: a fixation that forgot the index goes red, never silently
   stale.
3. PATTERN-CANDIDATES (HTML mode): anything repeated 2-3 times across etalons is a CANDIDATE for
   components.html / DESIGN.md — presented as an explicit item, promoted only on the user's
   confirmation. In JSON mode the component set is the registry's — a repeated composition is a
   proposal for the project's code, staged as a note, never a file under `design/system/`.
4. MEMORY: `remember(type: "decision")` for ACCEPTED decisions, for ACCEPTED proposals (the
   `proposal:<Name>` nodes kept at step 0) AND for REJECTED proposals with the refusal reason;
   problems noticed on NEIGHBOR pages go as proposal notes too — a silent edit of another page is
   a VIOLATION. Anchors: repo-relative, git-tracked files (existing pages/schemas; a freshly
   created, not-yet-committed etalon is not an anchor).
5. HANDOFF: the ready phrase, fenced — the extension is the etalon's:

```
/mneme:plan "реализовать по эталону design/pages/<slug>/<slug>.<html|json>"
```

The finale message closes with the HANDOFF-DECISION menu (queue curation + handoff, per the
curation contract below); a prose list of next commands is a VIOLATION. The literal shape (fill
the placeholders, never re-lay them out):

```
`1 — прими все`
`2 — поштучный разбор`
`3 — отклони все`
`4 — дальше`
```

(the «← рекомендую: <причина одной строкой>» suffix rides exactly ONE option; the handoff phrase
is DATA shown above the menu — accepting notes and handing over the phrase are what the digits
command; silence = pause)

### JSON-ETALON-CONTRACT — the etalon v1 document of the Melete design server

The contract is the server's code; this section is its text for the agent, and the bundled
checker enforces it. A JSON etalon is ONE strict object — an unknown key anywhere is an error:

- `melete`: the literal `1`.
- `slug`: `^[a-z0-9][a-z0-9-]*$`, equal to the page folder; the file is `<slug>/<slug>.json`.
- `name`: a non-empty human-readable page name.
- `data`: at least one fixture; keys are fixture names (the slug pattern), values are objects of
  the page's data. Every `$data` path a node binds must exist in EVERY fixture.
- `states` (optional, default `{}`): keys are state names (the slug pattern, never `default`);
  values are objects «path → value», each path `^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$`, applied over
  the fixture. A state that overrides no bound path is an error (UNUSED-STATE).
- `nodes`: a non-empty ordered list; the FIRST node is the root, and every parent is declared
  BEFORE its children. Each node is a strict object:
  - `id`: the slug pattern, unique across the file;
  - `component`: a registry component name, a primitive name, or `proposal:<Name>` for a
    component the project does not have yet;
  - `props` (default `{}`): any JSON; a string starting with `$` MUST be a binding —
    `$data.<path>` or `$token.<name>` (`[A-Za-z0-9_-]+`), anything else with a leading `$` is an
    error;
  - `children` (default `[]`): ids placed into the component's `children` prop (which must be a
    `node` prop);
  - `slots` (default `{}`): «prop name → ids» for the other `node` props;
  - `note` (optional, non-empty): the deliberate decision behind the node; MANDATORY on a
    proposal.
- Bindings: `$data.<path>` reads the current fixture (with the state's overrides on top);
  `$token.<name>` reads `--<name>` from `design/system/tokens.css`. A literal value is anything
  else. Enum props are checked only for literals.
- Primitives (always available, not part of the registry): `Stack` {gap string, align
  start|center|end|stretch, children node}; `Row` {gap string, align, wrap boolean, children
  node}; `Text` {text string REQUIRED, tone string}; `Placeholder` {label string REQUIRED, height
  string} — a `Placeholder` has NO children prop: nesting under it is SLOT-NOT-NODE.
- Proposals: `proposal:<Name>` nodes are counted, never validated against the registry, and must
  carry a `note`; the preview draws them as labeled placeholders; their fate is decided by the
  PROPOSAL-VERDICTS menu at stage 4.
- The registry (`design/system/registry.json`) is generated by the server from the project's
  component types: `components[]` with `name`, `props[]` (`name`, `type` — string | number |
  boolean | node | function | object | unknown | enum with `values` — and `required`). A
  component missing there is UNKNOWN-COMPONENT; the remedy is the server, never the file.
- Checker codes of the JSON branch — the fourteen of the Melete validator: UNKNOWN-COMPONENT,
  UNKNOWN-PROP, MISSING-PROP, BAD-ENUM, UNKNOWN-TOKEN, MISSING-FIXTURE-PATH, UNUSED-STATE,
  DUPLICATE-ID, ORPHAN-NODE, UNKNOWN-NODE, MULTIPLE-PARENTS, PARENT-AFTER-CHILD,
  PROPOSAL-WITHOUT-NOTE, SLOT-NOT-NODE — plus the checker's own: INVALID-ETALON (not JSON, or off
  this contract; reported alone), SLUG-MISMATCH (file name or `slug` field ≠ folder), NO-REGISTRY
  (registry missing or unreadable; reported alone, with the remedy), RESERVED-SLUG and
  NO-INDEX-LINK (shared with HTML). RAW-HEX, RAW-PX and NO-TOKENS-LINK do not apply to JSON.

## Output format

Every render follows the shared five-block grammar — STATUS / PROSE / DATA / VERDICT / DECISION —
DEFINED once in the `mneme:dev` skill's `## OUTPUT-GRAMMAR` (re-stating it here is a VIOLATION).
design OWNS five layer-3 templates: the анализ render (PROSE context + DATA blocks решения /
допущения / вопросы / предложения + closing DECISION when verdicts are pending), the композиция
fan (DATA variants + closing DECISION menu — this IS the layout hard stop; in JSON mode the DATA
is the one draft just written, optionally preceded by the preview URL line, and the DECISION is
the draft menu of Stage 2), the proposal verdict (DATA — the proposal node whole + closing
DECISION, the menu of Stage 4 step 0), and the фиксация finale (VERDICT checklist+checker lines +
DATA staged-note queue + DATA handoff phrase + closing HANDOFF-DECISION menu). Fill the
placeholders, never reinvent the structure. Runtime user-facing text is RUSSIAN.

### Curation contract — compact replica (full protocol: dev's `### BOUNDARY-CURATION`)

- The queue renders as a NUMBERED list — number, `[type]`, one-line essence, anchors; the queue is
  shown via `staging_list`, never by telling the user to run tools.
- Every decision is a DIGIT menu (vertical chips per the grammar); the batch form is
  `1 — прими все` / `2 — поштучный разбор` / `3 — отклони все` / `4 — дальше`; answers by DIGIT
  ONLY; exactly ONE option carries «← рекомендую: <причина одной строкой>»; the recommendation
  never shifts the default; silence = pause.
- NEVER tell the user to operate `staging_list` / `staging_resolve` — the agent calls the tools on
  the user's digit; every per-note decision stays the human's. Details: dev's
  `### BOUNDARY-CURATION`.

TOKEN-LINE — compact replica (norm: dev's `### TOKEN-LINE`): every DECISION block OPENS with the
token-spend line — before rendering the menu run the read-only call
`node <base-dir-скилла>/../../scripts/session-tokens.mjs --cwd <корень-проекта>` and paste its
output VERBATIM above the chips (`контекст ≈574k/1M · 57%`, or a degradation
`окно: н/д — <причина>`); EMPTY output → no line. Fail-open is absolute: the script always exits
0 and NEVER delays or breaks a menu — a missing line is the degradation, never a wait.

MENU-CONTEXT — compact replica (norm: dev's `### MENU-CONTEXT`):

- RULE — a property of the CALL, not a separate step: every `staging_resolve` that follows a
  PRESENTED digit menu MUST carry the menu payload; resolve после меню без menu-поля = VIOLATION.
- design payloads (literal): a `remember` whose choice was made from a PRESENTED digit menu (the
  stage-2 layout choice, per-proposal verdicts) carries the plan-fan payload with the menu's
  ACTUAL numbers — `{decision_class: "plan-fan", options_n: <фактический размер меню>,
  recommended_position: <позиция «← рекомендую»>, chosen_position: <цифра пользователя>}`; a note
  whose decision came without a digit menu goes WITHOUT menu — honestly uninstrumented. The finale
  queue curation rides `staging_resolve` with the curation payload: batch
  `{decision_class: "curation", options_n: 4, recommended_position: <позиция «← рекомендую»>,
  chosen_position: 1|3}` — N identical payloads per the batch canon; per-note
  `{curation, 4, <its own recommendation position>, 1|2}`.
- NON-EVENTS (дословно): «позже / показать целиком / дальше / молчание → вызова нет, ничего не
  пишется» — never synthesize a call for coverage.
- NEUTRALITY: agreement-цифры, coverage и menu-контекст никогда не рендерятся в тексты, где
  вырабатывается рекомендация.

### Language

Print all user-facing text in Russian (per the user's global ru-RU rule); this file's English body
governs structure only. Etalon annotations — HTML comments, node `name`, `note`, text literals and
Placeholder labels — follow the target project's language conventions; the checker's lines stay
literal English.

## Rules

- FOUR HARD STOPS — DESIGN-ANALYSIS-HARD-STOP, DESIGN-LAYOUT-HARD-STOP, DESIGN-DETAIL-HARD-STOP,
  and the fixation finale. The turn ENDS at each; continuing without explicit user confirmation is
  a VIOLATION = ABORT.
- MODE-BY-REGISTRY — the format is decided by the existence of `design/system/registry.json` and
  by nothing else; an unreadable registry ends the turn with its remedy, it never selects HTML.
- REGISTRY-IS-SERVER-OWNED — the registry and the token vocabulary are the design server's to
  write and rewrite; the skill reads them, never edits them, and never starts the server (that is
  `/mneme:design-server`).
- ONE-DRAFT-PER-TURN — in JSON mode stage 2 writes one draft per turn and stops on the draft menu;
  drafts are letters `-draft-a`, `-draft-b`, `-draft-c`, at most three without the user's word,
  and they stay on disk.
- WRITE-ONCE-THEN-PATCH — the JSON etalon's first version is one Write; everything after is an
  Edit patch; the hook's verdict lines, where they come, are repaired before the hard stop and the
  screenshot is looked at once.
- DESIGN, NEVER IMPLEMENT — no application code, no `/mneme:plan` invocation; the finale hands
  over the ready phrase as a fenced block. Wording that promises the agent will launch is a
  VIOLATION.
- WRITE ONLY UNDER design/ — pages and the system layer; a silent edit of a neighbor page is a
  VIOLATION (a proposal note is the honest channel).
- NO SILENT ASSUMPTIONS — решения / допущения / вопросы are separate blocks; proposals are marked
  [ui]/[functional] and judged by the user; [functional] never enters the etalon without an
  explicit verdict.
- STRUCTURE BEFORE AESTHETICS — style adjectives are forbidden at stage 2; a JSON draft is
  primitives and placeholders only.
- FIXATION-CHECK IS TWO-LAYERED — the mandatory checklist (layer 1) plus the bundled checker
  (layer 2), in both modes and both environments; a missing `$CLAUDE_PLUGIN_ROOT` degrades layer 2
  with an explicit message, never a faked verdict; the server's hook never replaces the checker.
- ETALON MANIFEST — HTML: fixtures and states are declared machine-readably in the file; JSON:
  the `data` and `states` keys are the manifest, every fixture complete for the bindings, every
  state overriding a bound path, `default` never declared; declared ↔ present is the checker's
  contract; deliberate decisions are annotated in place.
- PAGE = FOLDER, INDEX AT FIXATION — every page lives in `design/pages/<slug>/` (etalon + its
  drafts; the slug `index` is reserved); fixation updates `design/pages/index.html` (PAGES-INDEX)
  and the checker's NO-INDEX-LINK error turns a forgotten link into a red fixation.
- PROPOSALS BY DIGIT — every `proposal:<Name>` node meets its own three-chip menu at stage 4
  before the fixation check; accepted ones stay in the etalon and become decision notes.
- ETALON-ACCEPTANCE — an implementation built from an etalon is accepted by a CHECKLIST compared
  AGAINST `design/pages/<slug>/`, and the checklist follows the etalon's FORMAT: for
  `<slug>.html` — section structure, the full state set, the accent-dosage rule, and the
  measurement units; for `<slug>.json` — the node structure, the full state set, the data
  bindings, and the absence of raw values. This closes the etalon↔implementation parity gap by
  PROCEDURE (a human checklist at acceptance), not by a machine or an agent; the plan skill's
  generator plants the same format-aware checklist into implement-by-etalon specs.
- LINT-LAYERS — the design discipline has THREE machine layers, catching different failures:
  (1) the skill's fixation checklist (agent-run), (2) check-design-etalon.mjs — the BLOCKING
  fixation gate, (3) design-lint (the plugin's PostToolUse/Stop hook) — the ADVISORY drift
  watcher BETWEEN fixations; it never blocks and never replaces the gate. Layer 3 exists for
  HTML and CSS only; in JSON mode the advisory layer is the Melete hook, and only in the server's
  own session. Its exceptions file `design/system/lint-intentional.json` is curated ONLY on the
  user's explicit word — the agent NEVER adds an entry on its own to silence a finding.
- EMPTY-LIBRARY — an absent shared layer is initialized with the minimal scaffold at stage 3,
  announced explicitly (JSON mode: `tokens.css` only); bootstrap-extraction stays out of scope.
- PATTERN PROMOTION BY CONFIRMATION — 2-3 repetitions make a candidate; the user's digit promotes
  it into components.html / DESIGN.md, never the agent alone.
- STAGED-ONLY MEMORY — remember queues; publication happens only through the finale's digit
  curation; accepted AND rejected-with-reason both get notes.
- FINALE = HANDOFF-DECISION (FINALE-CLASS-HANDOFF) — the finale closes with the digit menu (queue
  curation + handoff); naming MCP tools to the user is a VIOLATION.
- MENU-CONTEXT — filling the menu payload is a PROPERTY of the deciding call (norm: dev's
  `### MENU-CONTEXT`); the visible menu form never changes; non-events and silence write nothing.
- LANGUAGE: English body + Russian runtime user-facing output.
