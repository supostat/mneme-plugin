#!/usr/bin/env node
//
// Gate for figura's main path on the real modules: the real entry figura/bin/figura builds the
// reference demo through the dispatcher, preflight, extraction, theme, render, measure, checks,
// inline, print, previews and report; a broken document stops before any PDF with every problem
// named and a picture of each failed diagram with its conflicts framed in the theme colour and the
// line of the width limit on the too wide one; the ERD parts figura erd writes from the Prisma
// fixture build into a PDF with dagre, the layout erd measured them with; two ERD diagrams of
// different width print at the scale the wider one needs while a graph between them keeps its own;
// a table wider than the column stops the build before the printer with TABLE-TOO-WIDE, and a
// heading that does not fit a page with its figure with HEADING-APART. Only the process boundary
// is faked: a launcher stub answers for d2 with a recorded SVG, a fake browser answers the CDP pipe
// with recorded boxes, table widths and heading groups, a two-page PDF and screenshots, and a
// pdftoppm stub writes the previews. That the modules reach the real d2, Chromium and
// pdftoppm is what the smoke stages and scripts/figura-e2e.mjs prove; this gate proves the modules
// are wired to one another.

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
const highlightLog = join(workDirectory, 'highlights.log');
const THEME = JSON.parse(readFileSync(join(REPO_ROOT, 'figura', 'theme', 'theme.json'), 'utf8'));
const FAILURE_HIGHLIGHT = THEME.diagram.failureHighlight;

function recorded(name) {
  return JSON.parse(readFileSync(join(FIXTURES, 'measurements', `${name}.json`), 'utf8'));
}

function measurementsOf(names) {
  return Object.fromEntries(names.map((name, index) => [`diagram-${String(index + 1).padStart(2, '0')}.svg`, recorded(name)]));
}

function escapedHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
}

function documentOfDiagrams(title, sources, layout) {
  const layoutAttribute = layout === undefined ? '' : ` data-layout="${layout}"`;
  const figures = sources.map(
    (source, index) =>
      `    <figure>\n      <pre class="d2"${layoutAttribute}>\n${escapedHtml(source)}</pre>\n      <figcaption class="caption"><strong>Figure ${index + 1}.</strong> A diagram of the wiring check.</figcaption>\n    </figure>`,
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

function runFigura(toolchain, projectDirectory, commandArguments, measurements, { tableOverflows = [], headingsApart = [] } = {}) {
  rmSync(launcherLog, { force: true });
  rmSync(printedPage, { force: true });
  rmSync(highlightLog, { force: true });
  const measurementsPath = join(projectDirectory, 'measurements.json');
  writeFileSync(measurementsPath, JSON.stringify(measurements));
  const tableOverflowsPath = join(projectDirectory, 'table-overflows.json');
  writeFileSync(tableOverflowsPath, JSON.stringify(tableOverflows));
  const headingsApartPath = join(projectDirectory, 'headings-apart.json');
  writeFileSync(headingsApartPath, JSON.stringify(headingsApart));
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
      FIGURA_FAKE_OVERLAY_LOG: highlightLog,
      FIGURA_FAKE_TABLE_OVERFLOWS: tableOverflowsPath,
      FIGURA_FAKE_HEADINGS_APART: headingsApartPath,
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
  const labelOverlap = readFileSync(join(FIXTURES, 'diagrams', 'label-overlap.d2'), 'utf8');
  writeFileSync(join(project, 'broken.html'), documentOfDiagrams('Broken document', ['a -> b\nBROKEN\n', tooWide, labelOverlap]));
  const run = runFigura(toolchain, project, ['build', 'broken.html'], { 'diagram-02.svg': recorded('too-wide'), 'diagram-03.svg': recorded('label-overlap') });
  if (run.status !== 1 || !run.stderr.includes('broken.html FAILED:')) failures.push(`the build of a broken document exited ${run.status}: ${run.stderr.trim()}`);
  for (const expected of [
    '  - D2-FAILED: diagram 1',
    '  - DIAGRAM-TOO-WIDE: diagram 2',
    '  - LABEL-OVERLAP: diagram 3',
    'figura: failed diagrams drawn in .figura/broken/failed-02.png, .figura/broken/failed-03.png',
  ]) {
    if (!run.stderr.includes(expected)) failures.push(`the build of a broken document did not report ${JSON.stringify(expected)}: ${run.stderr.trim()}`);
  }
  if (existsSync(join(project, 'broken.pdf'))) failures.push('the broken document got a PDF');
  const pictures = existsSync(join(project, '.figura', 'broken')) ? readdirSync(join(project, '.figura', 'broken')).sort() : [];
  if (JSON.stringify(pictures) !== JSON.stringify(['failed-02.png', 'failed-03.png'])) {
    failures.push(`the broken document left ${JSON.stringify(pictures)} in .figura/broken/, expected a picture of diagrams 2 and 3 only`);
  }
  const highlights = readIfPresent(highlightLog);
  const overlappingLabel = recorded('label-overlap').objects.find((object) => object.id === 'cell').labels[0].box;
  if (!highlights.includes(JSON.stringify(overlappingLabel)) || !highlights.includes(JSON.stringify(FAILURE_HIGHLIGHT))) {
    failures.push(`the page of the failed diagram did not get the overlapping label framed in ${FAILURE_HIGHLIGHT}: ${highlights.slice(0, 300)}`);
  }
  const tooWideMeasurement = recorded('too-wide');
  const smallestFontPixels = Math.min(...tooWideMeasurement.objects.flatMap((object) => object.labels.map((label) => label.fontPixels)));
  const columnWidthPoints = THEME.page.widthPoints - THEME.page.marginPoints.left - THEME.page.marginPoints.right;
  const limitLine = { x: (columnWidthPoints * smallestFontPixels) / THEME.diagram.minimumLabelPoints, y: 0, width: 0, height: tooWideMeasurement.heightPixels };
  if (!highlights.includes(JSON.stringify(limitLine))) {
    failures.push(`the picture of the too wide diagram did not get the line of its width limit ${JSON.stringify(limitLine)}: ${highlights.slice(0, 300)}`);
  }
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
  writeFileSync(join(project, 'erd.html'), documentOfDiagrams('Storefront schema', parts, 'dagre'));
  const build = runFigura(toolchain, project, ['build', 'erd.html'], measurementsOf(parts.map(() => 'clean')));
  expectBuilt('the build of the ERD parts', build, project, 'erd', parts.length);
  const renders = readIfPresent(launcherLog).split('\n').filter((line) => line !== '');
  const dagreRenders = renders.filter((line) => line.includes('--layout dagre')).length;
  if (renders.length !== parts.length || dagreRenders !== parts.length) {
    failures.push(`the ERD parts reached d2 ${renders.length} times with ${dagreRenders} dagre layouts, expected ${parts.length} with dagre each`);
  }
}

function labelledMeasurement(widthPixels) {
  return {
    widthPixels,
    heightPixels: 200,
    objects: [{ id: 'node', kind: 'shape', box: { x: 0, y: 0, width: 80, height: 40 }, pathBox: null, labels: [{ text: 'Node', box: { x: 20, y: 10, width: 40, height: 20 }, fontPixels: 16 }] }],
  };
}

function checkSharedErdScale(toolchain) {
  const project = projectDirectory('shared-scale');
  const erd = (table) => `"${table}": {\n  shape: sql_table\n  class: table\n  "id": "bigint" {constraint: primary_key}\n}\n`;
  writeFileSync(join(project, 'shared.html'), documentOfDiagrams('Shared ERD scale', [erd('venues'), 'a -> b\n', erd('users')], 'dagre'));
  const measurements = { 'diagram-01.svg': labelledMeasurement(300), 'diagram-02.svg': labelledMeasurement(800), 'diagram-03.svg': labelledMeasurement(1000) };
  const run = runFigura(toolchain, project, ['build', 'shared.html'], measurements);
  const printed = expectBuilt('the build of two ERD diagrams around a graph', run, project, 'shared', 3);
  const rootWidths = [...printed.matchAll(/<svg width="([\d.]+)" height="[\d.]+" xmlns=/g)].map(([, width]) => width);
  if (JSON.stringify(rootWidths) !== JSON.stringify(['211.32', '99.06', '211.32'])) {
    failures.push(
      `the printed diagrams are ${JSON.stringify(rootWidths)} px wide, expected both 320 px ERD diagrams at the 66% scale the 1000 px one needs (211.32) and the 120 px graph at its own 82.5% (99.06)`,
    );
  }
}

function checkTableTooWide(toolchain) {
  const project = projectDirectory('wide-table');
  writeFileSync(
    join(project, 'tables.html'),
    '<!doctype html>\n<html lang="en">\n  <head><meta charset="utf-8" /><title>Tables</title></head>\n  <body>\n    <h1>Tables</h1>\n    <table><thead><tr><th>Job</th></tr></thead><tbody><tr><td><code>ProcessFinanceReportUpdatesJob</code></td></tr></tbody></table>\n  </body>\n</html>\n',
  );
  const run = runFigura(toolchain, project, ['build', 'tables.html'], {}, { tableOverflows: [{ ordinal: 1, header: 'Job', widthPixels: 949.87, availablePixels: 660.37 }] });
  if (run.status !== 1 || !run.stderr.includes('  - TABLE-TOO-WIDE: table 1 («Job») is 712.4 pt wide against a 495.3 pt column — use fewer columns')) {
    failures.push(`the build of a table wider than the column did not stop with TABLE-TOO-WIDE (exit ${run.status}): ${run.stderr.trim()}`);
  }
  if (existsSync(join(project, 'tables.pdf'))) failures.push('a table wider than the column still got a PDF');
  if (existsSync(printedPage)) failures.push('a table wider than the column reached the printer');
}

function checkHeadingApart(toolchain) {
  const project = projectDirectory('heading-apart');
  writeFileSync(join(project, 'lifecycles.html'), documentOfDiagrams('Lifecycles', ['a -> b\n']));
  const headingsApart = [{ heading: 'Lifecycles', caption: 'Figure 1. A diagram of the wiring check.', heightPixels: 1013.6, pagePixels: 989.19 }];
  const run = runFigura(toolchain, project, ['build', 'lifecycles.html'], measurementsOf(['clean']), { headingsApart });
  const expected = '  - HEADING-APART: heading «Lifecycles» and the figure «Figure 1. A diagram of the wiring check.» are 760.2 pt tall together against a 741.9 pt page — the figure fits a page alone';
  if (run.status !== 1 || !run.stderr.includes(expected)) {
    failures.push(`the build of a heading that does not fit a page with its figure did not stop with HEADING-APART (exit ${run.status}): ${run.stderr.trim()}`);
  }
  if (existsSync(join(project, 'lifecycles.pdf'))) failures.push('a heading apart from its figure still got a PDF');
  if (existsSync(printedPage)) failures.push('a heading apart from its figure reached the printer');
}

try {
  const toolchain = prepareToolchain();
  checkDemo(toolchain);
  checkBrokenDocument(toolchain);
  checkErdIntoDocument(toolchain);
  checkSharedErdScale(toolchain);
  checkTableTooWide(toolchain);
  checkHeadingApart(toolchain);
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
  'figura wire check passed: the real entry built the reference demo through every module, with every diagram rendered in its layout, inlined and printed with the theme and footer, a broken document stopped before the printer with each problem named and a picture of each failed diagram with its conflicts framed and the width limit drawn, the ERD parts of the Prisma fixture built into a PDF with every part drawn by dagre, two ERD diagrams printed at one scale beside a graph at its own, a table wider than the column stopped before the printer with TABLE-TOO-WIDE, and a heading that does not fit a page with its figure with HEADING-APART.',
);
