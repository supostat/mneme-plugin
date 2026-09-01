#!/usr/bin/env node
//
// Structural sync test for the anchor-hygiene rule (spec-anchor-tags-future-code).
//
// The rule's home is plan/SKILL.md's STAGE-CHOICE: a note about code that does not exist yet
// carries TAGS instead of invented path anchors. dev and grill-agent stage notes of their own, so
// they carry the same sentence as REPLICAS — and only one skill's text is loaded at runtime, which
// is exactly how replicated norms drift (the check-skill-handoff lesson). One check:
//
//   (i) every replica carries the rule's load-bearing phrase, whitespace-normalized.
//
// The anchor is the natural sentence of the rule, never a marker minted for the grep: a named
// marker is legitimate where the name is REFERENCED, not where it is only matched. It is also a
// single SPECIFIC phrase rather than a set — «tags, not invented anchors» opposes two concrete note
// fields and cannot be written by accident, whereas a general phrase alongside it would only add a
// chance of false green (a set is as strict as its most specific member).
//
// Deliberately absent, both recorded in the spec's Knowledge: a NEGATIVE guard (it would police a
// weakening phrasing nobody has written — the existing negations in check-skill-handoff each guard
// an episode that actually happened), and a negative SELF-test (this file reads the real skills
// directly, with no fixtures and no spawn; the repo's two-sided tests test a DIFFERENT checker).
//
// This lives in its own file rather than as a sixth check of check-skill-handoff.mjs: that file's
// subject is declared by its own header (the HANDOFF-DECISION norm and its replicas), and anchor
// hygiene is about memory addressing. A checker grows while a new check falls under ITS declared
// subject, and a new one is born when it does not.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/, so it is not shipped in the installed
// bundle.
//
// Usage: node scripts/check-anchor-rules.mjs   (also runs as part of npm test)

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillText = (name) => readFileSync(join(repoRoot, 'plugin', 'skills', name, 'SKILL.md'), 'utf8');

const ANCHOR_RULE_REPLICAS = ['plan', 'dev', 'grill-agent'];
const ANCHOR_RULE_ANCHORS = ['tags, not invented anchors'];

const normalize = (text) => text.replace(/\s+/g, ' ');

const failures = [];

// (i) the rule's load-bearing phrase survives in every replica
for (const name of ANCHOR_RULE_REPLICAS) {
  const flat = normalize(skillText(name));
  for (const anchor of ANCHOR_RULE_ANCHORS) {
    if (!flat.includes(anchor)) {
      failures.push(`${name}: anchor-rule phrase «${anchor}» missing — replicas diverged`);
    }
  }
}

if (failures.length > 0) {
  console.error('Anchor-rule sync check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  'Anchor-rule sync check passed: every staging skill carries the tags-instead-of-invented-anchors rule.',
);
