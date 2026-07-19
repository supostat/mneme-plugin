---
name: mneme:migrate
description: convert an externally-authored spec into runnable workflow phase files and render the graph map with boundary candidates, without running anything
allowed-tools: [Read, mcp__plugin_mneme_memory__workflow_migrate]
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
from the tool's returned graph structure, never from re-parsing the files). Then END the turn. Do
NOT call `/mneme:dev`, do NOT start a run, do NOT offer to "just continue" — running the phases is
the user's move, with a ready command already on screen.

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
- **Готовые команды** — real, runnable syntax:
  - полный прогон: `/mneme:dev <spec-slug>`
  - до границы: `/mneme:dev <spec-slug> until <boundary-candidate-id>` (one line per candidate).

In grammar terms (the shared five-block grammar, DEFINED once in the `mneme:dev` skill's
`## OUTPUT-GRAMMAR` section — never re-stated here): GRAPH-MAP = VERDICT (validation counts) +
DATA (the phase table) + DATA (boundary candidates) + fenced ready commands, and NO DECISION —
the skill ends at the map. migrate's one DECISION block is the conflict exit of Step 2 (numbered
ways out, digit-answered). The literal template (fill placeholders, never restructure):

```
create: <N> · identical: <M> · conflict: <K>
Apply: записано <W> файлов → <corpus>/workflow/<spec-slug>/

| Фаза | deps | done-when |
|---|---|---|
| <id> | <deps или —> | <executable / agent-judged> |

Кандидаты границ: <ids + причина, или «нет — единственная фаза»>

/mneme:dev <spec-slug>
/mneme:dev <spec-slug> until <boundary-id>
```

## Output format

Russian runtime output (per the user's global ru-RU rule); protocol tokens (`workflow_migrate`,
`create` / `identical` / `conflict`, `/mneme:dev`) stay literal. Print:

- одна строка исхода валидации: `create: N · identical: M · conflict: K`;
- на happy path — подтверждение apply (сколько файлов записано, куда) и затем карту GRAPH-MAP;
- на conflict/ошибке — что именно разошлось и нумерованные выходы (см. Step 2);
- в конце карты — готовые команды `/mneme:dev` (полный прогон + until-кандидаты). Это ПОДСКАЗКА:
  скилл сам ничего не запускает.

## Rules

- ONE TOOL — the skill drives `workflow_migrate` and nothing else; the tool writes the files, the
  skill writes nothing. VIOLATION = ABORT.
- VALIDATE → APPLY-IF-CLEAN in ONE pass — no confirmation stop on the happy path; dry-run's clean
  verdict IS the permission to apply.
- CONFLICT = STOP — name the divergence verbatim, offer the three numbered ways out, never guess
  and never force. Deleting the subfolder is only safe while no run has started on those phases.
- ENDS AT THE MAP — never calls `/mneme:dev`, `workflow_start`, or `workflow_step`; the map plus a
  ready command is the whole artifact.
- MAP FROM THE RESPONSE — GRAPH-MAP renders the tool's returned graph; it never re-parses phase
  files to reconstruct it.
- LANGUAGE: English body; Russian runtime user-facing output.
