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
//       cannot express).
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

if (failures.length > 0) {
  console.error('Handoff-finale sync check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  'Handoff-finale sync check passed: finale classes declared, handoff menus in place, staging grants curated, contract replicas aligned, no stale markers.',
);
