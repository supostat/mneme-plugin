---
name: migrate
description: convert an externally-authored spec into runnable workflow phase files and render the graph map with boundary candidates, without running anything
allowed-tools: [Read, Bash, mcp__plugin_mneme_memory__workflow_migrate]
disable-model-invocation: true
---

# /mneme:migrate — Turn an external spec into workflow phase files, end at the map

The door for EXTERNALLY-authored specs. It takes a path to a spec, drives the engine's
`workflow_migrate` tool through validate → apply-if-clean in ONE pass, and ends by rendering the
GRAPH-MAP of the migrated phases — it never runs them.

The split by spec origin: a spec BORN from `/mneme:plan` is migrated by plan's own finale
(fail-fast, hot context); a spec BROUGHT from outside comes through this skill. Both doors drive
the SAME engine tool, `workflow_migrate` — this skill adds no conversion logic of its own.

## Arguments

`/mneme:migrate <path-to-spec>` — the spec file to migrate (e.g. `docs/SPEC-D9-SOMETHING.md`).

No argument → ask for the spec path (one line), never guess one. If the path does not exist or is
not readable, say so and stop.

## Permissions (VIOLATION = ABORT)

- Read: YES — to confirm the spec exists (and quote a line when explaining an error).
- `mcp__plugin_mneme_memory__workflow_migrate`: YES — the ONLY engine tool this skill drives. The
  TOOL writes the phase files; the skill itself writes nothing.
- Edit / Write / Bash / Grep: FORBIDDEN — no hand-authored phase files, no hand-fixes of conflicts,
  no directory surgery. Conflict resolution is the USER's move, guided by the options below.
  ONE carve-out: Bash ТОЛЬКО for the read-only session-tokens call before rendering a
  DECISION block (the TOKEN-LINE replica in Output format) — any other Bash stays FORBIDDEN.
- `workflow_start` / `workflow_step` / `/mneme:dev`: FORBIDDEN — the skill ENDS at the map;
  running the phases is the user's next move.
- `recall` / `remember` / any memory tool: FORBIDDEN.

## Procedure

### Step 1: validate (dry-run)

Call `workflow_migrate { spec_path }` — dry-run is the tool's default. It parses the spec's
`# Gameplan` into phase files under the project corpus (`<corpusDir>/workflow/<spec-slug>/`) and
classifies every target as `create`, `identical`, or `conflict` — writing NOTHING.

### Step 2: apply-if-clean — same pass, no stop between

- ZERO conflicts → immediately call `workflow_migrate { spec_path, apply: true }` in the SAME turn.
  The happy path has NO intermediate confirmation: validate → apply is one motion, because dry-run
  already proved every write is clean (`create` or `identical`; identical targets are skipped, so
  re-migrating an unchanged spec is idempotent).
- ANY conflict, or a tool error (unparseable Gameplan, missing sections) → STOP. Explain WHAT
  diverged (name the conflicting file(s) verbatim from the tool response) and offer the numbered
  ways out — do NOT guess, there is no force flag:
  1. Править спеку и перезапустить `/mneme:migrate` (цель разошлась, потому что спека изменилась).
  2. Снести подпапку `<corpusDir>/workflow/<spec-slug>/` руками и перезапустить — ТОЛЬКО если run
     по этим фазам ещё не стартовал (иначе это осиротит событийный лог run'а).
  3. Отказаться от миграции.

### Step 3: GRAPH-MAP — render the graph, then end

Render the phase graph from the APPLY response (see the GRAPH-MAP section below — the data comes
from the tool's returned graph structure, never from re-parsing the files), CLOSE with the map's
HANDOFF-DECISION menu, and END the turn. Do NOT call `/mneme:dev` (it carries
`disable-model-invocation` — the agent cannot invoke it, ever) and do NOT start a run: a digit
only makes the skill hand over the READY command as a fenced block; running it is the user's move.

## GRAPH-MAP — the graph render convention

This is the SHARED render for a freshly migrated task graph (plan's auto-migrate finale references
this same convention). Built strictly from `workflow_migrate`'s response — it returns the graph
(id, deps, done-when kinds) and, on apply, the written paths and the ready `/mneme:dev` command:

- **Фазы по порядку deps** — each phase id on its own line, `deps` shown, so the execution order
  the reducer will follow is visible at a glance.
- **Вид критериев** per phase — `executable` / `agent-judged` (from the tool's done-when kinds), so
  the user sees where gates run commands and where review verdicts will be needed.
- **Кандидаты границ** (suggested-until, minimal version): the FOUNDATION phases — those with the
  most dependents — and seams of the stack. These are the natural `until` stopping points.
- **WIRE-TERMINAL-MARK** — when the graph ends in a wire/integration terminal (a phase whose deps
  span the code phases and whose gate is the real-module e2e of the main path — what plan's
  WIRE-PHASE-RULE generates), its row in the phase table is marked `wire-терминал`, and EVERY
  boundary candidate that stops BEFORE it carries the caveat «модули ещё не связаны». An `until`
  pause short of the integration terminal is a planned entry boundary — it must never read as
  «всё готово».
- **Готовые команды** — real, runnable syntax:
  - полный прогон: `/mneme:dev <spec-slug>`
  - до границы: `/mneme:dev <spec-slug> until <boundary-candidate-id>` (one line per candidate).

In grammar terms (the shared five-block grammar, DEFINED once in the `mneme:dev` skill's
`## OUTPUT-GRAMMAR` section — never re-stated here): GRAPH-MAP = VERDICT (validation counts) +
DATA (the phase table) + DATA (boundary candidates) + fenced ready commands, CLOSED by a
HANDOFF-DECISION menu (FINALE-CLASS-HANDOFF: the freshly migrated phases are actionable objects
this very turn created, so layer 2 demands the closing menu). The menu holds 2-4 options: the
full run to the terminal, `until` the FIRST boundary candidate, and — in finales that also staged
notes (plan, fix; migrate itself stages nothing) — the staging-queue item per their own
templates. Launch is ALWAYS manual: `/mneme:dev` carries `disable-model-invocation`, so a launch
option promises only «выдать готовую команду» — never that the agent will run it. migrate's
other DECISION block is the conflict exit of Step 2 (numbered ways out, digit-answered). The
literal template (fill placeholders, never restructure):

```
create: <N> · identical: <M> · conflict: <K>
Apply: записано <W> файлов → <corpus>/workflow/<spec-slug>/

| Фаза | deps | done-when |
|---|---|---|
| <id> | <deps или —> | <executable / agent-judged> |
| <id> | <все code-фазы> | <executable> · wire-терминал |

Кандидаты границ: <ids + причина, или «нет — единственная фаза»; каждый кандидат до
wire-терминала — с оговоркой «модули ещё не связаны»>

/mneme:dev <spec-slug>
/mneme:dev <spec-slug> until <boundary-id>

`1 — выдать команду полного прогона (до терминала)`
`2 — выдать команду until <первый-кандидат>`
```

(the `· wire-терминал` row and the «модули ещё не связаны» caveat appear ONLY when the graph
carries a wire/integration terminal — see WIRE-TERMINAL-MARK above; other graphs render the
table and candidates exactly as before; the «← рекомендую: <причина одной строкой>» suffix rides
exactly ONE menu option; on the user's digit the skill re-prints THAT command alone as a fenced
block — the launch itself stays the user's, per `disable-model-invocation`)

## Output format

Russian runtime output (per the user's global ru-RU rule); protocol tokens (`workflow_migrate`,
`create` / `identical` / `conflict`, `/mneme:dev`) stay literal. Print:

- одна строка исхода валидации: `create: N · identical: M · conflict: K`;
- на happy path — подтверждение apply (сколько файлов записано, куда) и затем карту GRAPH-MAP;
- на conflict/ошибке — что именно разошлось и нумерованные выходы (см. Step 2);
- в конце карты — готовые команды `/mneme:dev` (полный прогон + until-кандидаты). Это ПОДСКАЗКА:
  скилл сам ничего не запускает.

TOKEN-LINE — compact replica (norm: dev's `### TOKEN-LINE`): every DECISION block OPENS with the
token-spend line — before rendering the menu run the read-only call
`node <base-dir-скилла>/../../scripts/session-tokens.mjs --cwd <корень-проекта>` and paste its
output VERBATIM above the chips (`≈168k в окне · сессия 52k in / 9k out`, or a degradation
`окно: н/д — <причина>`); EMPTY output → no line. Fail-open is absolute: the script always exits
0 and NEVER delays or breaks a menu — a missing line is the degradation, never a wait.

## Rules

- ONE TOOL — the skill drives `workflow_migrate` and nothing else; the tool writes the files, the
  skill writes nothing. VIOLATION = ABORT.
- VALIDATE → APPLY-IF-CLEAN in ONE pass — no confirmation stop on the happy path; dry-run's clean
  verdict IS the permission to apply.
- CONFLICT = STOP — name the divergence verbatim, offer the three numbered ways out, never guess
  and never force. Deleting the subfolder is only safe while no run has started on those phases.
- ENDS AT THE MAP + MENU (FINALE-CLASS-HANDOFF) — never calls `/mneme:dev`, `workflow_start`, or
  `workflow_step`; launch is always manual (`/mneme:dev` carries `disable-model-invocation` — the
  agent cannot invoke it, even on an explicit digit), so the closing HANDOFF-DECISION menu only
  hands over the ready command; the map plus that menu is the whole artifact.
- MAP FROM THE RESPONSE — GRAPH-MAP renders the tool's returned graph; it never re-parses phase
  files to reconstruct it.
- LANGUAGE: English body; Russian runtime user-facing output.
