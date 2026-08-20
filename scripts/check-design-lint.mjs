#!/usr/bin/env node
//
// Two-sided test of the shipped design lint (plugin/scripts/design-lint.mjs).
//
// Every guard gets its NEGATIVE (the raw-px lesson: a validator without a failing case once
// shipped a masking bug), each dirty case must fail WITH the named finding and an explanation,
// and the hook mode is exercised through real stdin piping. Parity with the fixation checker
// is exercised on ONE shared fixture — both binaries spawn on the same etalon.
//
// Fixtures live in an OS temp directory; dev tooling stays at the repo root, never in plugin/.
//
// Usage: node scripts/check-design-lint.mjs   (also runs as part of npm test)

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const lint = resolve(scriptsDir, '..', 'plugin', 'scripts', 'design-lint.mjs');
const checker = resolve(scriptsDir, '..', 'plugin', 'scripts', 'check-design-etalon.mjs');

const failures = [];

const TOKENS = `:root {
  --bg: #101210;
  --paper: #e8e6df;
  --accent: rgba(217, 164, 65, 0.9);
  --fs-body: 0.95rem;
  --fs-lead: 2.2rem;
  --space-2: 0.5rem;
}
`;

const FONTS = `@font-face { font-family: "Plex Custom"; src: url(data:font/woff2;base64,AAAA); }
`;

const GOOD_ETALON = `<!doctype html>
<html>
<head>
  <meta name="design-fixtures" content="typical">
  <meta name="design-states" content="default">
  <link rel="stylesheet" href="../../system/tokens.css">
  <style>.card { padding: var(--space-2); color: var(--paper); font-family: "Plex Custom", monospace; }</style>
</head>
<body><section data-fixture="typical" data-state="default">One dash — fine.</section></body>
</html>
`;

// Build a full design/ tree; overrides tweak individual files.
function buildProject(root, overrides = {}) {
  mkdirSync(join(root, 'design', 'system'), { recursive: true });
  mkdirSync(join(root, 'design', 'pages', 'page'), { recursive: true });
  writeFileSync(join(root, 'design', 'system', 'tokens.css'), overrides.tokens ?? TOKENS);
  writeFileSync(join(root, 'design', 'system', 'fonts.css'), FONTS);
  if (overrides.appCss !== null && overrides.appCss !== undefined) {
    writeFileSync(join(root, 'design', 'system', 'app.css'), overrides.appCss);
  }
  if (overrides.intentional !== undefined) {
    writeFileSync(join(root, 'design', 'system', 'lint-intentional.json'), JSON.stringify(overrides.intentional));
  }
  writeFileSync(join(root, 'design', 'pages', 'index.html'), '<a href="page/page.html">page</a>\n');
  writeFileSync(join(root, 'design', 'pages', 'page', 'page.html'), overrides.etalon ?? GOOD_ETALON);
  return root;
}

function runLint(args, options = {}) {
  return spawnSync(process.execPath, [lint, ...args], { encoding: 'utf8', ...options });
}

function expectFinding(name, result, finding) {
  if (result.status === 0) {
    failures.push(`${name}: expected a non-zero exit with ${finding}, got exit 0`);
  } else if (!result.stderr.includes(finding)) {
    failures.push(`${name}: fails, but without the named finding ${finding} (stderr: ${result.stderr.trim().slice(0, 200)})`);
  }
}

function expectClean(name, result) {
  if (result.status !== 0) {
    failures.push(`${name}: expected exit 0, got ${result.status}: ${result.stderr.trim().slice(0, 200)}`);
  }
}

function withProject(overrides, body) {
  const root = mkdtempSync(join(tmpdir(), 'design-lint-'));
  try {
    buildProject(root, overrides);
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- parity: the fixture etalon passes the fixation checker AND carries no lint findings ---
withProject({}, (root) => {
  const etalon = join(root, 'design', 'pages', 'page', 'page.html');
  const checkerRun = spawnSync(process.execPath, [checker, etalon], { encoding: 'utf8' });
  if (checkerRun.status !== 0) {
    failures.push(`parity: the fixture etalon must pass the fixation checker (stderr: ${checkerRun.stderr.trim().slice(0, 200)})`);
  }
  expectClean('parity-lint', runLint([etalon]));
});

// --- app.css: a foreign color is caught, an intentional entry suppresses it ---
withProject({ appCss: '.hero { color: #ff00aa; }\n' }, (root) => {
  expectFinding('foreign-color', runLint([join(root, 'design', 'system', 'app.css')]), 'FOREIGN-COLOR');
});
withProject({ appCss: '.hero { color: #ff00aa; }\n', intentional: [{ value: '#ff00aa', reason: 'brand accent of the legacy hero' }] }, (root) => {
  expectClean('intentional-suppresses', runLint([join(root, 'design', 'system', 'app.css')]));
});

// --- app.css: foreign font-size and foreign family ---
withProject({ appCss: '.hero { font-size: 1.37rem; }\n' }, (root) => {
  expectFinding('foreign-font-size', runLint([join(root, 'design', 'system', 'app.css')]), 'FOREIGN-FONT-SIZE');
});
withProject({ appCss: '.hero { font-family: "Comic Neue", sans-serif; }\n' }, (root) => {
  expectFinding('foreign-family', runLint([join(root, 'design', 'system', 'app.css')]), 'FOREIGN-FONT-FAMILY');
});

// --- pages: raw hex, second family, em-dash overuse ---
withProject({ etalon: GOOD_ETALON.replace('var(--paper)', '#123456') }, (root) => {
  expectFinding('raw-hex', runLint([join(root, 'design', 'pages', 'page', 'page.html')]), 'RAW-HEX');
});
withProject({ etalon: GOOD_ETALON.replace('"Plex Custom", monospace', '"Alien Grotesk"') }, (root) => {
  expectFinding('second-family', runLint([join(root, 'design', 'pages', 'page', 'page.html')]), 'SECOND-FAMILY');
});
withProject({ etalon: GOOD_ETALON.replace('One dash — fine.', 'A — B — C — D.') }, (root) => {
  expectFinding('em-dash', runLint([join(root, 'design', 'pages', 'page', 'page.html')]), 'EM-DASH-OVERUSE');
});

// --- tokens.css: duplicate custom property ---
withProject({ tokens: TOKENS + '\n:root { --bg: #000000; }\n' }, (root) => {
  expectFinding('duplicate-token', runLint([join(root, 'design', 'system', 'tokens.css')]), 'DUPLICATE-TOKEN');
});

// --- drafts are skipped even when dirty ---
withProject({}, (root) => {
  const draft = join(root, 'design', 'pages', 'page', 'page-draft-a.html');
  writeFileSync(draft, '<style>.x { color: #ff0000; }</style>');
  expectClean('draft-skipped', runLint([draft]));
});

// --- --all: stale intentional entry is reported but never fails the run ---
withProject({ intentional: [{ value: '#dead00', reason: 'gone' }] }, (root) => {
  const result = runLint(['--all'], { cwd: root });
  expectClean('stale-all-exit', result);
  if (!result.stderr.includes('STALE-INTENTIONAL')) {
    failures.push(`stale-all: --all must report the stale entry (stderr: ${result.stderr.trim().slice(0, 200)})`);
  }
});

// --- hook mode: PostToolUse outside design/ → exit 0, no output ---
{
  const outside = runLint(['--hook'], { input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_input: { file_path: '/somewhere/src/main.ts' }, cwd: '/somewhere' }) });
  expectClean('hook-outside', outside);
  if (outside.stdout.trim() !== '') failures.push(`hook-outside: expected empty output, got: ${outside.stdout.trim().slice(0, 120)}`);
}

// --- hook mode: Stop in a project without design/ → exit 0, no output ---
{
  const bare = mkdtempSync(join(tmpdir(), 'design-lint-bare-'));
  try {
    const stop = runLint(['--hook'], { input: JSON.stringify({ hook_event_name: 'Stop', cwd: bare }) });
    expectClean('hook-stop-no-design', stop);
    if (stop.stdout.trim() !== '') failures.push(`hook-stop-no-design: expected empty output, got: ${stop.stdout.trim().slice(0, 120)}`);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
}

// --- hook mode: PostToolUse on a dirty design file → exit 0 AND advisory JSON with the finding ---
withProject({ appCss: '.hero { color: #ff00aa; }\n' }, (root) => {
  const hook = runLint(['--hook'], { input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_input: { file_path: join(root, 'design', 'system', 'app.css') }, cwd: root }) });
  expectClean('hook-advisory-exit', hook);
  let payload = null;
  try {
    payload = JSON.parse(hook.stdout);
  } catch {
    failures.push(`hook-advisory: expected hookSpecificOutput JSON, got: ${hook.stdout.trim().slice(0, 120)}`);
  }
  if (payload !== null) {
    const context = payload?.hookSpecificOutput?.additionalContext ?? '';
    if (payload?.hookSpecificOutput?.hookEventName !== 'PostToolUse' || !context.includes('FOREIGN-COLOR')) {
      failures.push(`hook-advisory: payload must carry hookEventName PostToolUse and the FOREIGN-COLOR finding (got: ${hook.stdout.trim().slice(0, 200)})`);
    }
    if (JSON.stringify(payload).includes('"decision"')) {
      failures.push('hook-advisory: advisory output must carry no decision fields — the lint never blocks');
    }
  }
});

// --- hook mode: broken stdin JSON → fail-open exit 0 ---
{
  const broken = runLint(['--hook'], { input: '{not json' });
  expectClean('hook-broken-stdin', broken);
}

if (failures.length > 0) {
  console.error('Design-lint check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('Design-lint check passed: parity with the checker holds, every guard has its negative, hook mode advises without blocking and fails open.');
