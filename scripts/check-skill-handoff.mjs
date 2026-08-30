#!/usr/bin/env node
//
// Structural sync test for the HANDOFF-DECISION norm (spec-handoff-decision).
//
// The norm lives in dev/SKILL.md's OUTPUT-GRAMMAR; its form-critical pieces are REPLICATED into
// the sibling skills because only one skill's text is loaded at runtime. Replication is exactly
// how the original defect shipped (finales drifting from the norm), so drift must be a FAILING
// TEST, not the next live episode. Five checks:
//
//   (a) every non-dev skill declares its expected FINALE-CLASS token — and never both;
//   (b) handoff finales (plan, fix, migrate) reference HANDOFF-DECISION and carry a closing
//       DECISION chip template;
//   (c) any skill granting staging tools in frontmatter shows the queue and decides by digit —
//       a grant without a curation surface turns the curator back into an operator;
//   (d) the curation-contract anchor lines (batch menu labels, the never-tell-the-user rule)
//       are present in all three replicas (dev, plan, fix) — the diverged-replica detector;
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
//       counter-example, i.e. in a paragraph that also says VIOLATION.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/ (same rule as the other check-*).
//
// Usage: node scripts/check-skill-handoff.mjs   (also runs as part of npm test)

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillText = (name) => readFileSync(join(repoRoot, 'plugin', 'skills', name, 'SKILL.md'), 'utf8');

const HANDOFF = 'FINALE-CLASS-HANDOFF';
const INFORMATIONAL = 'FINALE-CLASS-INFORMATIONAL';
const EXPECTED_FINALE_CLASS = {
  plan: HANDOFF,
  fix: HANDOFF,
  migrate: HANDOFF,
  design: HANDOFF,
  'grill-agent': HANDOFF,
  arch: INFORMATIONAL,
  resume: INFORMATIONAL,
  setup: INFORMATIONAL,
  grill: INFORMATIONAL,
};
const CONTRACT_REPLICAS = ['dev', 'plan', 'fix'];
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
  const frontmatterEnd = text.indexOf('---', 3);
  const frontmatter = text.slice(0, frontmatterEnd === -1 ? 0 : frontmatterEnd);
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
  const text = skillText(name);
  const frontmatterEnd = text.indexOf('---', 3);
  const frontmatter = text.slice(0, frontmatterEnd === -1 ? 0 : frontmatterEnd);
  if (frontmatter.includes('staging_resolve')) menuReplicas.add(name);
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

if (failures.length > 0) {
  console.error('Handoff-finale sync check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  'Handoff-finale sync check passed: finale classes declared, handoff menus in place, staging grants curated, contract replicas aligned, no stale markers, MENU-CONTEXT replicas aligned and unweakened, SPEC-REVIEW-MENU replicas aligned with self-endorsement barred.',
);
