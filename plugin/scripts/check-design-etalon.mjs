#!/usr/bin/env node
//
// Machine layer of the /mneme:design fixation postconditions (the skill's checklist is layer 1;
// this checker is layer 2 — the two layers verify the SAME list, and catch different failures:
// the checklist catches what needs judgement, the checker catches silent drift).
//
// Usage: node check-design-etalon.mjs <path/to/design/pages/SLUG/SLUG.html>
//
// A page is a FOLDER: design/pages/<slug>/<slug>.html plus that page's drafts; the pages index
// design/pages/index.html links every page and is maintained by the skill at fixation — this
// checker GUARDS that duty read-only, it never writes.
//
// Postconditions:
//   (1) NO-TOKENS-LINK      — the etalon must LINK the shared layer (../../system/tokens.css,
//                             the folder-per-page depth — the only accepted one), never copy it in;
//   (2) NO-MANIFEST-*       — the etalon must DECLARE its fixtures and states machine-readably
//                             (<meta name="design-fixtures|design-states" content="a,b,c">);
//       MISSING-FIXTURE/-STATE — every declared name must be present as data-fixture= / data-state=;
//   (3) RAW-HEX / RAW-PX    — no values bypassing tokens.css: raw hex colors anywhere in style
//                             context, and px literals in CSS declarations that carry no var(--…).
//                             This is a HEURISTIC and false-negative by design (a bypass that
//                             mimics a token slips through); it never false-positives on tokens.
//   (4) RESERVED-SLUG       — the page folder must not be named "index" (taken by the pages index);
//       NO-INDEX-LINK       — ../index.html must exist and link this page (<slug>/<slug>.html) —
//                             fixation is obliged to update the pages index.
//
// Every failure is a NAMED line on stderr + non-zero exit; the run never half-passes.

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { collectStyleContexts, scanRawValues } from './design-rules.mjs';

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

// (1) the shared layer is linked at the folder-per-page depth, not copied
const linksTokens = /<link[^>]+href="\.\.\/\.\.\/system\/tokens\.css"/.test(html);
if (!linksTokens) {
  failures.push('NO-TOKENS-LINK: the etalon must link the shared layer (<link … href="../../system/tokens.css"> — the folder-per-page depth) — copying the layer in, or the old flat ../system depth, is a violation');
}

// (4) folder-per-page: a reserved slug is rejected, and the pages index must link this page
const slug = basename(dirname(etalonPath));
if (slug === 'index') {
  failures.push('RESERVED-SLUG: a page folder must not be named "index" — that slug is taken by the pages index (design/pages/index.html)');
} else {
  const indexPath = join(dirname(dirname(etalonPath)), 'index.html');
  if (!existsSync(indexPath)) {
    failures.push(`NO-INDEX-LINK: ${indexPath} does not exist — fixation is obliged to create/update the pages index with a link to ${slug}/${basename(etalonPath)}`);
  } else if (!readFileSync(indexPath, 'utf8').includes(`${slug}/${basename(etalonPath)}`)) {
    failures.push(`NO-INDEX-LINK: the pages index carries no link to ${slug}/${basename(etalonPath)} — fixation is obliged to update the index`);
  }
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

// (3) values bypassing tokens.css inside style contexts — the shared heuristic from
// design-rules.mjs (single source for the checker AND design-lint; declaration-granular).
for (const finding of scanRawValues(collectStyleContexts(html))) {
  if (finding.name === 'RAW-HEX') {
    failures.push(`RAW-HEX: raw hex color in style context («${finding.declaration}») — colors come from tokens.css via var(--…)`);
  } else {
    failures.push(`RAW-PX: raw px literal without var(--…) in the declaration («${finding.declaration}») — sizes come from tokens.css`);
  }
}

if (failures.length > 0) {
  console.error(`check-design-etalon: ${etalonPath} FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`check-design-etalon: ${etalonPath} passed — shared layer linked, manifest matches, no raw values, pages index links the page.`);
