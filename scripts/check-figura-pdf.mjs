#!/usr/bin/env node
//
// Gate for figura build on fakes at the process boundary, a fake browser that prints a two-page PDF
// and a pdftoppm stub that writes one PNG per page: a clean document builds with previews in
// .figura/<name>/ behind a .gitignore, a rebuild clears the previews, a broken diagram stops the build
// without a PDF, and a heading before a diagram lands in a keep group.

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keepHeadingsWithNextBlock, printableDocument } from '../figura/scripts/print-pdf.mjs';
import { loadTheme, themeCss } from '../figura/scripts/theme.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIGURA_ROOT = join(REPO_ROOT, 'figura');
const FIXTURES = join(REPO_ROOT, 'scripts', 'fixtures', 'figura');
const FAKE_BROWSER = join(FIXTURES, 'fake-browser.mjs');
const KEEP_GROUP_OPENING = '<div class="heading-keep-group">';
const failures = [];
const workDirectory = mkdtempSync(join(tmpdir(), 'figura-pdf-check-'));

function recorded(name) {
  return JSON.parse(readFileSync(join(FIXTURES, 'measurements', `${name}.json`), 'utf8'));
}

function diagramSource(name) {
  return readFileSync(join(FIXTURES, 'diagrams', `${name}.d2`), 'utf8');
}

function expectIncludes(what, text, expected) {
  if (!text.includes(expected)) failures.push(`${what} lacks ${JSON.stringify(expected)}; got:\n${text}`);
}

function checkKeepGroups() {
  const figure = '<figure><svg viewBox="0 0 10 10"></svg><figcaption class="caption">Caption.</figcaption></figure>';
  expectIncludes(
    'a heading before a diagram',
    keepHeadingsWithNextBlock(`<h2>Architecture</h2>\n${figure}\n<p>after</p>`),
    `${KEEP_GROUP_OPENING}<h2>Architecture</h2>\n${figure}</div>\n<p>after</p>`,
  );
  expectIncludes(
    'consecutive headings before a paragraph',
    keepHeadingsWithNextBlock('<h2>Part</h2><h3>Section</h3>\n<p>text</p>'),
    `${KEEP_GROUP_OPENING}<h2>Part</h2><h3>Section</h3>\n<p>text</p></div>`,
  );
  expectIncludes(
    'a heading before a nested list',
    keepHeadingsWithNextBlock('<h3>Steps</h3><ul><li>one<ul><li>inner</li></ul></li></ul><p>after</p>'),
    `${KEEP_GROUP_OPENING}<h3>Steps</h3><ul><li>one<ul><li>inner</li></ul></li></ul></div><p>after</p>`,
  );
  const trailing = '<p>text</p><h3>Last</h3>';
  if (keepHeadingsWithNextBlock(trailing) !== trailing) failures.push('a trailing heading with no block after it was wrapped');
}

function checkPrintableDocument(theme) {
  const printable = printableDocument(
    '<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Plan &amp; "scope"</title></head><body><h2>A</h2><p>x</p></body></html>',
    theme,
  );
  expectIncludes('the printable document', printable, '<link rel="stylesheet" href="/figura/template/print.css" />');
  expectIncludes('the printable document', printable, themeCss(theme));
  expectIncludes('the printable document', printable, '@page { @bottom-left { content: "Plan & \\"scope\\""; } }');
  expectIncludes('the printable document', printable, `${KEEP_GROUP_OPENING}<h2>A</h2><p>x</p></div>`);
  let error;
  try {
    printableDocument('<html><body><p>no head</p></body></html>', theme);
  } catch (caught) {
    error = caught;
  }
  if (error?.code !== 'DOCUMENT-INVALID') failures.push(`a document without <head> was not refused with DOCUMENT-INVALID: ${error?.message ?? 'no error'}`);
}

function prepareToolchain() {
  const bundle = join(workDirectory, 'figura');
  cpSync(FIGURA_ROOT, bundle, { recursive: true });
  copyFileSync(join(FIXTURES, 'fake-launcher.sh'), join(bundle, 'bin', 'launch.sh'));
  chmodSync(join(bundle, 'bin', 'launch.sh'), 0o755);
  const stubBin = join(workDirectory, 'stub-bin');
  mkdirSync(stubBin);
  copyFileSync(join(FIXTURES, 'fake-pdftoppm.sh'), join(stubBin, 'pdftoppm'));
  chmodSync(join(stubBin, 'pdftoppm'), 0o755);
  return { bundle, stubBin };
}

function writeDocument(projectDirectory, name, diagramName) {
  const documentPath = join(projectDirectory, `${name}.html`);
  writeFileSync(
    documentPath,
    `<!doctype html>\n<html lang="en">\n  <head><meta charset="utf-8" /><title>Build fixture</title></head>\n  <body>\n    <h1>Build fixture</h1>\n    <h2>Architecture</h2>\n    <figure>\n      <pre class="d2">\n${diagramSource(diagramName)}</pre>\n      <figcaption class="caption"><strong>Figure 1.</strong> A fixture diagram.</figcaption>\n    </figure>\n  </body>\n</html>\n`,
  );
  return documentPath;
}

function runBuild({ bundle, stubBin }, documentPath, measurementName) {
  const measurementsPath = join(workDirectory, `measurements-${measurementName}.json`);
  writeFileSync(measurementsPath, JSON.stringify({ 'diagram-01.svg': recorded(measurementName) }));
  const home = join(workDirectory, 'home');
  mkdirSync(home, { recursive: true });
  return spawnSync('/bin/sh', [join(bundle, 'bin', 'figura'), 'build', documentPath], {
    cwd: workDirectory,
    env: {
      ...process.env,
      PATH: `${stubBin}${delimiter}${process.env.PATH}`,
      HOME: home,
      FIGURA_CHROME: FAKE_BROWSER,
      FIGURA_FAKE_MEASUREMENTS: measurementsPath,
    },
    encoding: 'utf8',
  });
}

function checkBuilds() {
  const toolchain = prepareToolchain();
  const project = join(workDirectory, 'project');
  mkdirSync(project);

  const cleanDocument = writeDocument(project, 'clean', 'clean');
  const first = runBuild(toolchain, cleanDocument, 'clean');
  const expectedLine =
    'figura: built project/clean.pdf — 2 pages, 1 diagram, 0 warnings; previews: project/.figura/clean/page-01.png, project/.figura/clean/page-02.png\n';
  if (first.status !== 0 || first.stdout !== expectedLine) {
    failures.push(`build of a clean document exited ${first.status} with ${JSON.stringify(first.stdout)}, expected ${JSON.stringify(expectedLine)}: ${first.stderr.trim()}`);
  }
  if (!existsSync(join(project, 'clean.pdf'))) failures.push('build of a clean document wrote no clean.pdf next to it');
  const gitignorePath = join(project, '.figura', '.gitignore');
  if (!existsSync(gitignorePath) || readFileSync(gitignorePath, 'utf8') !== '*\n') {
    failures.push('build did not put a .gitignore with the single line * into .figura/');
  }

  const strayPreview = join(project, '.figura', 'clean', 'page-09.png');
  writeFileSync(strayPreview, 'stale');
  const second = runBuild(toolchain, cleanDocument, 'clean');
  if (second.status !== 0) failures.push(`a rebuild exited ${second.status}: ${second.stderr.trim()}`);
  if (existsSync(strayPreview)) failures.push('a rebuild left an old preview in .figura/clean/');
  if (!existsSync(join(project, '.figura', 'clean', 'page-02.png'))) failures.push('a rebuild lost the fresh previews');

  const wideDocument = writeDocument(project, 'wide', 'too-wide');
  writeFileSync(join(project, 'wide.pdf'), 'a PDF left by an earlier build');
  const broken = runBuild(toolchain, wideDocument, 'too-wide');
  if (broken.status !== 1) failures.push(`build of a too wide diagram exited ${broken.status}, expected 1`);
  if (!broken.stderr.includes(`figura: ${wideDocument} FAILED:`) || !broken.stderr.includes('  - DIAGRAM-TOO-WIDE: diagram 1')) {
    failures.push(`build of a too wide diagram did not report DIAGRAM-TOO-WIDE in the failure format: ${broken.stderr.trim()}`);
  }
  if (existsSync(join(project, 'wide.pdf'))) failures.push('a failed build left a PDF behind');
  if (existsSync(join(project, '.figura', 'wide'))) failures.push('a failed build left previews behind');
}

try {
  const theme = loadTheme();
  checkKeepGroups();
  checkPrintableDocument(theme);
  checkBuilds();
} catch (error) {
  failures.push(`the build pipeline threw: ${error.stack ?? error.message}`);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('figura pdf check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'figura pdf check passed: headings travel with their next block, the printable document carries the theme and the footer title, a clean build reports its pages and previews in .figura/ behind a .gitignore, a rebuild clears old previews, and a broken diagram stops the build without a PDF.',
);
