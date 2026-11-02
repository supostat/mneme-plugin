---
name: prompt
description: "compose a correct /mneme:* command from the user's own words — pick the command by one route table, write it on one line in that command's template, check it (одна задача, только принятые решения, нет фаз и шагов, контекст раскрыт, команда существует) and print it without running it. Invoke when the user asks for a mneme command in words («дай промпт для mneme:…», «сделаем через mneme», «какой командой mneme это сделать») and before writing into a reply any /mneme: command that no skill's finale printed in this session"
allowed-tools: [Read, Grep, Bash]
---

# /mneme:prompt — Turn the user's words into one correct /mneme: command

The argument of a mneme command is read by the skill alone — the engine never checks it — and every
other skill of the bundle but diary is invisible to the model, so the agent that writes a command
for the user has never seen the contracts it must fit. This skill is those contracts in one place
the model CAN see: one route table, one template per command, and a self-check of the line before it
is printed. It writes nothing and runs nothing; the user runs the line.

This is one of the TWO skills the model may invoke on its own (the other is `/mneme:diary`): its
frontmatter carries no `disable-model-invocation`, and the MODEL-INVOCABLE registry in
`check-skill-handoff` pins those exceptions to exactly these two skills.

## TRIGGER — when the agent invokes it

- The user asks for a mneme command in words: «дай промпт для mneme:…», «сделаем через mneme»,
  «какой командой mneme это сделать», or types `/mneme:prompt`.
- The agent is about to write into its reply a `/mneme:` command that no skill's finale printed in
  this session. A command a finale DID print (plan, fix, migrate, grill, grill-agent, design, arch,
  resume) is shown as printed — prompt never recomposes it.
- prompt's own printed line does not trigger it again.
- Never in the middle of a step of `/mneme:dev`, and never in a turn where another skill renders a
  DECISION block — two DECISION blocks in one message are a VIOLATION per dev's `## OUTPUT-GRAMMAR`.

## Arguments

`/mneme:prompt "<что хочешь сделать своими словами>"` — the intent, in the user's words.

Invoked by the model on its own, the intent is the user's last request in the conversation. No
intent at all → ask one line «что хочешь сделать — одной фразой?» (the sole opening question of
grill and fix: the answer is free text, not a choice), then proceed.

## Permissions (VIOLATION = ABORT)

- Read / Grep: ONLY two kinds of target — `<base-dir-скилла>/../<имя>/SKILL.md` (does the command
  exist), and the files the route depends on or the line names: a spec (`^# Gameplan`), a protocol
  `docs/GRILL-*.md`, an etalon folder `design/pages/<slug>/`, a brief. Never to re-read the
  project, never to research the task — that is the work of the command being composed.
- Bash: ONLY the read-only session-tokens call before a DECISION block (the TOKEN-LINE replica in
  Output format). Any other Bash is FORBIDDEN.
- Skill / Task / Edit / Write / every mcp tool (memory, map, workflow): FORBIDDEN. prompt prints a
  line, never runs it, and never invokes another skill — the other mneme skills carry
  `disable-model-invocation`, and running the line is the user's move.

## ROUTE-TABLE — one table, first matching row wins

Walk the rows top to bottom; the first row whose signal fits the intent decides the command. A
template is filled, never re-shaped.

- **The intent names a file carrying a `# Gameplan` heading** (Grep it) — an external spec →
  `/mneme:migrate <путь>`
- **A failure** — an error text, a red test, «работало — сломалось», behaviour that diverges from
  what the code should already do → `/mneme:fix "<симптом: что делал, что ожидал, что получил; текст ошибки дословно>"`
  — the symptom only: a hypothesis or a ready fix stays out, fix builds its own hypothesis fan.
- **Continue, «где я», run the phases** → `/mneme:resume` — dev and `diary run` are never composed
  here: their command is printed by the finale of plan, fix or migrate, or by resume's survey, and
  a slug is never guessed.
- **An interrogation protocol `docs/GRILL-<slug>.md` exists for the topic** →
  `/mneme:plan "<задача> по протоколу docs/GRILL-<slug>.md"`
- **An etalon exists in `design/pages/<slug>/` and the task is to implement it** →
  `/mneme:plan "реализовать по эталону design/pages/<slug>/<slug>.<html|json>"`
- **A new page or screen with no etalon** → `/mneme:design "<страница или фича: для кого она и что на ней делают>"`;
  with a brief file → `/mneme:design "<страница или фича: для кого она и что на ней делают> по брифу <путь к брифу>"`
- **An option already chosen in an architecture analysis** →
  `/mneme:plan "<изменение>. Решено в /mneme:arch: <выбранный вариант своими словами> — <почему он>. Решить: <что осталось открытым>"`
- **An architecture question with no decision to change anything yet** →
  `/mneme:arch "<вопрос об устройстве>"`
- **A change whose behaviour is understood** →
  `/mneme:plan "<изменение>. Сейчас: <факты с путями>. Нужно: <наблюдаемое поведение>. Решить: <открытые вопросы>. Не трогать: <границы>"`
- **A raw idea whose unknowns are the user's intentions** → `/mneme:grill "<сырая идея словами пользователя>"`;
  **a raw idea whose unknowns are mostly facts the existing code can answer** →
  `/mneme:grill-agent "<тема>"`
- **The project map** → `/mneme:map`; **first setup of a repository** → `/mneme:setup`; **a retro
  of this session** → `/mneme:diary`; **the design server** → `/mneme:design-server`

In the plan templates a section with nothing in it drops out whole, label included — «нет» is never
written; the first sentence is mandatory. Unaccepted assumptions of the agent go into «Решить:», so
plan's fan lays them out — they never become a question here.

## Procedure

### Step 1: INTENT

Take the intent from the argument or the user's last request. Collect what the line may carry: the
user's own words, the decisions the user SAID or CHOSE BY DIGIT in this session, the paths and facts
already established. Nothing else counts as decided.

### Step 2: ROUTE

Walk ROUTE-TABLE. Read / Grep only to settle a row: a `# Gameplan` heading, a `docs/GRILL-*.md`
protocol, a `design/pages/<slug>/` folder. Two rows fit and the user's words do not tell them apart
→ the AMBIGUITY menu (Output format) closes the turn; the user's digit picks the row.

### Step 3: COMPOSE

Fill the row's template. Long context rides a reference to a file that already exists (a protocol,
a spec, a brief) — prompt never writes one. No such file and the line cannot hold the context →
route to `/mneme:grill-agent "<тема>"` instead; its protocol becomes that file. A line for another
repository writes its paths from THAT repository's root.

### Step 4: SELF-CHECK — five items, before printing

- **одна задача** — several independent tasks become several lines in execution order, each with
  its own self-check; parts of one task stay one line.
- **только принятые решения** — a decision enters as decided only when the user said it or chose
  it by digit in this session; the agent's assumptions move to «Решить:» (in a fix line they are
  dropped — fix builds its own hypotheses).
- **нет фаз и шагов** — no phases, no implementation steps, no list of edits by file: the fan and
  the Gameplan are plan's work. Fact addresses `file:line` in «Сейчас:» are allowed.
- **контекст раскрыт** — «вариант A», «этап 5», «как выше», «тот баг» are replaced by their
  content; the command runs in a session that has not seen this one. Paths come from the target
  repository's root; an id or slug from this session enters only when it exists on disk.
- **команда существует** — Read `<base-dir-скилла>/../<имя>/SKILL.md`: no file, no command (a name
  like agent-grill dies here). Every file the line names exists.

The form: one line, a text argument in `"…"`, inner quotes turned into «», no line breaks. A check
that fails is repaired in the line, never reported instead of it.

### Step 5: PRINT and STOP

Print the line per Output format and STOP. Do not run it, do not invoke the skill it names.

## Output format

Russian runtime output; protocol tokens (`/mneme:*`, `Решить:`) stay literal. Composition follows
dev's `## OUTPUT-GRAMMAR` (defined once there, never re-stated here). FINALE-CLASS-INFORMATIONAL:
the turn creates nothing — the composed command is DATA, the turn shows a line and stops, with no
menu after it.

The finale — DATA, literal shape (fill the placeholders, never re-lay them out):

```
<команда одной строкой>
```

Почему эта: <строка ROUTE-TABLE одной фразой>.
Самопроверка: <что исправлено — «вариант A» раскрыт, допущение X перенесено в «Решить:» — или «чисто»>.
Запускать из сессии: <корень целевого репозитория> (only for a line meant for another repository)

Several tasks render as numbered blocks of the same shape, in execution order.

The AMBIGUITY menu — a DECISION block that closes the turn, nothing after it:

```
`1 — /mneme:<команда>: <что она сделает с этим запросом>`
`2 — /mneme:<команда>: <что она сделает с этим запросом>`
```

(the «← рекомендую: <причина одной строкой>» suffix rides exactly ONE option; silence = pause; on
the digit prompt composes, self-checks and prints that row's line. No engine call exists at this
choice, so nothing is stamped.)

TOKEN-LINE — compact replica (norm: dev's `### TOKEN-LINE`): every DECISION block OPENS with the
token-spend line — before rendering the menu run the read-only call
`node <base-dir-скилла>/../../scripts/session-tokens.mjs --cwd <корень-проекта>` and paste its
output VERBATIM above the chips (`контекст ≈574k/1M · 57%`, or a degradation
`окно: н/д — <причина>`); EMPTY output → no line. Fail-open is absolute: the script always exits
0 and NEVER delays or breaks a menu — a missing line is the degradation, never a wait.

### Language

Print user-facing text in Russian; keep `/mneme:*` commands, template labels and protocol tokens
literal.

## Rules

- PRINT, NEVER RUN — prompt composes and prints one line per task; it never runs the line, never
  invokes another skill, never writes a file. VIOLATION = ABORT.
- ONE ROUTE TABLE — the command comes from ROUTE-TABLE, first matching row; dev and `diary run`
  are never composed, a slug is never guessed.
- TEMPLATE, NOT INVENTION — the line fills its row's template; the templates are the same literals
  the finales of grill, grill-agent, arch, design and plan carry, pinned by `check-skill-handoff`.
- SELF-CHECK BEFORE PRINT — одна задача, только принятые решения, нет фаз и шагов, контекст
  раскрыт, команда существует; a failed item is repaired in the line.
- AMBIGUITY IS A DECISION — two fitting rows close the turn with the digit menu; the agent's
  assumptions are never asked, they go into «Решить:».
- TRIGGER — invoked on a request for a mneme command in words and before any `/mneme:` command no
  finale printed; never mid-step, never beside another skill's DECISION block.
- LANGUAGE — English body + Russian runtime user-facing output.
