---
name: design
description: design UI pages as HTML etalons before any code
allowed-tools: [Read, Grep, Write, Bash, mcp__plugin_mneme_memory__recall, mcp__plugin_mneme_memory__remember, mcp__plugin_mneme_memory__staging_list, mcp__plugin_mneme_memory__staging_resolve]
disable-model-invocation: true
---

# /mneme:design — Design UI pages as reviewed HTML etalons, before any code

An ENTRY skill of the plan family: multi-turn, gated by HARD STOPS, and NOT an engine run — every
design gate is HUMAN, at the skill level (the two-hard-stop precedent of `/mneme:plan`). The
engine and the mneme MCP tools are untouched. Its place in the pipeline:

задача/спека → `/mneme:design` (эталоны) → `/mneme:plan` «реализовать страницу по эталону
`design/pages/<slug>/<slug>.html`» → migrate → `/mneme:dev`.

design NEVER launches plan — the finale hands over the READY phrase as a fenced block (the grill
precedent); running it is the user's move.

The skill drives ONE UI task through FOUR stages; each stage ends in a HARD STOP — the turn ends,
and continuation happens only on the user's explicit confirmation. Whether a stage's outcome is
"obviously fine" is the USER's judgement, never the agent's.

## Arguments

`/mneme:design "<UI task in words>"` — the feature or page(s) to design, in plain language.

No argument → ask for the task in one line (numbered prompt). Never invent a task.

## Artifacts — in the TARGET project's repo, never in the corpus

- **A page is a FOLDER** `design/pages/<slug>/` — the etalon `design/pages/<slug>/<slug>.html`
  (ONE file per page: all states and fixtures INSIDE, deliberate decisions annotated via HTML
  comments / data-attributes) plus THAT page's composition drafts (`<slug>-draft-*.html`) and
  future iterations. The slug `index` is RESERVED for the pages index and FORBIDDEN as a page.
- **Pages index** `design/pages/index.html` — links to every page folder; maintained at fixation
  (see PAGES-INDEX in Stage 4) and guarded by the checker's NO-INDEX-LINK error.
- **Shared layer** `design/system/` — `tokens.css`, `components.html` (a living pattern catalog),
  `DESIGN.md` with a MANDATORY anti-patterns-and-selection-rules section.
- Etalons LINK the shared layer, they never copy it into themselves — copying = VIOLATION.

## Permissions (VIOLATION = ABORT)

- Read / Grep: YES — recon of the task's context, project schemas/migrations/fixtures (hypothesis
  material only, see CARDINALITY-SOURCE), and the shared design layer.
- Write: YES, but ONLY under `design/` of the target repo (pages/ and system/), and each file only
  at the stage that owns it (stage 2 rough variants, stage 3 the detailed etalon + EMPTY-LIBRARY
  scaffold, stage 4 annotations/final touches). Writing anywhere outside `design/` is a VIOLATION.
- Bash: ONLY to invoke the bundled etalon checker at stage 4 (see FIXATION-CHECK). Any other Bash
  use is a VIOLATION.
- `mcp__plugin_mneme_memory__recall`: YES — at the ENTRY of stage 1 (selection rules and prior
  decisions are the most valuable context; render findings as «prior experience»).
- `mcp__plugin_mneme_memory__remember`: YES, but ONLY at stage 4 (fixation) — it QUEUES notes for
  review, it never publishes; the skill never assumes acceptance.
- `mcp__plugin_mneme_memory__staging_list` / `staging_resolve`: YES, but ONLY applying the user's
  explicit DIGIT from the finale's HANDOFF-DECISION menu, per the curation contract below.
  Resolving without an explicit digit is a VIOLATION — the human gate is untouched.

## Procedure — four stages, four stops

### Stage 1: UI-анализ (text, NO HTML) → DESIGN-ANALYSIS-HARD-STOP

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

### Stage 2: Композиция (rough HTML) → DESIGN-LAYOUT-HARD-STOP

2-3 rough layout variants written to the PAGE'S OWN folder `design/pages/<slug>/` as
clearly-marked drafts (`<slug>-draft-*.html`). STRUCTURE, not
aesthetics — style adjectives are FORBIDDEN at this stage. The variants close with a DIGIT menu
(per dev's `## OUTPUT-GRAMMAR`: vertical chips, exactly one reasoned «← рекомендую», silence =
pause). END THE TURN; the layout choice is the user's digit.

Iterations at any stage are REPLACE (refine the chosen direction) or BRANCH (alternatives to
compare) — never mixed in one pass; the NUMBER of variants is the user's decision.

### Stage 3: Детализация → DESIGN-DETAIL-HARD-STOP

The full HTML of the chosen variant in `design/pages/<slug>/<slug>.html`: components and tokens from the
shared library, ALL states from stage 1, STRESS FIXTURES — типичная / минимальная / экстремальная
(long strings, 100-200 items) — with an in-file switcher (inline JS + data-attributes, zero
external dependencies). The etalon declares its fixtures and states in a machine-readable MANIFEST
(meta/data-attributes) — the checker's contract: declared ↔ present.

EMPTY-LIBRARY: an absent or empty `design/system/` is initialized HERE with a minimal scaffold
(tokens.css with a base scale, an empty components.html, DESIGN.md with the mandatory
anti-patterns-and-rules section) — announced EXPLICITLY in the turn. This is initialization of an
empty layer, NOT bootstrap-extraction from existing pages (that is out of scope).

END THE TURN; the user reviews the detailed etalon (open the file, flip fixtures) and confirms or
iterates (replace/branch).

### Stage 4: Фиксация → finale (FINALE-CLASS-HANDOFF)

1. FIXATION-CHECK — the mechanical postconditions, ONE list checked by BOTH layers:
   (1) the shared layer is linked (`../../system/tokens.css`);
   (2) every DECLARED fixture and state is present (manifest ↔ file);
   (3) no values bypassing tokens.css (raw hex/px outside `var(--…)` — a heuristic; its
   false-negatives are honestly documented in DESIGN.md).
   Layer 1 — the MANDATORY checklist run by the skill itself (Read/Grep, rendered as a verdict
   list). Layer 2 — the bundled machine checker:
   `node "$CLAUDE_PLUGIN_ROOT/scripts/check-design-etalon.mjs" design/pages/<slug>/<slug>.html`.
   DEGRADE honestly: if `$CLAUDE_PLUGIN_ROOT` is empty in the Bash environment, SKIP layer 2 WITH
   an explicit message (layer 1 stands) — never fake a machine verdict.
2. PAGES-INDEX — a PROPERTY of fixation, like the checklist above: update
   `design/pages/index.html` with the page's link (`<slug>/<slug>.html` + a human-readable page
   name); a missing index is CREATED at the first fixation (a minimal link list — the index is
   utility, linking the system layer is optional). The checker guards this duty with the
   NO-INDEX-LINK error: a fixation that forgot the index goes red, never silently stale.
3. PATTERN-CANDIDATES: anything repeated 2-3 times across etalons is a CANDIDATE for
   components.html / DESIGN.md — presented as an explicit item, promoted only on the user's
   confirmation.
4. MEMORY: `remember(type: "decision")` for ACCEPTED decisions AND for REJECTED proposals with the
   refusal reason; problems noticed on NEIGHBOR pages go as proposal notes too — a silent edit of
   another page is a VIOLATION. Anchors: repo-relative, git-tracked files (existing pages/schemas;
   a freshly created, not-yet-committed etalon is not an anchor).
5. HANDOFF: the ready phrase, fenced:

```
/mneme:plan "реализовать страницу по эталону design/pages/<slug>/<slug>.html"
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

## Output format

Every render follows the shared five-block grammar — STATUS / PROSE / DATA / VERDICT / DECISION —
DEFINED once in the `mneme:dev` skill's `## OUTPUT-GRAMMAR` (re-stating it here is a VIOLATION).
design OWNS three layer-3 templates: the анализ render (PROSE context + DATA blocks решения /
допущения / вопросы / предложения + closing DECISION when verdicts are pending), the композиция
fan (DATA variants + closing DECISION menu — this IS the layout hard stop), and the фиксация
finale (VERDICT checklist+checker lines + DATA staged-note queue + DATA handoff phrase + closing
HANDOFF-DECISION menu). Fill the placeholders, never reinvent the structure. Runtime user-facing
text is RUSSIAN.

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
governs structure only. Etalon annotations follow the target project's language conventions.

## Rules

- FOUR HARD STOPS — DESIGN-ANALYSIS-HARD-STOP, DESIGN-LAYOUT-HARD-STOP, DESIGN-DETAIL-HARD-STOP,
  and the fixation finale. The turn ENDS at each; continuing without explicit user confirmation is
  a VIOLATION = ABORT.
- DESIGN, NEVER IMPLEMENT — no application code, no `/mneme:plan` invocation; the finale hands
  over the ready phrase as a fenced block. Wording that promises the agent will launch is a
  VIOLATION.
- WRITE ONLY UNDER design/ — pages and the system layer; a silent edit of a neighbor page is a
  VIOLATION (a proposal note is the honest channel).
- NO SILENT ASSUMPTIONS — решения / допущения / вопросы are separate blocks; proposals are marked
  [ui]/[functional] and judged by the user; [functional] never enters the etalon without an
  explicit verdict.
- STRUCTURE BEFORE AESTHETICS — style adjectives are forbidden at stage 2.
- FIXATION-CHECK IS TWO-LAYERED — the mandatory checklist (layer 1) plus the bundled checker
  (layer 2); a missing `$CLAUDE_PLUGIN_ROOT` degrades layer 2 with an explicit message, never a
  faked verdict.
- ETALON MANIFEST — fixtures and states are declared machine-readably in the file; declared ↔
  present is the checker's contract; deliberate decisions are annotated in place.
- PAGE = FOLDER, INDEX AT FIXATION — every page lives in `design/pages/<slug>/` (etalon + its
  drafts; the slug `index` is reserved); fixation updates `design/pages/index.html` (PAGES-INDEX)
  and the checker's NO-INDEX-LINK error turns a forgotten link into a red fixation.
- LINT-LAYERS — the design discipline has THREE machine layers, catching different failures:
  (1) the skill's fixation checklist (agent-run), (2) check-design-etalon.mjs — the BLOCKING
  fixation gate, (3) design-lint (the plugin's PostToolUse/Stop hook) — the ADVISORY drift
  watcher BETWEEN fixations; it never blocks and never replaces the gate. Its exceptions file
  `design/system/lint-intentional.json` is curated ONLY on the user's explicit word — the agent
  NEVER adds an entry on its own to silence a finding.
- EMPTY-LIBRARY — an absent shared layer is initialized with the minimal scaffold at stage 3,
  announced explicitly; bootstrap-extraction stays out of scope.
- PATTERN PROMOTION BY CONFIRMATION — 2-3 repetitions make a candidate; the user's digit promotes
  it into components.html / DESIGN.md, never the agent alone.
- STAGED-ONLY MEMORY — remember queues; publication happens only through the finale's digit
  curation; accepted AND rejected-with-reason both get notes.
- FINALE = HANDOFF-DECISION (FINALE-CLASS-HANDOFF) — the finale closes with the digit menu (queue
  curation + handoff); naming MCP tools to the user is a VIOLATION.
- MENU-CONTEXT — filling the menu payload is a PROPERTY of the deciding call (norm: dev's
  `### MENU-CONTEXT`); the visible menu form never changes; non-events and silence write nothing.
- LANGUAGE: English body + Russian runtime user-facing output.
