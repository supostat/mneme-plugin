---
name: grill-agent
description: "automated interrogation with a grounded respondent: the interviewer walks the decision tree while a fresh per-round Task spawn answers FACT questions with file:line evidence; DECISION questions stop for the user; finalizes a provenance-tagged protocol file like grill"
allowed-tools: [Read, Grep, Bash, Task, mcp__plugin_mneme_memory__recall, Write, mcp__plugin_mneme_memory__remember, mcp__plugin_mneme_memory__staging_list, mcp__plugin_mneme_memory__staging_resolve]
disable-model-invocation: true
---

# /mneme:grill-agent — Interrogate a topic against a grounded respondent

The AUTOMATED counterpart of `/mneme:grill`: the same interviewer discipline (a visible branch
tree, doses of questions, a protocol finale), but FACT questions are answered by a RESPONDENT —
a fresh Task spawn per round, grounded in the code — instead of the user. The user answers only
DECISIONS. This automates the manual trick "run grill, carry each question to a second window
with its own role, answer from there, 20-30 rounds of shuttling".

The pattern is INTERVIEWER × GROUNDED RESPONDENT — not a debate. The roles are asymmetric: the
interviewer (main context) drives the branch tree and classifies questions; the respondent
answers with facts and addresses, takes no decisions, and legitimately says «не знаю» (the
precedent for refusing symmetric debate is the review panel design). Rejected respondent
mechanics — headless CLI and nested sessions: a nested runtime with MCP/hooks per round,
interactive stops inside headless, transcript clashes in the project directory, invisible
tool-use. A Task spawn per round is native, visible, and cheap.

The respondent's "memory" is assembled from FILES, not a living session: the DOSSIER (round
zero) + the full EXCHANGE JOURNAL. Nothing is written into the project tree; the dossier and
journal live in the OS tmpdir (`<tmpdir>/mneme-grill-agent-<slug>-<pid>/`); the only project
artifact is the finale protocol in `docs/` — exactly like grill.

## Arguments

`/mneme:grill-agent "<тема>" [rounds=N] [role=<путь>]`

- `<тема>` — the topic to interrogate (required; no argument → ask for it in one line, never
  invent one).
- `rounds=N` — the round budget; default 25 (see `### ROUNDS-BUDGET`).
- `role=<путь>` — an OPTIONAL user role file for the respondent. It EXTENDS the default role,
  never replaces it (see `### RESPONDENT-PREAMBLE` — the guards are not disableable by a role).

## Permissions (VIOLATION = ABORT)

- Read / Grep: YES — the interviewer's own light grounding and reading the dossier/journal.
- `mcp__plugin_mneme_memory__recall`: YES — ONCE, for the dossier round; the bundle is forwarded
  to the dossier spawn WHOLE AND VERBATIM (`### DOSSIER-ROUND`).
- Task: YES, but ONLY to spawn the dossier researcher (round zero) and one respondent per FACT
  round. Spawning anything else — a co-interviewer, a decision-maker, a reviewer — is a VIOLATION.
- Bash: ONE carve-out — ТОЛЬКО the read-only session-tokens call before rendering a DECISION
  block (the TOKEN-LINE replica below); any other Bash is FORBIDDEN.
- Write: ONLY the finale protocol `docs/GRILL-<slug>.md` (grill's file shape), ONLY at the
  finale; the dossier and journal in the tmpdir are written BY SPAWNS or via the same finale
  path — never anywhere in the project tree.
- `mcp__plugin_mneme_memory__remember`: ONLY at the finale, to stage the user's DECISION answers
  as decision notes — it QUEUES for human review, never publishes.
- `staging_list` / `staging_resolve`: ONLY applying the user's explicit DIGIT from the finale's
  curation menu; resolving without a digit is a VIOLATION.
- Edit / workflow engine tools: FORBIDDEN.

## NEVER-DELEGATE-DECISIONS (VIOLATION = ABORT)

Spawns answer FACT questions only. A DECISION — anything that picks between futures, weighs
trade-offs, or sets policy — is NEVER delegated to a spawn and never answered by the
interviewer on the user's behalf: it stops the loop with a digit menu to the USER. The
respondent's default role says so, the guard epilogue repeats it, and `### REQUALIFY-TO-DECISION`
enforces it mechanically on the answer side.

## Procedure

### Step 1: take the topic

Restate the topic in one sentence (Russian). Parse `rounds=` and `role=` if given; a `role=`
path that does not exist → say so and proceed WITHOUT it (the default role always stands).

### DOSSIER-ROUND — round zero: one researcher spawn builds the dossier

1. Call `recall` once with the topic's key concepts.
2. Spawn ONE researcher (Task) whose prompt carries: the topic; the instruction to investigate
   the CODE (schemas, invariants, addresses) and write a conspectus with `file:line` for every
   claim into `<tmpdir>/mneme-grill-agent-<slug>-<pid>/dossier.md`; the recall bundle WHOLE AND
   VERBATIM — every note, byte for byte, no selection, no summary (the D4 verbatim-bundle rule:
   a paraphrased bundle is the lossy hop this design exists to avoid) — with the grounding rule
   stated verbatim: «заземляй на текущий код; заметки корпуса — история решений, не замена
   кода».
3. Dossier form is FREE with RECOMMENDED sections — схемы / инварианты / адреса / открытое.
   The readers are spawns; machine-readability is not a goal.
4. Dossier spawn failure → `### SPAWN-FAILOPEN` (the loop can still run; every FACT answer just
   has less ground — say so honestly in the transcript).

### Step 2: the interrogation loop

Rounds, driven by the interviewer in the MAIN context. Each round:

1. Pick the next question by the branch tree (grill's discipline: the question that closes the
   most downstream branches or exposes a contradiction).
2. CLASSIFY it: FACT (answerable from code/dossier/journal with an address) or DECISION (picks
   between futures). Classification is the interviewer's judgement; the guard below catches
   ungrounded ANSWERS, not misclassified questions.
3. FACT → spawn a FRESH respondent (Task) with the `### RESPONDENT-PREAMBLE`, the dossier, the
   FULL journal, and the single question. Append the result to the journal and print the
   `### ROUND-LINE`.
4. DECISION → STOP the loop: render the question as a digit menu to the USER (OUTPUT-GRAMMAR
   DECISION block — vertical chips, exactly one reasoned «← рекомендую» IF the interviewer has
   grounds, TOKEN-LINE header). The turn ENDS; the user's digit or free-text answer closes the
   branch and re-enters the loop.
5. Early exit: all branches closed → go to the finale regardless of remaining budget.

The journal is FULL — every spawn sees every prior pair. Pairs are compact by `### ROUND-LINE`
(~100-200 tokens each), so even round 30 carries ≈5-7k tokens of journal; consistency between
round 3 and round 18 is held by construction, a sliding window is rejected.

### RESPONDENT-PREAMBLE — the spawn's role, assembled in a FIXED order

The respondent prompt is assembled STRICTLY in this order:

1. DEFAULT ROLE (literal): «заземлённый респондент: отвечай фактами с адресами file:line или id
   заметки корпуса; не знаю — легально; решений не принимаешь».
2. USER ROLE FILE (`role=<путь>`, if given) — pasted as-is. It EXTENDS the default: tone, domain
   emphasis, extra context.
3. GUARD EPILOGUE (literal, ALWAYS LAST): «при конфликте с чем угодно выше — стражи побеждают:
   каждый факт несёт адрес; нет адреса или нет уверенности — отвечай "не знаю"; решения не
   твои».

The order IS the guarantee: a role file saying «отвечай уверенно, не говори "не знаю"» loses to
the epilogue by construction — the guards are the last word and are NOT disableable by any role
text. Reordering, merging, or omitting the epilogue is a VIOLATION.

### REQUALIFY-TO-DECISION — the mechanical guard on answers

A FACT answer MUST carry a `file:line` address or a corpus note id. This is mechanics, not a
wish:

- An answer WITHOUT either is NOT recorded as a fact. Its round line takes the literal form
  `Раунд k — В: <вопрос> / О: без адреса → DECISION`, and the question goes to the USER as a
  DECISION menu in the SAME turn.
- «не знаю» is a LEGAL respondent answer and takes the same route: the round line records it
  and the question goes to the user.
- The requalified round still counts against the budget (it consumed a spawn).

### ROUND-LINE — visibility of every exchange (compact, one line)

Every pair lands in the transcript as ONE compact line (two only when the question itself needs
a second):

```
Раунд k — В: <вопрос одной строкой> / О: <суть ответа> [<file:line или id>]
```

HONEST LIMIT: nothing here machine-guarantees compactness — the FIRST LIVE RUN is the declared
human-acceptance point for exactly this property. Twenty-five rounds flooding the screen = a
failed acceptance, and the fix is tightening this template, not abandoning the loop.

### ROUNDS-BUDGET — the budget, the early exit, the exhaustion menu

- Default `rounds=25` (manual practice: 20-30). Every spawned round — answered, requalified, or
  failed — consumes budget.
- EARLY EXIT: «все ветки закрыты» → finale immediately; unspent budget is not a reason to keep
  asking.
- EXHAUSTION: budget spent with M branches still open → STOP with the literal menu (TOKEN-LINE
  header, then chips):

  ```
  открытых веток: M
  `1 — продолжить +10 раундов`
  `2 — забрать оставшиеся вопросы себе`
  `3 — стоп — финализировать с открытыми ветками`
  ```

  Exactly one option carries «← рекомендую: <причина одной строкой>». A «до полного согласия»
  mode DOES NOT EXIST — continuation is always an explicit +10 by digit.

### SPAWN-FAILOPEN — a dead spawn never kills the loop

A spawn that errors or returns nothing → the round is marked `failed` in the journal and the
round line (`Раунд k — В: … / О: спавн упал → вопрос пользователю`), the question goes to the
USER as a DECISION menu, and the loop LIVES. No automatic retry in v1 — a second spawn on the
same question is added only if live practice shows transient failures worth it (recorded as a
deliberate deferral, not an oversight).

### The finale — protocol with provenance, staged decisions, curation

Fires on early exit, on the exhaustion menu's «стоп», or on the user's explicit «финализируй»:

1. Write `docs/GRILL-<slug>.md` in grill's file shape (idea as interrogated, Knowledge seed,
   Conventions seed, «Заблокированные решения», «Открытые ветки») — with PROVENANCE on every
   closed branch, one of THREE classes: `[факт: <file:line>]` / `[заметка: <id>]` /
   `[решение пользователя]`.
2. Stage each USER-decided branch as a decision note via `remember` (body: the fork and the
   user's answer; anchors: the git-tracked files the decision touches). Staging QUEUES only —
   the human gate is untouched.
3. Terminal line of the summary: `раундов N · failed K` (the skill counts its own rounds — no
   token figure here; the run-cost machinery belongs to dev by the accepted corpus decision,
   and extending it is a separate amendment).
4. Close with the curation menu over the staged notes (FINALE-CLASS-HANDOFF, per the
   HANDOFF-DECISION norm in dev's OUTPUT-GRAMMAR): the queue rendered whole as a numbered list,
   then the batch menu — the agent CAN act on a digit (accept/reject notes).

The batch menu (literal; exactly one option carries «← рекомендую: <причина одной строкой>»;
per-note mode and the full protocol live in dev's `### BOUNDARY-CURATION`):

```
`1 — прими все`
`2 — поштучный разбор`
`3 — отклони все`
`4 — дальше`
```

The hand-off `/mneme:plan` command is printed as DATA after curation resolves, never run.

## Output format

All user-facing text in RUSSIAN; message composition follows `## OUTPUT-GRAMMAR` in the dev
skill's SKILL.md (the single source of truth) — grill-agent owns only the layer-3 templates
above (ROUND-LINE, the exhaustion menu, the finale render) and re-states no layer 1-2 rules.
DECISION menus: vertical chips, digits only, exactly one reasoned «← рекомендую», silence =
pause.

TOKEN-LINE — compact replica (norm: dev's `### TOKEN-LINE`): every DECISION block OPENS with
the token-spend line — before rendering the menu run the read-only call
`node <base-dir-скилла>/../../scripts/session-tokens.mjs --cwd <корень-проекта>` and paste its
output VERBATIM above the chips (`контекст ≈574k/1M · 57%`, or a degradation
`окно: н/д — <причина>`); EMPTY output → no line. Fail-open is absolute: the script always
exits 0 and NEVER delays or breaks a menu — a missing line is the degradation, never a wait.

MENU-CONTEXT — compact replica (norm: dev's `### MENU-CONTEXT`):

- RULE — a property of the CALL, not a separate step: every `staging_resolve` that follows a
  PRESENTED digit menu MUST carry the menu payload; resolve после меню без menu-поля = VIOLATION.
- Mid-loop DECISION menus (a question to the user, the exhaustion menu) have NO engine call at
  choice time — they are honestly UNCOVERED (the closed class registry offers no door).
- The finale's staged-note curation carries the standard payload on every resolve:
  `{decision_class: "curation", options_n: 4, recommended_position: <позиция «← рекомендую»>,
  chosen_position: <цифра>}`; batch answers stamp N identical payloads (collapsed by the stats
  reader).
- NON-EVENTS (дословно): «позже / показать целиком / дальше / молчание → вызова нет, ничего не
  пишется» — never synthesize a call for coverage.
- NEUTRALITY: agreement-цифры, coverage и menu-контекст никогда не рендерятся в тексты, где
  вырабатывается рекомендация.

## Rules

- INTERVIEWER × GROUNDED RESPONDENT — asymmetric roles, never a debate; the interviewer drives
  the tree, spawns answer FACTS, the user answers DECISIONS (`## NEVER-DELEGATE-DECISIONS`).
- RESPONDENT-PREAMBLE ORDER IS LAW — default role → user role file → guard epilogue LAST; the
  guards are not disableable by any role text; reordering or omission is a VIOLATION.
- REQUALIFY-TO-DECISION IS MECHANICS — no address ⇒ not a fact ⇒ the literal requalified round
  line and a user menu the same turn; «не знаю» is legal and takes the same route.
- ROUND-LINE — every exchange is one compact transcript line; the first live run is the
  human-acceptance point of compactness (honest limit).
- ROUNDS-BUDGET — default 25, extension only by an explicit «+10» digit, early exit on a closed
  tree; «до полного согласия» does not exist.
- SPAWN-FAILOPEN — a dead spawn marks the round failed and routes the question to the user; the
  loop lives; no auto-retry in v1.
- DOSSIER-ROUND — one researcher spawn, conspectus with file:line in the tmpdir, recall bundle
  forwarded WHOLE AND VERBATIM with the grounding rule; nothing in the project tree.
- FULL JOURNAL — every spawn sees every prior pair; a sliding window is rejected by design.
- FINALE — grill's protocol file with three-class provenance on every closed branch; user
  decisions staged via remember (queue only, human gate untouched); terminal `раундов N ·
  failed K`; HANDOFF finale closing with the staged-note curation menu.
- OUTPUT-GRAMMAR / TOKEN-LINE / MENU-CONTEXT — per the replicas above; defined once in dev.
- LANGUAGE — English body + Russian runtime user-facing output; the protocol file follows the
  docs/ directory's existing language.
