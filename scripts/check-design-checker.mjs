#!/usr/bin/env node
//
// Two-sided test of the shipped etalon checker (plugin/scripts/check-design-etalon.mjs).
//
// The positive side alone would accept a checker that passes everything, so every negative case
// is exercised explicitly (the check-skill-names lesson), and each dirty case must fail WITH the
// named error that tells the author what to repair — a bare non-zero exit is a useless verdict
// the next author will "fix" backwards.
//
// Fixtures are built in an OS temp directory (never inside plugin/), a full mini design/ tree in
// the folder-per-page convention: system/tokens.css + pages/index.html + pages/<slug>/<slug>.html,
// the checker spawned per case via spawnSync.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/ — the checker itself is a PRODUCT
// artifact and ships; this test does not.
//
// Usage: node scripts/check-design-checker.mjs   (also runs as part of npm test)

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const checker = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'scripts', 'check-design-etalon.mjs');

const failures = [];

const goodEtalon = `<!doctype html>
<html>
<head>
  <meta name="design-fixtures" content="typical,minimal,extreme">
  <meta name="design-states" content="default,empty,loading,error">
  <link rel="stylesheet" href="../../system/tokens.css">
  <style>
    .card { padding: var(--space-2); color: var(--color-text); }
  </style>
</head>
<body>
  <section data-fixture="typical" data-state="default"></section>
  <section data-fixture="minimal" data-state="empty"></section>
  <section data-fixture="extreme" data-state="loading"></section>
  <section data-state="error"></section>
</body>
</html>
`;

// slug: the page folder name; mutate: transforms the etalon; expectFailure: named error or null;
// options.indexHtml: pages/index.html content (null = no index file at all).
function runCase(name, slug, mutate, expectFailure, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'design-checker-'));
  try {
    mkdirSync(join(root, 'design', 'system'), { recursive: true });
    mkdirSync(join(root, 'design', 'pages', slug), { recursive: true });
    writeFileSync(join(root, 'design', 'system', 'tokens.css'), ':root { --space-2: 8px; --color-text: black; }\n');
    const indexHtml = options.indexHtml === undefined
      ? `<!doctype html><html><body><a href="${slug}/${slug}.html">${slug}</a></body></html>\n`
      : options.indexHtml;
    if (indexHtml !== null) {
      writeFileSync(join(root, 'design', 'pages', 'index.html'), indexHtml);
    }
    const etalonPath = join(root, 'design', 'pages', slug, `${slug}.html`);
    writeFileSync(etalonPath, mutate(goodEtalon));
    const result = spawnSync(process.execPath, [checker, etalonPath], { encoding: 'utf8' });
    if (expectFailure === null) {
      if (result.status !== 0) {
        failures.push(`${name}: a valid etalon must pass, got exit ${result.status}: ${result.stderr}`);
      }
    } else {
      if (result.status === 0) {
        failures.push(`${name}: a broken etalon passed — the ${expectFailure} case is not caught`);
      } else if (!result.stderr.includes(expectFailure)) {
        failures.push(`${name}: fails, but without the named error ${expectFailure} — a bare rejection teaches nothing (stderr: ${result.stderr.trim()})`);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// positive: a full valid page folder with an indexed link passes
runCase('good', 'good', (html) => html, null);

// negative: the shared layer is not linked at all
runCase('no-link', 'good', (html) => html.replace(/<link[^>]*>\n/, ''), 'NO-TOKENS-LINK');

// negative: the OLD flat depth (../system) is not accepted — only the folder-per-page depth is
runCase('flat-depth-link', 'good', (html) => html.replace('../../system/tokens.css', '../system/tokens.css'), 'NO-TOKENS-LINK');

// negative: a declared fixture has no block
runCase('missing-fixture', 'good', (html) => html.replace(' data-fixture="extreme"', ''), 'MISSING-FIXTURE');

// negative: a declared state has no block
runCase('missing-state', 'good', (html) => html.replace(' data-state="error"', ''), 'MISSING-STATE');

// negative: no fixtures manifest at all
runCase('no-manifest', 'good', (html) => html.replace(/<meta name="design-fixtures"[^>]*>\n/, ''), 'NO-MANIFEST-FIXTURES');

// negative: a raw hex color bypasses tokens.css
runCase('raw-hex', 'good', (html) => html.replace('var(--color-text)', '#ff0000'), 'RAW-HEX');

// negative: a raw px literal with no token in the same declaration
runCase('raw-px', 'good', (html) => html.replace('var(--space-2)', '16px'), 'RAW-PX');

// negative: the pages index exists but carries no link to this page
runCase('index-without-link', 'good', (html) => html, 'NO-INDEX-LINK',
  { indexHtml: '<!doctype html><html><body><a href="other/other.html">other</a></body></html>\n' });

// negative: the pages index is missing entirely
runCase('index-missing', 'good', (html) => html, 'NO-INDEX-LINK', { indexHtml: null });

// negative: the reserved slug "index" is rejected
runCase('reserved-slug', 'index', (html) => html, 'RESERVED-SLUG');

if (failures.length > 0) {
  console.error('Design-checker check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('Design-checker check passed: valid page folder accepted; missing/flat link, manifest gaps, raw values, index gaps and the reserved slug rejected with named errors.');
