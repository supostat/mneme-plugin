---
name: arch
description: Read-only architecture analysis — 2-3 solutions with trade-offs, one recommended. Use when designing a component or scoping a refactor.
allowed-tools: [Read, Grep, mcp__plugin_mneme_memory__recall, mcp__plugin_mneme_memory__remember]
disable-model-invocation: true
---

# /mneme:arch — Architecture analysis and decision support

Read-only analysis of an architecture question. Draws on recalled mneme memory and the
codebase, proposes 2-3 solutions with trade-offs, recommends one. Does NOT modify code.

Context comes from mneme (`recall`) plus generic repository anchors (`CLAUDE.md`, `docs/`,
`README`) — this skill depends on no project-specific layout.

## Arguments

`/mneme:arch "<question>"` — architecture question or decision to analyze.

Examples:
- `/mneme:arch "how should the auth module be structured?"`
- `/mneme:arch "should this service be split in two?"`
- `/mneme:arch "REST vs gRPC for the internal API?"`

## Permissions (VIOLATION = ABORT)

- Read files: YES
- Write / Edit files: FORBIDDEN — this skill analyzes, it never changes code
- Bash: FORBIDDEN
- Memory recall (`mcp__plugin_mneme_memory__recall`): YES
- Memory remember (`mcp__plugin_mneme_memory__remember`): permitted ONLY to STAGE a decision
  the user explicitly asked to persist — never automatically, and it stages for review, it
  does not publish

"Read-only" here means read-only with respect to the codebase: no file is created or edited.
Staging a memory via `remember` is the one permitted side effect, and only on user request.

## Procedure

### Step 0: Recall prior memory — MANDATORY

Before researching the codebase, call `mcp__plugin_mneme_memory__recall` with the architecture
question (key concepts, modules, technologies).

1. There is NO scoring/judge step — mneme has no judge tool. Use recalled notes directly to
   inform the options in Step 4; rejected-approach and decision notes are especially valuable.
2. If recall surfaces an antipattern note, every proposed option MUST state whether it triggers
   that antipattern. Silent ignore = protocol violation.
3. Recall augments, it never gates. An empty result or a "degraded mode" notice (no stored
   vectors yet) is normal on a cold store — proceed to Step 1 and note that memory was empty.

### Step 1: Load context

MUST read the project's architecture context from anchors that exist in any repository,
degrading gracefully when one is absent:

- `CLAUDE.md` (repo root and any nested ones) — conventions, constraints, instructions
- `README` / `docs/` — architecture, stack, and design notes, if present
- the notes recalled in Step 0

### Step 2: Research codebase

1. Find code related to the question (Grep).
2. Read the relevant files (max 15).
3. Map the current architecture around the question area.
4. Identify existing patterns that apply.
5. Weigh related prior decisions surfaced by recall (Step 0) against the current question.

### Step 3: Analyze from 3 perspectives

MUST evaluate from ALL 3, noting conflicts explicitly:

- **Maintainability** — clear module boundaries, explicit dependencies, testable in isolation.
- **Security** — attack surface, trust boundaries, where user input enters, authN/authZ, data protection.
- **Pragmatism** — effort vs value, fit with the current phase, over-engineering risk.

### Step 4: Propose solutions

MUST propose **2-3 solutions** (not 1, not 5+). Each includes: Summary · How it works (concrete
file paths / module names) · Pros (specific) · Cons (specific) · Fits conventions? · Effort
(small / medium / large) · Risk.

### Step 5: Recommend

Pick ONE. Justify: why over the others · which perspective it optimizes for · which trade-offs are accepted.

## Output format

Display as plain markdown (NOT inside a code fence). The render below is arch's layer-3 template
per the shared five-block grammar (DEFINED once in the `mneme:dev` skill's `## OUTPUT-GRAMMAR`
section — never re-stated here): PROSE context + DATA options + a closing DECISION menu — the same
DATA+DECISION form as plan's fan. Fill the placeholders, never restructure:

## ARCH: <question short form>

**Context** — Project · Branch · files analyzed · existing patterns · recalled memory (decisions / antipatterns, or "none — memory empty")

### Option A: <name>
<summary> · **How** · **Pros** · **Cons** · **Conventions** (matches / deviates) · **Effort** · **Risk**

### Option B / C: <same structure>

### Perspective conflicts
<if perspectives disagree — describe and resolve>

### RECOMMENDATION
**Option <A/B/C>: <name>** — justification + concrete next steps.

The render CLOSES with a DECISION block — the numbered option menu, digit-answered, nothing after
it:

```
1 — вариант A: <name>
2 — вариант B: <name>
3 — вариант C: <name>
```

(the «← рекомендую: <причина одной строкой>» suffix rides exactly the recommended option's line)

Persisting the chosen decision via `mcp__plugin_mneme_memory__remember` (type `decision`, staged
for human review) stays available — ONLY when the user explicitly asks, on a later turn. Staging
queues the note; the human accepts it separately. Never publish automatically.

## Rules

- **Read-only w.r.t. the codebase** — NEVER create or modify a file. VIOLATION = ABORT.
- **MUST propose 2-3 options** — not 1, not 5+.
- **Evidence-based** — every claim references a specific file or recalled note. No "generally speaking".
- **Concrete** — name files and modules, not "consider separating concerns".
- **Convention-aware** — flag and justify any deviation from established patterns.
- **No code** — describe what to do; implementation is the coder's job.
