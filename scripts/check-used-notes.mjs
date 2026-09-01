#!/usr/bin/env node
//
// Structural test for the used-notes declaration norm (spec-used-notes).
//
// The norm's home is dev/SKILL.md's harvest branch: every harvest submission declares which
// recall-bundle notes actually influenced the phase (`used_notes` riding the same call), each with
// an evidence string naming the place of influence. dev is the ONLY skill that submits harvests,
// so there are no replicas to sync — this file pins the norm's load-bearing phrases in their home
// (the check-session-tokens precedent of guarding the norm's own anchor lines) and WHERE the
// instruction stands. Two checks:
//
//   (a) the four load-bearing phrases are present in dev, whitespace-normalized — the anchors are
//       the natural sentences of the norm, never markers minted for the grep;
//   (b) the declaration instruction stands INSIDE the harvest-branch section: the slice from
//       "### harvest branch" to the next "### " heading must carry `used_notes` and the
//       anti-flattery phrase (the line-anchored slice form of check-session-tokens) — a literal
//       anchor proves PRESENCE, the slice proves PLACE.
//
// Deliberately absent (recorded in spec-used-notes Knowledge): NEGATION guards — the repo's
// existing negations each guard an episode that actually happened, and no weakening of this norm
// has been written yet; a negation without its episode is gate-shaped prose. No self-test either:
// this file reads the real skill directly, with no fixtures and no spawn.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/, so it is not shipped in the
// installed bundle.
//
// Usage: node scripts/check-used-notes.mjs   (also runs as part of npm test)

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const devText = readFileSync(join(repoRoot, 'plugin', 'skills', 'dev', 'SKILL.md'), 'utf8');

const ANTI_FLATTERY = 'a declaration that cannot name a place is not a use';
const USED_NOTES_ANCHORS = [
  ANTI_FLATTERY,
  'Совпадение темы — НЕ использование',
  'пустой список честнее вежливого перечисления',
  'id — только из бандла ЭТОЙ фазы',
];

const normalize = (text) => text.replace(/\s+/g, ' ');

const failures = [];

// (a) the norm's load-bearing phrases survive in their home
const flatDev = normalize(devText);
for (const anchor of USED_NOTES_ANCHORS) {
  if (!flatDev.includes(anchor)) {
    failures.push(`dev: used-notes anchor «${anchor}» missing — the norm lost a load-bearing phrase`);
  }
}

// (b) the declaration instruction stands INSIDE the harvest branch
const lines = devText.split('\n');
const sliceStart = lines.findIndex((line) => line.startsWith('### harvest branch'));
if (sliceStart === -1) {
  failures.push('dev: no "### harvest branch" section — the slice check has nothing to anchor to');
} else {
  let sliceEnd = lines.length;
  for (let i = sliceStart + 1; i < lines.length; i++) {
    if (lines[i].startsWith('### ')) {
      sliceEnd = i;
      break;
    }
  }
  const slice = normalize(lines.slice(sliceStart, sliceEnd).join('\n'));
  if (!slice.includes('used_notes')) {
    failures.push('dev: the harvest-branch slice carries no used_notes — the declaration instruction left its place');
  }
  if (!slice.includes(ANTI_FLATTERY)) {
    failures.push('dev: the harvest-branch slice lost the anti-flattery phrase — the norm left its place');
  }
}

if (failures.length > 0) {
  console.error('Used-notes declaration check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  'Used-notes declaration check passed: the norm keeps its load-bearing phrases and the instruction stands inside the harvest branch.',
);
