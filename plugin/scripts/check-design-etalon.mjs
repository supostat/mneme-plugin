#!/usr/bin/env node
//
// Machine layer of the /mneme:design fixation postconditions (the skill's checklist is layer 1;
// this checker is layer 2 — the two layers verify the SAME list, and catch different failures:
// the checklist catches what needs judgement, the checker catches silent drift).
//
// Usage: node check-design-etalon.mjs <path/to/design/pages/etalon.html>
//
// Postconditions:
//   (1) NO-TOKENS-LINK      — the etalon must LINK the shared layer (../system/tokens.css),
//                             never copy it in;
//   (2) NO-MANIFEST-*       — the etalon must DECLARE its fixtures and states machine-readably
//                             (<meta name="design-fixtures|design-states" content="a,b,c">);
//       MISSING-FIXTURE/-STATE — every declared name must be present as data-fixture= / data-state=;
//   (3) RAW-HEX / RAW-PX    — no values bypassing tokens.css: raw hex colors anywhere in style
//                             context, and px literals on CSS lines that carry no var(--…).
//                             This is a HEURISTIC and false-negative by design (a bypass that
//                             mimics a token slips through); it never false-positives on tokens.
//
// Every failure is a NAMED line on stderr + non-zero exit; the run never half-passes.

import { readFileSync } from 'node:fs';

const etalonPath = process.argv[2];
if (etalonPath === undefined) {
  console.error('check-design-etalon: usage: node check-design-etalon.mjs <path/to/etalon.html>');
  process.exit(2);
}

let html;
try {
  html = readFileSync(etalonPath, 'utf8');
} catch (error) {
  console.error(`check-design-etalon: cannot read ${etalonPath}: ${error.message}`);
  process.exit(2);
}

const failures = [];

// (1) the shared layer is linked, not copied
const linksTokens = /<link[^>]+href="[^"]*\.\.\/system\/tokens\.css"/.test(html);
if (!linksTokens) {
  failures.push('NO-TOKENS-LINK: the etalon must link the shared layer (<link … href="../system/tokens.css">) — copying the layer into the page is a violation');
}

// (2) manifest: declared fixtures and states each exist in the document
const readManifest = (name) => {
  const match = html.match(new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]*)"`));
  if (match === null) return null;
  return match[1].split(',').map((item) => item.trim()).filter((item) => item.length > 0);
};

const fixtures = readManifest('design-fixtures');
if (fixtures === null) {
  failures.push('NO-MANIFEST-FIXTURES: the etalon must declare its fixtures (<meta name="design-fixtures" content="typical,minimal,extreme">) — the manifest is the checker\'s contract');
} else {
  for (const fixture of fixtures) {
    if (!html.includes(`data-fixture="${fixture}"`)) {
      failures.push(`MISSING-FIXTURE: fixture "${fixture}" is declared in the manifest but no data-fixture="${fixture}" block exists — declared and present must match`);
    }
  }
}

const states = readManifest('design-states');
if (states === null) {
  failures.push('NO-MANIFEST-STATES: the etalon must declare its states (<meta name="design-states" content="default,empty,loading,error">) — the manifest is the checker\'s contract');
} else {
  for (const state of states) {
    if (!html.includes(`data-state="${state}"`)) {
      failures.push(`MISSING-STATE: state "${state}" is declared in the manifest but no data-state="${state}" block exists — declared and present must match`);
    }
  }
}

// (3) values bypassing tokens.css inside style context: <style> blocks + style="…" attributes
const styleContexts = [];
for (const match of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styleContexts.push(match[1]);
for (const match of html.matchAll(/style="([^"]*)"/g)) styleContexts.push(match[1]);

for (const context of styleContexts) {
  // Split into DECLARATIONS, not lines: `padding: 16px; color: var(--x)` on one line must still
  // flag the px — a neighboring token on the same line must not mask a raw value.
  for (const declaration of context.split(/[;{}\n]/)) {
    if (/#[0-9a-fA-F]{3,8}\b/.test(declaration)) {
      failures.push(`RAW-HEX: raw hex color in style context («${declaration.trim().slice(0, 60)}») — colors come from tokens.css via var(--…)`);
    }
    if (/\b\d+px\b/.test(declaration) && !declaration.includes('var(--')) {
      failures.push(`RAW-PX: raw px literal without var(--…) in the declaration («${declaration.trim().slice(0, 60)}») — sizes come from tokens.css`);
    }
  }
}

if (failures.length > 0) {
  console.error(`check-design-etalon: ${etalonPath} FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`check-design-etalon: ${etalonPath} passed — shared layer linked, manifest matches, no raw values.`);
