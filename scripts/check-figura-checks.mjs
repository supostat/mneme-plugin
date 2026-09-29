#!/usr/bin/env node
//
// Gate for figura's check loop: the layout checks on measurements recorded from the real d2 and
// Chromium, where a clean diagram passes and each broken one fails with its own code, and
// `figura check` on fixture documents through the real render and check modules, with a fake
// browser and a launcher stub at the process boundary.

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutLimits, layoutProblems } from '../figura/scripts/layout-checks.mjs';
import { loadTheme } from '../figura/scripts/theme.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIGURA_ROOT = join(REPO_ROOT, 'figura');
const FIXTURES = join(REPO_ROOT, 'scripts', 'fixtures', 'figura');
const FAKE_BROWSER = join(FIXTURES, 'fake-browser.mjs');
const FAKE_LAUNCHER = join(FIXTURES, 'fake-launcher.sh');
const RECORDED_CODES = new Map([
  ['clean', []],
  ['label-overlap', ['LABEL-OVERLAP', 'TEXT-OVERFLOW']],
  ['text-overflow', ['TEXT-OVERFLOW']],
  ['too-wide', ['DIAGRAM-TOO-WIDE']],
  ['too-tall', ['DIAGRAM-TOO-TALL']],
]);
const failures = [];
const workDirectory = mkdtempSync(join(tmpdir(), 'figura-checks-check-'));

function recorded(name) {
  return JSON.parse(readFileSync(join(FIXTURES, 'measurements', `${name}.json`), 'utf8'));
}

function diagramSource(name) {
  return readFileSync(join(FIXTURES, 'diagrams', `${name}.d2`), 'utf8');
}

function codesOf(problems) {
  return [...new Set(problems.map((problem) => problem.code))].sort();
}

function expectCodes(caseName, problems, expectedCodes) {
  if (JSON.stringify(codesOf(problems)) !== JSON.stringify(expectedCodes)) {
    failures.push(`${caseName}: reported ${JSON.stringify(codesOf(problems))}, expected ${JSON.stringify(expectedCodes)}`);
  }
}

function expectProblemText(caseName, problems, code, expectedText) {
  if (!problems.some((problem) => problem.code === code && problem.message.includes(expectedText))) {
    failures.push(`${caseName}: no ${code} naming "${expectedText}" among ${JSON.stringify(problems.map((problem) => problem.message))}`);
  }
}

function labelledMeasurement(widthPixels, heightPixels) {
  return {
    widthPixels,
    heightPixels,
    objects: [{ id: 'node', kind: 'shape', box: { x: 0, y: 0, width: 80, height: 40 }, labels: [{ text: 'Node', box: { x: 20, y: 10, width: 40, height: 20 }, fontPixels: 16 }] }],
  };
}

function checkRecordedCases(limits) {
  for (const [name, expectedCodes] of RECORDED_CODES) {
    expectCodes(`recorded ${name}`, layoutProblems({ ordinal: 1, caption: name }, recorded(name), limits), expectedCodes);
  }
  const subjectOf = (name) => ({ ordinal: 2, caption: name });
  expectProblemText('recorded too-wide', layoutProblems(subjectOf('too-wide'), recorded('too-wide'), limits), 'DIAGRAM-TOO-WIDE', 'under the 7 pt floor — change direction');
  expectProblemText('recorded too-tall', layoutProblems(subjectOf('too-tall'), recorded('too-tall'), limits), 'DIAGRAM-TOO-TALL', 'a page leaves above its caption — change direction');
  expectProblemText(
    'recorded label-overlap',
    layoutProblems(subjectOf('label-overlap'), recorded('label-overlap'), limits),
    'LABEL-OVERLAP',
    'diagram 2 («label-overlap»): label "A label much wider than its fixed cell" of cell crosses the shape next',
  );
  expectProblemText(
    'recorded text-overflow',
    layoutProblems(subjectOf('text-overflow'), recorded('text-overflow'), limits),
    'TEXT-OVERFLOW',
    'label "Label pinned inside a small box" spills out of pinned',
  );
}

function checkSyntheticRules(limits) {
  const nested = {
    widthPixels: 300,
    heightPixels: 200,
    objects: [
      { id: 'realm', kind: 'shape', box: { x: 10, y: 30, width: 280, height: 160 }, labels: [{ text: 'Realm', box: { x: 120, y: 5, width: 60, height: 20 }, fontPixels: 16 }] },
      { id: 'realm.core', kind: 'shape', box: { x: 40, y: 60, width: 120, height: 60 }, labels: [{ text: 'Core', box: { x: 80, y: 80, width: 40, height: 20 }, fontPixels: 16 }] },
      { id: 'realm.(core -> api)[0]', kind: 'connection', box: null, labels: [{ text: 'calls', box: { x: 170, y: 85, width: 30, height: 14 }, fontPixels: 16 }] },
    ],
  };
  expectCodes('labels inside an ancestor container and a container label above its box', layoutProblems({ ordinal: 1 }, nested, limits), []);
  expectCodes('a 1000 px wide diagram keeps its labels at 7.9 pt', layoutProblems({ ordinal: 1 }, labelledMeasurement(1000, 100), limits), []);
  expectCodes('a 1320 px wide diagram drops its labels to 6 pt', layoutProblems({ ordinal: 1 }, labelledMeasurement(1320, 100), limits), ['DIAGRAM-TOO-WIDE']);
  expectCodes('a 946 px tall diagram fits above its caption', layoutProblems({ ordinal: 1 }, labelledMeasurement(600, 946), limits), []);
  expectCodes('a 947 px tall diagram does not', layoutProblems({ ordinal: 1 }, labelledMeasurement(600, 947), limits), ['DIAGRAM-TOO-TALL']);
}

function prepareBundleWithLauncherStub() {
  const bundle = join(workDirectory, 'figura');
  cpSync(FIGURA_ROOT, bundle, { recursive: true });
  copyFileSync(FAKE_LAUNCHER, join(bundle, 'bin', 'launch.sh'));
  chmodSync(join(bundle, 'bin', 'launch.sh'), 0o755);
  return bundle;
}

function writeDocument(name, diagramSources) {
  const figures = diagramSources
    .map(
      (source, index) =>
        `    <figure>\n      <pre class="d2">\n${source}</pre>\n      <figcaption class="caption"><strong>Figure ${index + 1}.</strong> A fixture diagram.</figcaption>\n    </figure>`,
    )
    .join('\n');
  const documentPath = join(workDirectory, `${name}.html`);
  writeFileSync(
    documentPath,
    `<!doctype html>\n<html lang="en">\n  <head><meta charset="utf-8" /><title>Check fixture</title></head>\n  <body>\n    <h1>Check fixture</h1>\n${figures}\n  </body>\n</html>\n`,
  );
  return documentPath;
}

function runCheck(bundle, documentPath, recordedByFile) {
  const measurementsPath = join(workDirectory, `${Object.keys(recordedByFile).length}-measurements-${Date.now()}.json`);
  writeFileSync(measurementsPath, JSON.stringify(recordedByFile));
  const home = join(workDirectory, 'home');
  mkdirSync(home, { recursive: true });
  const commandArguments = documentPath === undefined ? ['check'] : ['check', documentPath];
  return spawnSync('/bin/sh', [join(bundle, 'bin', 'figura'), ...commandArguments], {
    env: { ...process.env, HOME: home, FIGURA_CHROME: FAKE_BROWSER, FIGURA_FAKE_MEASUREMENTS: measurementsPath },
    encoding: 'utf8',
  });
}

function checkCommandLine() {
  const bundle = prepareBundleWithLauncherStub();

  const failingDocument = writeDocument('clean-and-too-wide', [diagramSource('clean'), diagramSource('too-wide')]);
  const failing = runCheck(bundle, failingDocument, { 'diagram-01.svg': recorded('clean'), 'diagram-02.svg': recorded('too-wide') });
  if (failing.status !== 1) failures.push(`check of a too wide diagram exited ${failing.status}, expected 1: ${failing.stderr.trim()}`);
  if (!failing.stderr.includes(`figura: ${failingDocument} FAILED:`)) failures.push(`check did not open its report with the failure line: ${failing.stderr.trim()}`);
  if (!failing.stderr.includes('  - DIAGRAM-TOO-WIDE: diagram 2 («Figure 2. A fixture diagram.»)')) {
    failures.push(`check did not report diagram 2 as DIAGRAM-TOO-WIDE: ${failing.stderr.trim()}`);
  }
  if (failing.stderr.includes('diagram 1 (')) failures.push(`check blamed the clean diagram 1: ${failing.stderr.trim()}`);

  const brokenDocument = writeDocument('clean-and-broken', [diagramSource('clean'), 'a -> b\nBROKEN\n']);
  const broken = runCheck(bundle, brokenDocument, { 'diagram-01.svg': recorded('clean') });
  if (broken.status !== 1 || !broken.stderr.includes('  - D2-FAILED: diagram 2 («Figure 2. A fixture diagram.»): line 2, column 1')) {
    failures.push(`check did not collect the d2 error of diagram 2 into its report (exit ${broken.status}): ${broken.stderr.trim()}`);
  }

  const cleanDocument = writeDocument('clean', [diagramSource('clean')]);
  const clean = runCheck(bundle, cleanDocument, { 'diagram-01.svg': recorded('clean') });
  const expectedSuccess = `figura: ${cleanDocument} passed the check — 1 diagram fits the column and the page\n`;
  if (clean.status !== 0 || clean.stdout !== expectedSuccess) {
    failures.push(`check of a clean document exited ${clean.status} with ${JSON.stringify(clean.stdout)}, expected the single success line: ${clean.stderr.trim()}`);
  }

  const usage = runCheck(bundle, undefined, {});
  if (usage.status !== 2 || !usage.stderr.startsWith('usage: figura <command>')) {
    failures.push(`check without a document exited ${usage.status} with ${JSON.stringify(usage.stderr)}, expected usage and 2`);
  }
}

try {
  const limits = layoutLimits(loadTheme());
  checkRecordedCases(limits);
  checkSyntheticRules(limits);
  checkCommandLine();
} catch (error) {
  failures.push(`the check loop threw: ${error.stack ?? error.message}`);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('figura checks check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'figura checks check passed: the recorded clean diagram passes, the overlap, overflow, too wide and too tall ones fail with their own codes, the scale and height limits hold at their edges, and figura check reports through the real modules with a fake browser and a launcher stub.',
);
