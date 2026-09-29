#!/usr/bin/env node
//
// Gate for figura's main path on the real modules: the real entry figura/bin/figura builds the
// reference demo through the dispatcher, preflight, extraction, theme, render, measure, checks,
// inline, print, previews and report; a broken document stops before any PDF with every problem
// named; and the ERD parts figura erd writes from the Prisma fixture build into a PDF as well. Only
// the process boundary is faked: a launcher stub answers for d2 with a recorded SVG, a fake browser
// answers the CDP pipe with recorded boxes and a two-page PDF, and a pdftoppm stub writes the
// previews. That the modules reach the real d2, Chromium and pdftoppm is what the smoke stages and
// scripts/figura-e2e.mjs prove; this gate proves the modules are wired to one another.

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(REPO_ROOT, 'scripts', 'fixtures', 'figura');
const FAKE_BROWSER = join(FIXTURES, 'fake-browser.mjs');
const PRISMA_SCHEMA = join(FIXTURES, 'schemas', 'schema.prisma');
const DEMO_TITLE = 'Staff identity platform';
const FAKE_PDF_PAGES = ['page-01.png', 'page-02.png'];
const FAKE_DIAGRAM_MARKER = 'class="d2-fake d2-svg"';
const DIAGRAM_BLOCK = /<pre class="d2"( data-layout="dagre")?>/g;
const failures = [];
const workDirectory = mkdtempSync(join(tmpdir(), 'figura-wire-check-'));
const launcherLog = join(workDirectory, 'launcher.log');
const printedPage = join(workDirectory, 'printed.html');

function recorded(name) {
  return JSON.parse(readFileSync(join(FIXTURES, 'measurements', `${name}.json`), 'utf8'));
}

function measurementsOf(names) {
  return Object.fromEntries(names.map((name, index) => [`diagram-${String(index + 1).padStart(2, '0')}.svg`, recorded(name)]));
}

function escapedHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
}

function documentOfDiagrams(title, sources) {
  const figures = sources.map(
    (source, index) =>
      `    <figure>\n      <pre class="d2">\n${escapedHtml(source)}</pre>\n      <figcaption class="caption"><strong>Figure ${index + 1}.</strong> A diagram of the wiring check.</figcaption>\n    </figure>`,
  );
  return `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <title>${title}</title>\n  </head>\n  <body>\n    <h1>${title}</h1>\n${figures.join('\n')}\n  </body>\n</html>\n`;
}

function prepareToolchain() {
  const bundle = join(workDirectory, 'figura');
  cpSync(join(REPO_ROOT, 'figura'), bundle, { recursive: true });
  copyFileSync(join(FIXTURES, 'fake-launcher.sh'), join(bundle, 'bin', 'launch.sh'));
  chmodSync(join(bundle, 'bin', 'launch.sh'), 0o755);
  const stubBin = join(workDirectory, 'stub-bin');
  mkdirSync(stubBin);
  copyFileSync(join(FIXTURES, 'fake-pdftoppm.sh'), join(stubBin, 'pdftoppm'));
  chmodSync(join(stubBin, 'pdftoppm'), 0o755);
  const home = join(workDirectory, 'home');
  mkdirSync(home);
  return { entry: join(bundle, 'bin', 'figura'), stubBin, home };
}

function runFigura(toolchain, projectDirectory, commandArguments, measurements) {
  rmSync(launcherLog, { force: true });
  rmSync(printedPage, { force: true });
  const measurementsPath = join(projectDirectory, 'measurements.json');
  writeFileSync(measurementsPath, JSON.stringify(measurements));
  return spawnSync('/bin/sh', [toolchain.entry, ...commandArguments], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      PATH: `${toolchain.stubBin}${delimiter}${process.env.PATH}`,
      HOME: toolchain.home,
      FIGURA_CHROME: FAKE_BROWSER,
      FIGURA_FAKE_MEASUREMENTS: measurementsPath,
      FIGURA_FAKE_LAUNCHER_LOG: launcherLog,
      FIGURA_FAKE_PRINTED_PAGE: printedPage,
    },
    encoding: 'utf8',
  });
}

function projectDirectory(name) {
  const directory = join(workDirectory, name);
  mkdirSync(directory);
  return directory;
}

function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function expectBuilt(what, run, projectPath, name, diagramCount) {
  const previews = FAKE_PDF_PAGES.map((page) => `.figura/${name}/${page}`);
  const expectedLine = `figura: built ${name}.pdf — ${FAKE_PDF_PAGES.length} pages, ${diagramCount} ${diagramCount === 1 ? 'diagram' : 'diagrams'}, 0 warnings; previews: ${previews.join(', ')}\n`;
  if (run.status !== 0 || run.stdout !== expectedLine) {
    failures.push(`${what} exited ${run.status} with ${JSON.stringify(run.stdout)}, expected ${JSON.stringify(expectedLine)}: ${run.stderr.trim()}`);
  }
  if (!existsSync(join(projectPath, `${name}.pdf`))) failures.push(`${what} left no ${name}.pdf next to its source`);
  for (const preview of previews) if (!existsSync(join(projectPath, preview))) failures.push(`${what} left no ${preview}`);
  const printed = readIfPresent(printedPage);
  const inlined = printed.split(FAKE_DIAGRAM_MARKER).length - 1;
  if (inlined !== diagramCount) failures.push(`${what} printed ${inlined} inline diagrams, expected ${diagramCount}`);
  if (printed.includes('<pre class="d2"')) failures.push(`${what} printed a pre.d2 that the build should have replaced with its SVG`);
  return printed;
}

function checkDemo(toolchain) {
  const project = projectDirectory('demo');
  copyFileSync(join(REPO_ROOT, 'figura', 'reference', 'demo.html'), join(project, 'demo.html'));
  const blocks = [...readFileSync(join(project, 'demo.html'), 'utf8').matchAll(DIAGRAM_BLOCK)];
  const dagreCount = blocks.filter(([, dagre]) => dagre !== undefined).length;
  const run = runFigura(toolchain, project, ['build', 'demo.html'], measurementsOf(blocks.map(() => 'clean')));
  const printed = expectBuilt('the build of the reference demo', run, project, 'demo', blocks.length);
  for (const [expected, what] of [
    ['<link rel="stylesheet" href="/figura/template/print.css" />', 'the print stylesheet'],
    ['--figura-page-width:', 'the theme custom properties'],
    [`@page { @bottom-left { content: "${DEMO_TITLE}"; } }`, 'the footer title'],
    ['<div class="heading-keep-group">', 'the heading keep groups'],
  ]) {
    if (!printed.includes(expected)) failures.push(`the printed demo lacks ${what} (${JSON.stringify(expected)})`);
  }
  const renders = readIfPresent(launcherLog).split('\n').filter((line) => line !== '');
  const dagreRenders = renders.filter((line) => line.includes('--layout dagre')).length;
  if (renders.length !== blocks.length || dagreRenders !== dagreCount) {
    failures.push(`the demo reached d2 ${renders.length} times with ${dagreRenders} dagre layouts, expected ${blocks.length} with ${dagreCount}`);
  }
  if (!renders.every((line) => line.includes('--font-regular') && line.includes('--pad'))) failures.push('a demo diagram reached d2 without the theme fonts and padding');
}

function checkBrokenDocument(toolchain) {
  const project = projectDirectory('broken');
  const tooWide = readFileSync(join(FIXTURES, 'diagrams', 'too-wide.d2'), 'utf8');
  writeFileSync(join(project, 'broken.html'), documentOfDiagrams('Broken document', ['a -> b\nBROKEN\n', tooWide]));
  const run = runFigura(toolchain, project, ['build', 'broken.html'], { 'diagram-02.svg': recorded('too-wide') });
  if (run.status !== 1 || !run.stderr.includes('broken.html FAILED:')) failures.push(`the build of a broken document exited ${run.status}: ${run.stderr.trim()}`);
  for (const expected of ['  - D2-FAILED: diagram 1', '  - DIAGRAM-TOO-WIDE: diagram 2']) {
    if (!run.stderr.includes(expected)) failures.push(`the build of a broken document did not report ${JSON.stringify(expected)}: ${run.stderr.trim()}`);
  }
  if (existsSync(join(project, 'broken.pdf'))) failures.push('the broken document got a PDF');
  if (existsSync(join(project, '.figura', 'broken'))) failures.push('the broken document got previews');
  if (existsSync(printedPage)) failures.push('the broken document reached the printer');
}

function checkErdIntoDocument(toolchain) {
  const project = projectDirectory('erd');
  const erd = runFigura(toolchain, project, ['erd', '--source', 'prisma', PRISMA_SCHEMA, '--out', 'parts'], {});
  if (erd.status !== 0 || !erd.stdout.startsWith('figura: wrote ')) {
    failures.push(`figura erd --source prisma exited ${erd.status}: ${`${erd.stdout}${erd.stderr}`.trim()}`);
    return;
  }
  const parts = readdirSync(join(project, 'parts'))
    .filter((fileName) => /^erd-\d+\.d2$/.test(fileName))
    .sort()
    .map((fileName) => readFileSync(join(project, 'parts', fileName), 'utf8'));
  if (parts.length === 0 || !parts.every((part) => part.includes('shape: sql_table') && part.includes('class: table'))) {
    failures.push(`figura erd wrote ${parts.length} parts, not all of them sql_table diagrams in the theme's table class`);
  }
  writeFileSync(join(project, 'erd.html'), documentOfDiagrams('Storefront schema', parts));
  const build = runFigura(toolchain, project, ['build', 'erd.html'], measurementsOf(parts.map(() => 'clean')));
  expectBuilt('the build of the ERD parts', build, project, 'erd', parts.length);
}

try {
  const toolchain = prepareToolchain();
  checkDemo(toolchain);
  checkBrokenDocument(toolchain);
  checkErdIntoDocument(toolchain);
} catch (error) {
  failures.push(`the main path threw: ${error.stack ?? error.message}`);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('figura wire check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'figura wire check passed: the real entry built the reference demo through every module, with every diagram rendered in its layout, inlined and printed with the theme and footer, a broken document stopped before the printer with each problem named, and the ERD parts of the Prisma fixture built into a PDF.',
);
