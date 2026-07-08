---
name: mneme:arch
description: Read-only architecture analysis — 2-3 solutions with trade-offs, one recommended. Use when designing a component or scoping a refactor.
allowed-tools: [Read, Grep, mcp__plugin_mneme_mneme__recall, mcp__plugin_mneme_mneme__remember]
disable-model-invocation: true
---

# /mneme:arch — Architecture analysis and decision support

Read-only analysis of an architecture question. Researches the codebase and recalled
memory, proposes 2-3 solutions with trade-offs, recommends one. Does NOT modify code.

> **STUB — Phase 3 install-proof.** This skill exists to prove the plugin is picked up
> as `/mneme:arch`. The procedure below is transplanted from the reference `arch` mode;
> its engram/vault addresses are **not yet rewired** to mneme. Every `TODO(mneme)` marks
> an address a later phase must migrate: engram `memory_search`/`memory_judge` → mneme
> `recall` (the judge step is removed — mneme has no judge tool); `memory_store` → mneme
> `remember` (staged); `.dev-vault/*` files → mneme context anchors such as `CLAUDE.md`
> and `docs/`.

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
- Memory recall (`mcp__plugin_mneme_mneme__recall`): YES
- Memory remember (`mcp__plugin_mneme_mneme__remember`): permitted ONLY to STAGE a decision
  the user explicitly asked to persist — never automatically, and it stages for review, it
  does not publish

"Read-only" here means read-only with respect to the codebase: no file is created or edited.
Staging a memory via `remember` is the one permitted side effect, and only on user request.

## Procedure

### Step 0: Recall prior memory — MANDATORY

Before researching the codebase:
1. TODO(mneme): recall relevant memory with `mcp__plugin_mneme_mneme__recall`, querying the
   architecture question (key concepts, modules, technologies). Replaces engram `memory_search`.
2. TODO(mneme): the engram `memory_judge` scoring step is REMOVED — mneme has no judge tool.
   Use recalled memory directly to inform the options in Step 4; rejected-approach memories are
   especially valuable.
3. TODO(mneme): if recall surfaces an antipattern, every proposed option MUST state whether it
   triggers that antipattern. Silent ignore = protocol violation.

### Step 1: Load context

MUST read the project's architecture context.
TODO(mneme): rewire these engram/vault addresses to mneme anchors —
- `.dev-vault/stack.md` — available technologies
- `.dev-vault/conventions.md` — established patterns
- `.dev-vault/knowledge.md` — existing architecture, gotchas
- `.dev-vault/gameplan.md` — current phase, priorities

Target anchors in mneme (`CLAUDE.md`, `docs/`, recalled memory) are finalized in the migration phase.

### Step 2: Research codebase

1. Find code related to the question (Grep).
2. Read the relevant files (max 15).
3. Map the current architecture around the question area.
4. Identify existing patterns that apply.
5. TODO(mneme): check recorded architecture decisions (engram `.dev-vault/architecture/` →
   mneme-recalled ADRs) for related prior choices.

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

Display as plain markdown (NOT inside a code fence):

## ARCH: <question short form>

**Context** — Project · Branch · Phase · related files analyzed · existing patterns · related ADRs

### Option A: <name>
<summary> · **How** · **Pros** · **Cons** · **Conventions** (matches / deviates) · **Effort** · **Risk**

### Option B / C: <same structure>

### Perspective conflicts
<if perspectives disagree — describe and resolve>

### RECOMMENDATION
**Option <A/B/C>: <name>** — justification + concrete next steps.

TODO(mneme): offer to persist the decision via `mcp__plugin_mneme_mneme__remember` (staged),
replacing the engram `memory_store` / `/vault:adr` handoff.

## Rules

- **Read-only w.r.t. the codebase** — NEVER create or modify a file. VIOLATION = ABORT.
- **MUST propose 2-3 options** — not 1, not 5+.
- **Evidence-based** — every claim references a specific file or recalled memory. No "generally speaking".
- **Concrete** — name files and modules, not "consider separating concerns".
- **Convention-aware** — flag and justify any deviation from established patterns.
- **No code** — describe what to do; implementation is the coder's job.
