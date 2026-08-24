---
name: fix
description: "bug diagnosis entry: reproduce with a red test, minimize, fan out hypotheses for a digit choice, emit a one-phase FIX spec whose gate is the regression test; never fixes code itself"
allowed-tools: [Read, Grep, Bash, mcp__plugin_mneme_memory__recall, Write, mcp__plugin_mneme_memory__workflow_migrate, mcp__plugin_mneme_memory__remember, mcp__plugin_mneme_memory__staging_list, mcp__plugin_mneme_memory__staging_resolve]
disable-model-invocation: true
---

# /mneme:fix — Diagnose a bug into a runnable fix phase

The DEBUGGING entry of the lineup: grill interrogates, plan plans, dev executes — fix DIAGNOSES.
It takes a bug in plain words («не работает X», «упало в проде», «тест красный после мержа»),
reproduces it as a RED minimal test, fans out 2-3 hypotheses with evidence for a digit choice,
and — after the user picks a direction and approves the draft — emits a one-phase micro-spec
`docs/FIX-<slug>.md` whose done-when gate IS the regression test, migrates it, and ends at a ready
`/mneme:dev fix-<slug>` command. The FIXING itself is dev's job, through the engine — with the
event log, attempts, resume, and the `resolved_error` / `fixed_test` harvest that the machine
already provides. fix is to bugs what plan is to features: the entrance, never the executor.

Reference: the reproduce → minimize → hypothesize → fix → regression-test cycle of
/diagnosing-bugs (mattpocock/skills). The CYCLE is borrowed; the protocol is ours — digit fans,
hard stops, the engine's executable gates instead of honor-system discipline.

## Arguments

`/mneme:fix "<bug in words>"` — the observed failure, described in plain language. Paste what you
have: an error text, a failing test name, a «работало — сломалось» story.

Examples:
- `/mneme:fix "npm test падает на check-workflows после переименования шага"`
- `/mneme:fix "recall возвращает пусто, хотя заметки есть"`

No argument → ask for the bug in one line (numbered prompt not needed — it is the sole opening
question), then proceed. Never invent a bug.

## Permissions (VIOLATION = ABORT)

- Read / Grep: YES — recon and evidence gathering.
- Bash: YES, but ONLY to REPRODUCE and MINIMIZE (run the failing command, run tests, bisect an
  input, add throwaway instrumentation runs) — plus the read-only session-tokens call before
  rendering a DECISION block (the TOKEN-LINE replica in Output format). Bash that CHANGES project
  state beyond a repro artifact is a VIOLATION.
- `mcp__plugin_mneme_memory__recall`: YES — prior `resolved_error` / `bugfix` notes on the same
  area are the highest-value context a diagnosis can get.
- Write: ONLY two artifacts — (a) the red minimal REPRO TEST file (see `### FIX-REPRO-FIRST`;
  placed per the project's test conventions), and (b) the FINAL approved micro-spec
  `docs/FIX-<slug>.md`, only after the Step 5 approval. Any other Write is a VIOLATION.
- `mcp__plugin_mneme_memory__workflow_migrate`: YES, but ONLY in `### FIX-AUTOMIGRATE`, AFTER the
  approved spec is written — never on a draft.
- `mcp__plugin_mneme_memory__remember`: YES, but ONLY inside `### FIX-NOREPRO-EXIT` exit `3` —
  staging the diagnosis-as-is (type `bugfix`). It QUEUES for human review, never publishes.
  `remember` anywhere else is a VIOLATION.
- Edit: FORBIDDEN — see `### FIX-NEVER-FIXES`. fix never touches production code.
- `mcp__plugin_mneme_memory__staging_list` / `mcp__plugin_mneme_memory__staging_resolve`: YES, but
  ONLY applying the user's explicit DIGIT from a closing HANDOFF-DECISION menu (the curation
  contract in Output format): `staging_list` to SHOW the queue, `staging_resolve` to apply a
  per-note digit decision. Resolving without an explicit digit is a VIOLATION — the human gate is
  untouched.
- `workflow_start` / `workflow_step` / any other engine or memory tool: FORBIDDEN — running the
  fix phase is dev's job.

## Procedure

Five steps, two hard stops. The turn ENDS at the hypothesis fan (Step 3) and at the spec review
(Step 5). Continuing past either without the user's explicit digit is a VIOLATION = ABORT.

### Step 1: take the bug

Read the bug from the argument. Restate it in ONE sentence (Russian) — what fails, where observed,
since when (if known). A scribe's restatement, not a diagnosis yet.

### Step 2: recon

`recall` on the bug's key concepts (modules, files, error text) — prior `resolved_error` and
`bugfix` notes may contain the exact cure; surface what memory contributed. Read / Grep the
suspect area (≤10 files). An empty recall is normal — note it and proceed.

### FIX-REPRO-FIRST — reproduce before hypothesizing (Step 3 entry; VIOLATION = ABORT)

The first REAL move is reproduction, and its ideal form is a RED MINIMAL TEST — a concrete test
file that fails for the bug's reason. That file is the diagnosis's central artifact: it is the
reproduction, the minimization, and the FUTURE REGRESSION GATE in one. Writing it is legitimate
fix work, not a code change (`### FIX-NEVER-FIXES` is untouched — the test asserts the CORRECT
behavior and stays red until dev fixes the code).

- Run the failing scenario (Bash), then SHRINK it: cut inputs, isolate the layer, pin the smallest
  case that still fails. Show the red run's output verbatim (VERDICT).
- Proposing hypotheses BEFORE a reproduction exists is a VIOLATION — evidence first.
- Reproduction failed after honest attempts → go to `### FIX-NOREPRO-EXIT` instead of forcing it.

### Step 3: FIX-HYPOTHESIS-FAN — hypotheses for a digit choice (HARD STOP)

With a red repro on screen, present 2-3 hypotheses — each with its EVIDENCE (specific files,
lines, outputs) and what confirming it would take. A recommendation is allowed on exactly one
option. Then END THE TURN — the direction is the USER's choice, by digit. Silently digging into
one hypothesis is a VIOLATION. A genuinely single-hypothesis case is stated explicitly as «одна
гипотеза — подтверждаю?» with its evidence; even then the turn ends and the user decides.

### Step 4: draft the micro-spec

For the chosen direction, draft `docs/FIX-<slug>.md` — the standard five-section delta (Baseline /
Stack / Conventions / Knowledge / Gameplan), ONE phase, small by nature:

- Gameplan tasks: the fix itself + keeping the repro test; nothing beyond the bug's scope.
- `### FIX-REGRESSION-GATE` (VIOLATION = ABORT): the phase's done-when is the CONCRETE regression
  test — the red repro test's own command with a definite target (a specific test file / a
  `grep -q` with a named marker), NEVER a bare `npm test` alone. A repo-wide suite MAY ride along
  as an ADDITIONAL criterion; it never replaces the targeted one. If no executable criterion can
  name the bug (visual outcome, external service), the done-when is explicitly MARKED agent-judged
  WITH a stated justification of why executable is impossible.
- Knowledge carries the diagnosis: the red run's output, the confirmed hypothesis, the rejected
  ones — this is what dev's harvest will distill into `resolved_error`.

### Step 5: review the draft (HARD STOP), then Write

Show the DRAFT spec in the chat and END THE TURN. Only after the user's explicit approval digit:
`Write` it to `docs/FIX-<slug>.md`. Writing before approval is a VIOLATION = ABORT.

### FIX-AUTOMIGRATE — migrate the approved spec, end at the map

Immediately after the Write, drive `workflow_migrate { spec_path }` (dry-run) → `apply: true` when
clean — the same fail-fast single pass as plan's finale. A FORMAT error (unparseable Gameplan,
malformed done-when): fix the FILE's form yourself and re-run — never its approved meaning; a
meaning-level problem goes back to the user. A CONFLICT: stop and surface it exactly as
`/mneme:migrate` does. On success render the finale map (template below) with the ready
`/mneme:dev fix-<slug>` command — and NEVER run it: the fix phase, its gate, and its
`resolved_error` harvest belong to dev.

### FIX-NOREPRO-EXIT — the honest exits when the bug will not reproduce (VIOLATION = ABORT)

Non-reproduction is a frequent reality (prod-only, races, flakes), and it must end in a MENU, not
a dead end. When honest repro attempts are exhausted, show what was tried (DATA) and close with
exactly this DECISION:

```
`1 — инструментировать и ждать` (добавить диагностику через обычный фикс-цикл, поймать со следующим срабатыванием)
`2 — фаза с agent-judged критерием` (чинить по главной гипотезе, гейт — вердикт ревью с обоснованием)
`3 — прервать: стейджить диагноз как есть` (remember type bugfix — гипотезы и улики в память)
```

Exit `1` loops back into Step 4 with instrumentation as the phase's task (its done-when: the
instrumentation is in place — still a concrete executable target). Exit `2` goes to Step 4 with
the agent-judged justification pre-written. Exit `3` stages the diagnosis via `remember`
(type `bugfix`, body: symptom + hypotheses + evidence + what was ruled out; anchors: the
git-tracked files investigated) — a diagnosis without a fix is still corpus value, the same bug
seen next time starts warm. Then render the queued note WHOLE and close with the digit menu per
the curation contract (Output format) — NEVER by telling the user to operate MCP tools. This is
the ONLY place fix may call `remember`.

### FIX-NEVER-FIXES — fix diagnoses, dev fixes (VIOLATION = ABORT)

fix NEVER changes production code: Edit is forbidden, and Write is confined to the repro test and
the approved spec. The fix itself runs as a dev phase — through the engine's gate, retry budget,
event log, and harvest. The `/mneme:dev fix-<slug>` command is PRINTED, never run (the same
discipline as plan-never-runs-dev). Merging diagnosis and repair into one uncontrolled motion is
exactly the free-chat failure mode this skill exists to retire.

## Output format

All user-facing text in RUSSIAN (per the user's global ru-RU rule), independent of this file's
English source; the spec written to `docs/` follows the language of the existing specs there.
Message COMPOSITION follows `## OUTPUT-GRAMMAR` in the dev skill's SKILL.md — the single source of
truth; fix re-states nothing and owns only the two layer-3 templates below. FILL the placeholders,
never re-lay the structure.

**Веер гипотез** — the Step 3 render: PROSE (context) + VERDICT (the red repro run, verbatim) +
DATA (hypotheses with evidence) + DECISION:

```
## FIX: <баг в короткой форме>

Репро: <красный минимальный тест — файл/команда>
<точный вывод красного прогона>

### Гипотеза 1: <название>
Улики: <файлы:строки, выводы> · Подтверждение: <что проверить>

### Гипотеза 2: <название>
Улики: … · Подтверждение: …

`1 — копать гипотезу 1: <название>` ← рекомендую: <причина одной строкой>
`2 — копать гипотезу 2: <название>`
`3 — не воспроизводится / другое`
```

**Финал-карта** — the FIX-AUTOMIGRATE render (FINALE-CLASS-HANDOFF): VERDICT (migrate counts) +
GRAPH-MAP per the `mneme:migrate` convention + the ready command + the closing HANDOFF-DECISION
menu (dev's `## OUTPUT-GRAMMAR`, layer 2): the turn just created an unlaunched phase, so the
message closes with the menu — a prose list of next commands is a VIOLATION. Launch is ALWAYS
manual (`/mneme:dev` carries `disable-model-invocation` — the agent cannot invoke it even on an
explicit digit): a digit only makes the skill re-print the READY command as a fenced block; the
user runs it. A one-phase graph has no boundary candidates, so the menu is the minimal pair:

```
create: <N> · identical: <M> · conflict: <K>
Спека записана: docs/FIX-<slug>.md · фазовых файлов применено: <W>

| Фаза | deps | done-when |
|---|---|---|
| <id> | — | executable: <регрессионный тест> |

/mneme:dev fix-<slug>

`1 — выдать команду запуска fix-<slug>`
`2 — пауза` (спека и фаза остаются, запуск позже)
```

(the «← рекомендую: <причина одной строкой>» suffix rides exactly ONE option; silence = pause)

(when the run went through `### FIX-NOREPRO-EXIT` exit `3` instead, the terminal render is PROSE +
the queued diagnosis shown WHOLE as a numbered list + the closing digit menu
`1 — принять диагноз` / `2 — отклонить` / `3 — позже` per the curation contract, and no map)

**Контракт курирования** — compact replica (full protocol: dev's `### BOUNDARY-CURATION`):

- The queue renders as a NUMBERED list — number, `[type]`, one-line essence, anchors.
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
- fix payloads (literal): the happy-path terminal menu `1 — выдать команду / 2 — пауза` resolves
  NO notes — there is no engine call and no menu to stamp. The NOREPRO branch's diagnosis menu
  (`1 — принять диагноз` / `2 — отклонить` / `3 — позже`) resolves on digits 1|2 with
  `{decision_class: "curation", options_n: 3, recommended_position: <позиция «← рекомендую»>,
  chosen_position: 1|2}`; digit 3 «позже» is a non-event.
- NON-EVENTS (дословно): «позже / показать целиком / дальше / молчание → вызова нет, ничего не
  пишется» — never synthesize a call for coverage.
- NEUTRALITY: agreement-цифры, coverage и menu-контекст никогда не рендерятся в тексты, где
  вырабатывается рекомендация.

## Rules

- FIX-REPRO-FIRST — reproduction (ideally a red minimal test) precedes hypotheses; hypotheses
  without a repro are a VIOLATION; a failed repro exits through FIX-NOREPRO-EXIT, never through
  force.
- FIX-HYPOTHESIS-FAN — 2-3 evidence-backed hypotheses, direction chosen by the USER's digit, HARD
  STOP; silently digging one hypothesis is a VIOLATION.
- FIX-REGRESSION-GATE — the generated phase's done-when is the concrete regression test (definite
  target, never a bare repo-wide suite alone); agent-judged only with an explicit impossibility
  justification.
- FIX-NOREPRO-EXIT — non-reproduction ends in the three-exit digit menu; exit 3 is the ONLY
  permitted `remember` call (type bugfix, diagnosis-as-is, queued for human review).
- FIX-NEVER-FIXES — Edit FORBIDDEN; Write only the repro test + the approved spec; the fix phase
  runs in dev; the dev command is printed, never run.
- FIX-AUTOMIGRATE — validate → apply-if-clean in one pass after the approved Write; format errors
  repaired in place, meaning goes back to the user; ends at the finale map + its closing
  HANDOFF-DECISION menu (FINALE-CLASS-HANDOFF). Launch is always manual — `/mneme:dev` carries
  `disable-model-invocation`; the menu only hands over the ready command.
- TWO HARD STOPS — the hypothesis fan and the spec review; continuing past either without an
  explicit user digit is a VIOLATION = ABORT.
- OUTPUT-GRAMMAR — defined ONCE in dev's SKILL.md; fix owns only its two layer-3 templates (веер
  гипотез, финал-карта) and re-states no layer 1-2 rules.
- LANGUAGE — English body + Russian runtime user-facing output; the FIX spec follows the docs/
  directory's existing language.
