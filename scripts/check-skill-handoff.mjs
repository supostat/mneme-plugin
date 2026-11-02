#!/usr/bin/env node
//
// Structural sync test for what the SKILL TEXTS must agree on — the HANDOFF-DECISION norm
// (spec-handoff-decision) and the contracts that have since grown around it.
//
// The norm lives in dev/SKILL.md's OUTPUT-GRAMMAR; its form-critical pieces are REPLICATED into
// the sibling skills because only one skill's text is loaded at runtime. Replication is exactly
// how the original defect shipped (finales drifting from the norm), so drift must be a FAILING
// TEST, not the next live episode. The same argument covers every other fact a skill's text
// states about itself — the finale class it claims, the bundle script it invokes, the tools it is
// granted — and each of those facts is pinned by ONE map here, never by a second copy elsewhere.
// Seventeen checks:
//
//   (a) every non-dev skill declares its expected FINALE-CLASS token — and never both;
//   (b) handoff finales (plan, fix, migrate) reference HANDOFF-DECISION and carry a closing
//       DECISION chip template;
//   (c) any skill granting staging tools in frontmatter shows the queue and decides by digit —
//       a grant without a curation surface turns the curator back into an operator;
//   (d) the curation-contract anchor lines (batch menu labels, the never-tell-the-user rule)
//       are present in all four replicas (dev, plan, fix, diary) — the diverged-replica detector;
//   (e) dev carries no stale CONTINUE-DECISION marker (the negation a shell-less gate-runner
//       cannot express);
//   (f) every skill granting staging_resolve in frontmatter (plus dev, the norm's home) carries
//       the MENU-CONTEXT block, and its anchor lines (the VIOLATION formula, the verbatim
//       non-events line, the neutrality line) have not diverged — whitespace-normalized compare,
//       the (d) pattern;
//   (g) negation guards, the (e) pattern: a replica must not weaken the norm — «menu
//       опционален»/«menu optional» in a skill that resolves staging, a «без menu-поля» not
//       followed by «= VIOLATION», or a menu-and-retag/retire/reanchor paragraph without the
//       explicit prohibition (v1 stamps note resolutions only) all FAIL;
//   (h) the SPEC-REVIEW-MENU replicas (plan owns the norm, fix carries its own text): both
//       declare the template and share its anchor chips, and neither weakens it — the «принять»
//       chip may never carry «← рекомендую» (ANTI-SELF-ENDORSEMENT: the agent authored the spec
//       under review), and the prose shape the menu retired may appear ONLY as a quoted
//       counter-example, i.e. in a paragraph that also says VIOLATION;
//   (i) SCRIPT-EXISTS — every bundle script a skill invokes (either idiom:
//       `<base-dir-скилла>/../../scripts/X` or `$CLAUDE_PLUGIN_ROOT/scripts/X`) is resolved out
//       of the skill's TEXT and must exist in plugin/scripts/: a renamed or unshipped script is
//       a skill that dies at its first Bash call, and prose cannot notice;
//   (j) TOOL-TOKENS — `allowed-tools` is parsed into EXACT tokens and matched against the
//       expectations table. Exactness is the point: a substring test for «Edit» is green for
//       «NotebookEdit» too. A thin wrapper is pinned to its whole grant (anything extra is an
//       error), a skill whose contract needs a tool must actually carry it, and a skill that is
//       not the map's writer must never carry map_put / map_delete;
//   (k) HANDOFF-TRIGGER — the phrase design hands over and the phrase plan's
//       ETALON-ACCEPTANCE-RULE triggers on are ONE literal: plan must quote it, design must carry
//       it inside its fenced `/mneme:plan "…"` handoff — a replica with an anchor, the (d) pattern;
//   (l) LOG-FREE — resume's text names none of the event-log markers (`events/`, `.jsonl`,
//       `.git/HEAD`, `workflow_step_applied`, `result_kind`, `schema_version`): orientation reads
//       the engine's read-only survey, and a skill that still names the log is a skill that will
//       read it again the day a survey answer looks thin;
//   (m) RESOLVE-INDEX — the stale-index answer (`Index not rebuilt:`) is a COMMITTED decision in
//       the norm (dev) and the curation replicas (plan, fix, diary): the four anchors are present,
//       whitespace-normalized, and no paragraph around the line tells the agent to retry the
//       resolve — a retry writes a second event;
//   (n) MAP — the project-map contract stands where each skill consumes the map: dev names the
//       MAP fence, the memory-gap line, the section-id ban in used_notes and the domains tail;
//       plan names recall_domains and domains; arch opens with map_list {}; migrate's convention
//       names the optional domains <a,b> tail;
//   (o) MODEL-INVOCABLE — the registry of skills the model may invoke on its own is exactly
//       [diary, prompt]: their frontmatter carries no `disable-model-invocation: true`, every other
//       skill directory does. The skill list comes from plugin/skills/ itself, not from a table, so
//       a skill forgotten in every registry is still checked; a registry entry without a directory
//       fails too;
//   (p) DIARY — the diary contract stands where it is consumed: dev's RUN COMPLETE terminal hands
//       over `/mneme:diary run <run_id>`, and the diary skill carries the four question labels,
//       the `run:<run_id>` tag and the `diary:` hook-line prefix in its description, and the
//       skill-candidate rule with its handoff: the `### SKILL-CANDIDATE` heading at a line start,
//       the `skill-candidate` tag, and the `/mneme:plan "создать скилл …` template pinned by (q3);
//   (q) PROMPT — the commands a skill text names, and the command lines it hands over, are the
//       bundle's real ones: every `/mneme:<id>` in every skill is a skill directory; every template
//       of prompt's ROUTE-TABLE takes its argument the way the target's `## Arguments` does, no
//       template composes dev or `diary run`, and every skill but dev and prompt has a row; each
//       handoff template is byte-identical in every text that carries it — prompt's route table,
//       the finales that print it, diary's skill-candidate handoff; prompt's
//       description carries its trigger phrases and its body the five self-check labels; setup's
//       «what's next» names every entry. The defects this pins were live: a nonexistent command
//       typed into a prompt, a failure report sent to plan, a finale that knew only some entries.
//   (r) SPEC-LINE-SHAPES — both skills that author a spec (plan owns the rule, fix replicates it)
//       carry the engine parser's line forms: the `**SPEC-LINE-SHAPES` definition at a line start,
//       the executable, agent-judged and task markers, and a check of the draft against the forms
//       in their review step. Twice a draft reached `workflow_migrate` in a form the parser refuses.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/ (same rule as the other check-*).
//
// Usage: node scripts/check-skill-handoff.mjs   (also runs as part of npm test)

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillText = (name) => readFileSync(join(repoRoot, 'plugin', 'skills', name, 'SKILL.md'), 'utf8');
const frontmatterOf = (text) => {
  const frontmatterEnd = text.indexOf('---', 3);
  return text.slice(0, frontmatterEnd === -1 ? 0 : frontmatterEnd);
};

const HANDOFF = 'FINALE-CLASS-HANDOFF';
const INFORMATIONAL = 'FINALE-CLASS-INFORMATIONAL';
const EXPECTED_FINALE_CLASS = {
  plan: HANDOFF,
  fix: HANDOFF,
  migrate: HANDOFF,
  design: HANDOFF,
  'grill-agent': HANDOFF,
  diary: HANDOFF,
  arch: INFORMATIONAL,
  resume: INFORMATIONAL,
  setup: INFORMATIONAL,
  grill: INFORMATIONAL,
  'design-server': INFORMATIONAL,
  map: INFORMATIONAL,
  prompt: INFORMATIONAL,
};
const CONTRACT_REPLICAS = ['dev', 'plan', 'fix', 'diary'];
const CONTRACT_ANCHORS = ['прими все', 'поштучный разбор', 'отклони все', 'NEVER tell the user'];
const ALL_SKILLS = ['dev', ...Object.keys(EXPECTED_FINALE_CLASS)];

const failures = [];

// (a) finale class declared, and only the expected one
for (const [name, expected] of Object.entries(EXPECTED_FINALE_CLASS)) {
  const text = skillText(name);
  const opposite = expected === HANDOFF ? INFORMATIONAL : HANDOFF;
  if (!text.includes(expected)) failures.push(`${name}: missing its finale-class marker ${expected}`);
  if (text.includes(opposite)) failures.push(`${name}: carries the OPPOSITE class marker ${opposite} — one finale, one class`);
}

// (b) handoff finales close with a menu, per the norm they reference
for (const [name, expected] of Object.entries(EXPECTED_FINALE_CLASS)) {
  if (expected !== HANDOFF) continue;
  const text = skillText(name);
  if (!text.includes('HANDOFF-DECISION')) failures.push(`${name}: handoff finale without a HANDOFF-DECISION reference`);
  if (!/^`1 — /m.test(text)) failures.push(`${name}: no closing DECISION chip template (no line starting with \`1 — …\`)`);
}

// (c) a staging-tool grant demands a curation surface
for (const name of ALL_SKILLS) {
  const text = skillText(name);
  const frontmatter = frontmatterOf(text);
  if (!frontmatter.includes('staging_resolve')) continue;
  if (!text.includes('staging_list')) failures.push(`${name}: staging_resolve granted but the queue is never shown (no staging_list)`);
  if (!/прими/.test(text)) failures.push(`${name}: staging_resolve granted but no digit menu offers «прими»`);
}

// (d) the contract replicas carry the same anchor lines
for (const name of CONTRACT_REPLICAS) {
  const text = skillText(name);
  for (const anchor of CONTRACT_ANCHORS) {
    if (!text.includes(anchor)) failures.push(`${name}: curation-contract anchor «${anchor}» missing — replicas diverged`);
  }
}

// (e) the rename left no stale marker behind
if (skillText('dev').includes('CONTINUE-DECISION')) {
  failures.push('dev: stale CONTINUE-DECISION marker survives — the norm was renamed to HANDOFF-DECISION');
}

// (f) + (g) MENU-CONTEXT: the deciding call carries its menu — replicas aligned, norm not weakened
const normalize = (text) => text.replace(/\s+/g, ' ');
const MENU_ANCHORS = [
  'resolve после меню без menu-поля = VIOLATION',
  '«позже / показать целиком / дальше / молчание → вызова нет, ничего не пишется»',
  'agreement-цифры, coverage и menu-контекст никогда не рендерятся в тексты, где вырабатывается рекомендация',
];
const menuReplicas = new Set(['dev']); // dev is the norm's home even without a frontmatter grant
for (const name of ALL_SKILLS) {
  if (frontmatterOf(skillText(name)).includes('staging_resolve')) menuReplicas.add(name);
}

for (const name of menuReplicas) {
  const text = skillText(name);
  const flat = normalize(text);
  // (f) block present, anchor lines byte-identical after whitespace normalization
  if (!text.includes('MENU-CONTEXT')) {
    failures.push(`${name}: resolves staging but carries no MENU-CONTEXT block — the deciding call would ride unstamped`);
    continue;
  }
  for (const anchor of MENU_ANCHORS) {
    if (!flat.includes(anchor)) failures.push(`${name}: MENU-CONTEXT anchor «${anchor}» missing — replicas diverged`);
  }
  // (g1) no replica may declare the payload skippable
  if (/menu\s+(опционален|optional)/i.test(flat)) {
    failures.push(`${name}: declares menu «опционален/optional» — a replica must not weaken the norm`);
  }
  // (g2) every «без menu-поля» must carry its verdict — a clarified-away VIOLATION is a hole
  for (const tail of flat.split('без menu-поля').slice(1)) {
    if (!tail.startsWith(' = VIOLATION')) {
      failures.push(`${name}: «без menu-поля» appears without «= VIOLATION» — the rule got softened`);
    }
  }
  // (g3) menu next to request resolutions only with the explicit prohibition (v1: notes only)
  for (const paragraph of text.split(/\n\s*\n/)) {
    const flatParagraph = normalize(paragraph);
    if (!/\bmenu\b/i.test(flatParagraph)) continue;
    if (!/\b(retag|retire|reanchor)\b/i.test(flatParagraph)) continue;
    if (!/(НЕ передавать|не передавать|WITHOUT menu|never)/i.test(flatParagraph)) {
      failures.push(`${name}: a paragraph pairs menu with retag/retire/reanchor without the prohibition — v1 stamps note resolutions only`);
    }
  }
}

// (h) SPEC-REVIEW-MENU: the spec-review stop is closed by a menu, and no replica weakens it
const SPEC_REVIEW_REPLICAS = ['plan', 'fix'];
const SPEC_REVIEW_ANCHORS = ['1 — принять', '2 — правки', '4 — отмена', 'ANTI-SELF-ENDORSEMENT'];
const RETIRED_PROSE_SHAPE = /Подтверди\s+—/; // the SHAPE, not the word: morphology must not match

for (const name of SPEC_REVIEW_REPLICAS) {
  const text = skillText(name);
  const flat = normalize(text);
  if (!text.includes('SPEC-REVIEW-MENU')) {
    failures.push(`${name}: the spec-review stop carries no SPEC-REVIEW-MENU template — the agent would improvise prose`);
    continue;
  }
  for (const anchor of SPEC_REVIEW_ANCHORS) {
    if (!flat.includes(anchor)) failures.push(`${name}: SPEC-REVIEW-MENU anchor «${anchor}» missing — replicas diverged`);
  }
  // (h1) self-endorsement: the accept chip may never carry the recommendation
  for (const line of text.split('\n')) {
    if (line.includes('1 — принять') && line.includes('← рекомендую')) {
      failures.push(`${name}: the «принять» chip carries «← рекомендую» — ANTI-SELF-ENDORSEMENT forbids endorsing your own draft`);
    }
  }
  // (h2) the retired prose shape survives only as a quoted counter-example (the (g3) paragraph pattern)
  for (const paragraph of text.split(/\n\s*\n/)) {
    if (!RETIRED_PROSE_SHAPE.test(paragraph)) continue;
    if (!paragraph.includes('VIOLATION')) {
      failures.push(`${name}: «Подтверди —» outside a VIOLATION paragraph — that prose confirmation is what the menu retired`);
    }
  }
}

// (i) SCRIPT-EXISTS: a skill's script call resolves to a file that is actually shipped
const BUNDLE_SCRIPTS = new Set(readdirSync(join(repoRoot, 'plugin', 'scripts')));
const SCRIPT_INVOCATION = /(?:<base-dir-скилла>\/\.\.\/\.\.|\$CLAUDE_PLUGIN_ROOT)\/scripts\/([A-Za-z0-9._-]+)/g;

for (const name of ALL_SKILLS) {
  for (const [, script] of skillText(name).matchAll(SCRIPT_INVOCATION)) {
    if (!BUNDLE_SCRIPTS.has(script)) {
      failures.push(`${name}: invokes plugin/scripts/${script}, which is not in the bundle — the call would die at runtime`);
    }
  }
}

// (j) TOOL-TOKENS: the frontmatter grant parsed into exact tokens, then matched against the table
const MAP_WRITE_TOOLS = ['mcp__plugin_mneme_memory__map_put', 'mcp__plugin_mneme_memory__map_delete'];
const TOOL_TOKEN_EXPECTATIONS = [
  { skill: 'design-server', rule: 'exactly', tools: ['Read', 'Bash'] },
  { skill: 'design', rule: 'carries', tools: ['Edit'] },
  { skill: 'resume', rule: 'exactly', tools: ['Read', 'Grep', 'mcp__plugin_mneme_memory__workflow_survey'] },
  { skill: 'map', rule: 'exactly', tools: ['Read', 'Grep', 'Bash', 'Task', 'mcp__plugin_mneme_memory__map_list', ...MAP_WRITE_TOOLS] },
  {
    skill: 'arch',
    rule: 'exactly',
    tools: ['Read', 'Grep', 'mcp__plugin_mneme_memory__recall', 'mcp__plugin_mneme_memory__remember', 'mcp__plugin_mneme_memory__map_list'],
  },
  { skill: 'plan', rule: 'carries', tools: ['mcp__plugin_mneme_memory__map_list'] },
  {
    skill: 'diary',
    rule: 'exactly',
    tools: [
      'Read',
      'Grep',
      'Bash',
      'mcp__plugin_mneme_memory__diary_facts',
      'mcp__plugin_mneme_memory__recall',
      'mcp__plugin_mneme_memory__remember',
      'mcp__plugin_mneme_memory__staging_list',
      'mcp__plugin_mneme_memory__staging_resolve',
    ],
  },
  { skill: 'prompt', rule: 'exactly', tools: ['Read', 'Grep', 'Bash'] },
  ...['dev', 'resume', 'design-server', 'fix', 'setup', 'diary', 'prompt'].map((skill) => ({ skill, rule: 'never', tools: MAP_WRITE_TOOLS })),
];

for (const { skill, rule, tools } of TOOL_TOKEN_EXPECTATIONS) {
  const declaration = skillText(skill).match(/^allowed-tools:\s*\[([^\]]*)\]/m);
  if (declaration === null) {
    failures.push(`${skill}: no allowed-tools list in the frontmatter — its grant cannot be checked`);
    continue;
  }
  const grantedTools = declaration[1].split(',').map((token) => token.trim()).filter((token) => token !== '');
  if (rule === 'exactly') {
    const extraTools = grantedTools.filter((token) => !tools.includes(token));
    const missingTools = tools.filter((token) => !grantedTools.includes(token));
    if (extraTools.length > 0) {
      failures.push(`${skill}: allowed-tools grants ${extraTools.join(', ')} beyond its exact contract [${tools.join(', ')}]`);
    }
    if (missingTools.length > 0) {
      failures.push(`${skill}: allowed-tools lacks ${missingTools.join(', ')} of its exact contract [${tools.join(', ')}]`);
    }
  } else if (rule === 'never') {
    for (const token of tools.filter((tool) => grantedTools.includes(tool))) {
      failures.push(`${skill}: allowed-tools carries «${token}» — only /mneme:map writes the map`);
    }
  } else {
    for (const token of tools.filter((tool) => !grantedTools.includes(tool))) {
      failures.push(`${skill}: allowed-tools carries no exact token «${token}» — its contract needs it`);
    }
  }
}

// (k) HANDOFF-TRIGGER: the phrase design hands over is the phrase plan triggers on
const HANDOFF_TRIGGER = 'реализовать по эталону design/pages/<slug>/';
const HANDOFF_PHRASE = `/mneme:plan "${HANDOFF_TRIGGER}`;

if (!skillText('plan').includes(HANDOFF_TRIGGER)) {
  failures.push(`plan: ETALON-ACCEPTANCE-RULE does not quote the trigger «${HANDOFF_TRIGGER}» — the implement-by-etalon rule would fire on nothing design hands over`);
}
if (!skillText('design').includes(HANDOFF_PHRASE)) {
  failures.push(`design: the handoff block carries no line «${HANDOFF_PHRASE}…» — the phrase design hands over would not trigger plan's ETALON-ACCEPTANCE-RULE`);
}

// (l) LOG-FREE: orientation reads the engine's survey, never the event log
const LOG_MARKERS = ['events/', '.jsonl', '.git/HEAD', 'workflow_step_applied', 'result_kind', 'schema_version'];
const resumeText = skillText('resume');

for (const marker of LOG_MARKERS.filter((candidate) => resumeText.includes(candidate))) {
  failures.push(`resume: text mentions «${marker}» — orientation reads the engine's survey, never the event log`);
}

// (m) RESOLVE-INDEX: a stale-index answer is a committed decision in the norm and both replicas
const RESOLVE_INDEX_REPLICAS = ['dev', 'plan', 'fix', 'diary'];
const RESOLVE_INDEX_ANCHORS = ['RESOLVE-INDEX', 'Index not rebuilt:', 'принятое решение, не ошибка', 'не повторять'];
const RETRY_INSTRUCTION = /(?<!не )повторить `?staging_resolve/;

for (const name of RESOLVE_INDEX_REPLICAS) {
  const text = skillText(name);
  const flat = normalize(text);
  for (const anchor of RESOLVE_INDEX_ANCHORS) {
    if (!flat.includes(anchor)) failures.push(`${name}: RESOLVE-INDEX anchor «${anchor}» missing — replicas diverged`);
  }
  for (const paragraph of text.split(/\n\s*\n/)) {
    if (!paragraph.includes('Index not rebuilt:')) continue;
    const retry = normalize(paragraph).match(RETRY_INSTRUCTION);
    if (retry) failures.push(`${name}: «${retry[0]}» next to «Index not rebuilt:» — the decision is committed and never retried`);
  }
}

// (n) MAP: the map contract's load-bearing tokens stand where each skill consumes the map
const MEMORY_GAP_LINE = 'No memory above the relevance threshold for this question: record what you learn with remember.';
const MAP_ANCHORS = {
  dev: ['BEGIN MNEME MAP', MEMORY_GAP_LINE, 'id раздела карты в `used_notes` запрещён', 'recall_domains', 'domains'],
  plan: ['recall_domains', 'domains'],
  arch: ['map_list {}'],
  migrate: ['domains <a,b>'],
};

for (const [name, anchors] of Object.entries(MAP_ANCHORS)) {
  const flat = normalize(skillText(name));
  for (const anchor of anchors) {
    if (!flat.includes(anchor)) failures.push(`${name}: MAP anchor «${anchor}» missing — the map is not consumed where the contract puts it`);
  }
}

// (o) MODEL-INVOCABLE: exactly the registered skills may be invoked by the model; every other skill
// directory carries the disabling key. The list comes from the directory, never from a table.
const MODEL_INVOCABLE_SKILLS = ['diary', 'prompt'];
const DISABLE_MODEL_INVOCATION = 'disable-model-invocation: true';
const skillDirectories = readdirSync(join(repoRoot, 'plugin', 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const name of MODEL_INVOCABLE_SKILLS.filter((skill) => !skillDirectories.includes(skill))) {
  failures.push(`MODEL-INVOCABLE: the registry names «${name}», but plugin/skills/${name}/ does not exist — a stale registry entry`);
}
for (const name of skillDirectories) {
  const frontmatter = frontmatterOf(skillText(name));
  const registered = MODEL_INVOCABLE_SKILLS.includes(name);
  const disabled = frontmatter.includes(DISABLE_MODEL_INVOCATION);
  if (registered && disabled) {
    failures.push(`${name}: the MODEL-INVOCABLE registry lists it, yet its frontmatter carries «${DISABLE_MODEL_INVOCATION}» — the model could never invoke it`);
  }
  if (!registered && !disabled) {
    failures.push(`${name}: frontmatter lacks «${DISABLE_MODEL_INVOCATION}» — only the MODEL-INVOCABLE registry [${MODEL_INVOCABLE_SKILLS.join(', ')}] may be invoked by the model`);
  }
}

// (p) DIARY: the diary contract stands where it is consumed
const DIARY_ANCHORS = {
  dev: ['/mneme:diary run <run_id>'],
  diary: ['Что произошло:', 'Зачем:', 'Правильно ли:', 'Как улучшить:', 'run:<run_id>', 'skill-candidate'],
};
const DIARY_HOOK_PREFIX = 'diary:';
const SKILL_CANDIDATE_HEADING = /^### SKILL-CANDIDATE\b/m;

for (const [name, anchors] of Object.entries(DIARY_ANCHORS)) {
  const flat = normalize(skillText(name));
  for (const anchor of anchors) {
    if (!flat.includes(anchor)) failures.push(`${name}: DIARY anchor «${anchor}» missing — the diary contract is not carried where it is consumed`);
  }
}
const diaryDescription = skillText('diary').match(/^description:.*$/m)?.[0] ?? '';
if (!diaryDescription.includes(DIARY_HOOK_PREFIX)) {
  failures.push(`diary: the description does not name the hook-line prefix «${DIARY_HOOK_PREFIX}» — the model would not know when to invoke the skill`);
}
if (!SKILL_CANDIDATE_HEADING.test(skillText('diary'))) {
  failures.push('diary: no `### SKILL-CANDIDATE` section — a recurring kind of work would never be offered as a skill');
}

// (q) PROMPT: the commands a skill text names and hands over are the bundle's real ones
const sectionOf = (text, heading) => {
  const start = text.search(heading);
  if (start === -1) return null;
  const level = text.slice(start).match(/^#+/)[0].length;
  const bodyStart = text.indexOf('\n', start) + 1;
  const nextHeading = new RegExp(`^#{1,${level}} `, 'm').exec(text.slice(bodyStart));
  return text.slice(start, nextHeading === null ? undefined : bodyStart + nextHeading.index);
};
const commandPattern = (name) => new RegExp(`/mneme:${name}(?![a-z0-9-])`);
const codeSpans = (text) => [...text.matchAll(/`([^`\n]+)`/g)].map(([, span]) => span);
const leadingCommandOf = (span) => span.match(/^\/mneme:([a-z][a-z0-9-]*)/)?.[1];
const COMMAND_TOKEN = /\/mneme:([a-z][a-z0-9-]*)/g;
const argumentKindOf = (template, name) => {
  const rest = template.slice(`/mneme:${name}`.length);
  if (rest === '' || rest.startsWith(' [')) return 'no argument';
  if (rest.startsWith(' "')) return 'quoted text';
  if (rest.startsWith(' <')) return 'a positional value';
  return `the keyword «${rest.trim().split(/\s/)[0]}»`;
};

// (q1) every named command is a skill directory
for (const name of skillDirectories) {
  const unknownCommands = new Set(
    [...skillText(name).matchAll(COMMAND_TOKEN)].map(([, id]) => id).filter((id) => !skillDirectories.includes(id)),
  );
  for (const id of unknownCommands) {
    failures.push(`${name}: names /mneme:${id}, which is no skill of the bundle — fix the name or drop the reference`);
  }
}

// (q2) every route template takes its argument the way its target's ## Arguments does
const NEVER_COMPOSED = [/^\/mneme:dev(?![a-z0-9-])/, /^\/mneme:diary run/];
const UNROUTED_SKILLS = ['dev', 'prompt'];
const promptText = skillText('prompt');
const routeTable = sectionOf(promptText, /^## ROUTE-TABLE\b/m);

if (routeTable === null) {
  failures.push('prompt: no `## ROUTE-TABLE` section — the command would be picked by guesswork');
} else {
  const routedSkills = new Set();
  for (const template of codeSpans(routeTable).filter((span) => leadingCommandOf(span) !== undefined)) {
    const name = leadingCommandOf(template);
    routedSkills.add(name);
    if (NEVER_COMPOSED.some((pattern) => pattern.test(template))) {
      failures.push(`prompt: ROUTE-TABLE composes «${template}» — dev and diary run come only from a finale or resume's survey`);
      continue;
    }
    if (!skillDirectories.includes(name)) continue;
    const argumentsSection = sectionOf(skillText(name), /^## Arguments\b/m);
    if (argumentsSection === null) {
      failures.push(`${name}: no \`## Arguments\` section — prompt's route template for it cannot be checked`);
      continue;
    }
    const targetKinds = new Set(
      codeSpans(argumentsSection)
        .filter((span) => leadingCommandOf(span) === name)
        .map((form) => argumentKindOf(form, name)),
    );
    const templateKind = argumentKindOf(template, name);
    if (!targetKinds.has(templateKind)) {
      failures.push(
        `prompt: ROUTE-TABLE template «${template}» takes ${templateKind}, but /mneme:${name} takes ${[...targetKinds].join(' or ')} — copy the form from plugin/skills/${name}/SKILL.md`,
      );
    }
  }
  for (const name of skillDirectories.filter((skill) => !UNROUTED_SKILLS.includes(skill) && !routedSkills.has(skill))) {
    failures.push(`prompt: ROUTE-TABLE has no row for /mneme:${name} — every skill but dev and prompt must be reachable from the user's words`);
  }
}

// (q3) each handoff template is one literal, byte-identical in every text that prints it
const GRILL_PROTOCOL_TRIGGER = 'по протоколу docs/GRILL-';
const HANDOFF_TEMPLATES = [
  { literal: `/mneme:plan "<задача> ${GRILL_PROTOCOL_TRIGGER}<slug>.md"`, carriers: ['grill', 'grill-agent', 'prompt'] },
  {
    literal: '/mneme:plan "<изменение>. Решено в /mneme:arch: <выбранный вариант своими словами> — <почему он>. Решить: <что осталось открытым>"',
    carriers: ['arch', 'prompt'],
  },
  { literal: `${HANDOFF_PHRASE}<slug>.<html|json>"`, carriers: ['design', 'prompt'] },
  { literal: '/mneme:fix "<симптом: что делал, что ожидал, что получил; текст ошибки дословно>"', carriers: ['plan', 'prompt'] },
  { literal: '/mneme:design "<страница или фича: для кого она и что на ней делают>"', carriers: ['plan', 'prompt'] },
  { literal: '/mneme:migrate <путь>', carriers: ['plan', 'prompt'] },
  {
    literal: '/mneme:plan "создать скилл <вид работы>. Сейчас: <доказательства: прогоны, заметки, повторённые ошибки>. Нужно: <что рецепт закрепит>. Решить: проектный скилл или скилл плагина"',
    carriers: ['diary'],
  },
];

for (const { literal, carriers } of HANDOFF_TEMPLATES) {
  for (const carrier of carriers.filter((name) => !skillText(name).includes(literal))) {
    failures.push(`${carrier}: does not carry the handoff template «${literal}» byte for byte — restore it from HANDOFF_TEMPLATES in scripts/check-skill-handoff.mjs`);
  }
}
if (!skillText('plan').includes(GRILL_PROTOCOL_TRIGGER)) {
  failures.push(`plan: GRILL-READ does not quote the trigger «${GRILL_PROTOCOL_TRIGGER}» — the protocol grill hands over would not be read`);
}

// (q4) prompt's description carries its triggers, its body the five self-check labels
const PROMPT_TRIGGERS = ['дай промпт для mneme:', 'сделаем через mneme'];
const SELF_CHECK_LABELS = ['одна задача', 'только принятые решения', 'нет фаз и шагов', 'контекст раскрыт', 'команда существует'];
const promptDescription = promptText.match(/^description:.*$/m)?.[0] ?? '';
const promptBody = promptText.slice(frontmatterOf(promptText).length);

for (const trigger of PROMPT_TRIGGERS.filter((phrase) => !promptDescription.includes(phrase))) {
  failures.push(`prompt: the description does not carry the trigger «${trigger}» — the model would not know when to invoke the skill`);
}
for (const label of SELF_CHECK_LABELS.filter((phrase) => !promptBody.includes(phrase))) {
  failures.push(`prompt: the self-check label «${label}» is missing from the body — the line would be printed unchecked on that point`);
}

// (q5) setup's «what's next» names every entry of the bundle
const SETUP_UNNAMED = ['setup', 'design-server'];
const setupFinale = sectionOf(skillText('setup'), /^### Step 5\b/m) ?? '';

for (const name of skillDirectories.filter((skill) => !SETUP_UNNAMED.includes(skill))) {
  if (!commandPattern(name).test(setupFinale)) {
    failures.push(`setup: Step 5 «what's next» does not name /mneme:${name} — a new user would never learn that entry`);
  }
}

// (r) SPEC-LINE-SHAPES: both spec authors carry the parser's line forms and check the draft in their review step
const SPEC_LINE_SHAPES_DEFINITION = /^\*\*SPEC-LINE-SHAPES\b/m;
const SPEC_LINE_SHAPES_MARKERS = ['**Done when (EXECUTABLE):**', '**Done when (AGENT-JUDGED):**', '- [ ] '];
const SPEC_REVIEW_STEP_HEADINGS = { plan: /^### Step 6\b/m, fix: /^### Step 5\b/m };

for (const [name, reviewStepHeading] of Object.entries(SPEC_REVIEW_STEP_HEADINGS)) {
  const text = skillText(name);
  if (!SPEC_LINE_SHAPES_DEFINITION.test(text)) {
    failures.push(`${name}: no **SPEC-LINE-SHAPES definition at a line start — drafts would meet the parser's line forms only in the repair after approval`);
    continue;
  }
  for (const marker of SPEC_LINE_SHAPES_MARKERS.filter((literal) => !text.includes(literal))) {
    failures.push(`${name}: SPEC-LINE-SHAPES lost the marker «${marker.trim()}» — restore the forms list (plan owns it, fix replicates it)`);
  }
  if (!(sectionOf(text, reviewStepHeading) ?? '').includes('SPEC-LINE-SHAPES')) {
    failures.push(`${name}: the review step does not check the draft against SPEC-LINE-SHAPES — the rule would stand unused before the menu`);
  }
}

if (failures.length > 0) {
  console.error('Handoff-finale sync check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  'Handoff-finale sync check passed: finale classes declared, handoff menus in place, staging grants curated, contract replicas aligned, no stale markers, MENU-CONTEXT replicas aligned and unweakened, SPEC-REVIEW-MENU replicas aligned with self-endorsement barred, invoked bundle scripts present, allowed-tools grants matching their contracts, the handoff phrase shared by design and plan, resume free of event-log markers, RESOLVE-INDEX replicas aligned and never retried, the map contract anchored where it is consumed, the model-invocable registry pinned to exactly the diary and prompt skills, the diary contract anchored in dev\'s terminal and the diary skill with its skill-candidate rule, and every command the skills name and hand over resolved to the bundle\'s own — real names, route templates shaped like their targets\' arguments, handoff lines byte-identical across finales, prompt\'s triggers and self-check labels, every entry named in setup\'s finale, and the spec line shapes replicated in plan and fix, each checked in its review step.',
);
