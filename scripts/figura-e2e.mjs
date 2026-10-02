#!/usr/bin/env node
//
// End-to-end run of figura on the real tools, outside npm test and in the figura-e2e CI job: the
// real CLI builds a copy of the reference demo into an A4 PDF with a preview per page and no
// problem, stops a document of broken diagrams with LABEL-OVERLAP, DIAGRAM-TOO-WIDE and
// DIAGRAM-TOO-TALL before any PDF and leaves a PNG picture of each failed diagram, passes a message
// inside a sequence group and edges between containers, fails a labelled edge into a container in
// dagre and ELK with its own remedy, and turns the Prisma fixture and the hubs-and-spokes schema into
// ERD parts that the real d2 renders with dagre and the check passes, every table in exactly one
// part. It needs d2 (the launcher downloads the pinned release), Chromium 131 or newer and poppler
// at once; a missing one stops it with preflight's named line and recipe.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preflight } from '../figura/scripts/preflight.mjs';
import { hubsAndSpokesSchema } from './fixtures/figura/erd-hubs.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIGURA_ENTRY = join(REPO_ROOT, 'figura', 'bin', 'figura');
const DEMO_DOCUMENT = join(REPO_ROOT, 'figura', 'reference', 'demo.html');
const FIXTURE_DIAGRAMS = join(REPO_ROOT, 'scripts', 'fixtures', 'figura', 'diagrams');
const PRISMA_SCHEMA = join(REPO_ROOT, 'scripts', 'fixtures', 'figura', 'schemas', 'schema.prisma');
const PRISMA_TABLE_COUNT = 8;
const BROKEN_DIAGRAM_CODES = new Map([
  ['label-overlap', 'LABEL-OVERLAP'],
  ['too-wide', 'DIAGRAM-TOO-WIDE'],
  ['too-tall', 'DIAGRAM-TOO-TALL'],
]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FAILED_PICTURES = ['failed-01.png', 'failed-02.png', 'failed-03.png'];
const INTO_CONTAINER = 'reads as a link within it';
const ERD_TABLE = /"([^"]+)": \{\n\s+shape: sql_table/g;
const DEMO_SUCCESS = /^figura: built demo\.pdf — (\d+) pages?, (\d+) diagrams?, 0 warnings; previews: /;
const failures = [];

function escapedHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
}

function documentOfDiagrams(title, diagrams) {
  const figures = diagrams.map(
    ({ caption, source, layout }) =>
      `    <figure>\n      <pre class="d2"${layout === undefined ? '' : ` data-layout="${layout}"`}>\n${escapedHtml(source)}</pre>\n      <figcaption class="caption"><strong>${caption}.</strong> A diagram of the end-to-end run.</figcaption>\n    </figure>`,
  );
  return `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <title>${title}</title>\n  </head>\n  <body>\n    <h1>${title}</h1>\n${figures.join('\n')}\n  </body>\n</html>\n`;
}

function figura(workDirectory, commandArguments) {
  return spawnSync('/bin/sh', [FIGURA_ENTRY, ...commandArguments], { cwd: workDirectory, encoding: 'utf8' });
}

function output(run) {
  return `${run.stdout}${run.stderr}`.trim();
}

function missingTools() {
  const problems = [...preflight('build'), ...preflight('erd', { erdSource: 'prisma' })];
  return [...new Map(problems.map((problem) => [problem.message, problem])).values()];
}

function buildDemo(workDirectory) {
  const demoDirectory = join(workDirectory, 'demo');
  mkdirSync(demoDirectory);
  copyFileSync(DEMO_DOCUMENT, join(demoDirectory, 'demo.html'));
  const build = figura(demoDirectory, ['build', 'demo.html']);
  const success = DEMO_SUCCESS.exec(build.stdout);
  if (build.status !== 0 || success === null || build.stderr.trim() !== '') {
    failures.push(`figura build of the demo exited ${build.status}: ${output(build)}`);
    return;
  }
  const pageCount = Number(success[1]);
  const diagramCount = Number(success[2]);
  const demoDiagramCount = (readFileSync(DEMO_DOCUMENT, 'utf8').match(/<pre class="d2"/g) ?? []).length;
  if (diagramCount !== demoDiagramCount) failures.push(`the demo build reported ${diagramCount} diagrams, the demo holds ${demoDiagramCount}`);
  if (!existsSync(join(demoDirectory, 'demo.pdf'))) failures.push('the demo build reported success but wrote no demo.pdf');
  const previews = readdirSync(join(demoDirectory, '.figura', 'demo')).filter((fileName) => /^page-\d+\.png$/.test(fileName));
  if (previews.length !== pageCount) failures.push(`the demo build wrote ${previews.length} previews for ${pageCount} pages`);
}

function stopBrokenDocument(workDirectory) {
  const brokenDirectory = join(workDirectory, 'broken');
  mkdirSync(brokenDirectory);
  const diagrams = [...BROKEN_DIAGRAM_CODES.keys()].map((name) => ({ caption: name, source: readFileSync(join(FIXTURE_DIAGRAMS, `${name}.d2`), 'utf8') }));
  writeFileSync(join(brokenDirectory, 'broken.html'), documentOfDiagrams('Broken diagrams', diagrams));
  const picturesDirectory = join(brokenDirectory, '.figura', 'broken');
  for (const command of ['check', 'build']) {
    const run = figura(brokenDirectory, [command, 'broken.html']);
    if (run.status !== 1 || !run.stderr.includes('broken.html FAILED:')) failures.push(`figura ${command} of the broken document exited ${run.status}: ${output(run)}`);
    const missingCodes = [...BROKEN_DIAGRAM_CODES.values()].filter((code) => !run.stderr.includes(`  - ${code}: `));
    if (missingCodes.length > 0) failures.push(`figura ${command} of the broken document did not name ${missingCodes.join(', ')}: ${output(run)}`);
    const namedPictures = `figura: failed diagrams drawn in ${FAILED_PICTURES.map((picture) => `.figura/broken/${picture}`).join(', ')}`;
    if (!run.stderr.includes(namedPictures)) failures.push(`figura ${command} of the broken document did not name its pictures: ${output(run)}`);
    const pictures = existsSync(picturesDirectory) ? readdirSync(picturesDirectory).sort() : [];
    if (JSON.stringify(pictures) !== JSON.stringify(FAILED_PICTURES)) failures.push(`figura ${command} of the broken document left ${JSON.stringify(pictures)}, expected ${JSON.stringify(FAILED_PICTURES)}`);
    for (const picture of pictures.filter((name) => !readFileSync(join(picturesDirectory, name)).subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))) {
      failures.push(`figura ${command} wrote ${picture}, which is not a PNG`);
    }
  }
  if (existsSync(join(brokenDirectory, 'broken.pdf'))) failures.push('the broken document got a PDF');
}

function fixtureDiagram(name, layout) {
  return { caption: `${name} in ${layout}`, layout, source: readFileSync(join(FIXTURE_DIAGRAMS, `${name}.d2`), 'utf8') };
}

function checkGroupsAndContainers(workDirectory) {
  const passingDirectory = join(workDirectory, 'passing-frames');
  mkdirSync(passingDirectory);
  writeFileSync(
    join(passingDirectory, 'frames.html'),
    documentOfDiagrams('Frames that pass', [fixtureDiagram('sequence-group', 'elk'), fixtureDiagram('edge-between-containers', 'dagre'), fixtureDiagram('edge-between-containers', 'elk')]),
  );
  const passing = figura(passingDirectory, ['check', 'frames.html']);
  if (passing.status !== 0 || !passing.stdout.includes('passed the check — 3 diagrams fit')) {
    failures.push(`figura check of a sequence group and edges between containers exited ${passing.status}: ${output(passing)}`);
  }
  const failingDirectory = join(workDirectory, 'edges-into-containers');
  mkdirSync(failingDirectory);
  writeFileSync(join(failingDirectory, 'edges.html'), documentOfDiagrams('Edges into containers', [fixtureDiagram('edge-into-container', 'dagre'), fixtureDiagram('edge-into-container', 'elk')]));
  const failing = figura(failingDirectory, ['check', 'edges.html']);
  for (const ordinal of [1, 2]) {
    const intoContainer = new RegExp(`LABEL-OVERLAP: diagram ${ordinal} [^\\n]*crosses the shape domain — [^\\n]*${INTO_CONTAINER}`);
    if (failing.status !== 1 || !intoContainer.test(failing.stderr)) {
      failures.push(`figura check did not fail diagram ${ordinal}, a labelled edge into a container, with its own remedy: ${output(failing)}`);
    }
  }
}

function erdPartsInDocument(workDirectory, name, erdArguments) {
  const erdDirectory = join(workDirectory, name);
  mkdirSync(erdDirectory);
  const erd = figura(erdDirectory, ['erd', ...erdArguments, '--out', 'parts']);
  if (erd.status !== 0 || !erd.stdout.startsWith('figura: wrote ') || !erd.stdout.trim().endsWith('; 0 warnings')) {
    failures.push(`figura erd of the ${name} schema exited ${erd.status}: ${output(erd)}`);
    return undefined;
  }
  const partFiles = readdirSync(join(erdDirectory, 'parts')).filter((fileName) => /^erd-\d+\.d2$/.test(fileName)).sort();
  const parts = partFiles.map((fileName) => ({ caption: fileName, layout: 'dagre', source: readFileSync(join(erdDirectory, 'parts', fileName), 'utf8') }));
  writeFileSync(join(erdDirectory, 'erd.html'), documentOfDiagrams(`ERD parts of the ${name} schema`, parts));
  const check = figura(erdDirectory, ['check', 'erd.html']);
  if (check.status !== 0 || !check.stdout.includes(`passed the check — ${parts.length} ${parts.length === 1 ? 'diagram fits' : 'diagrams fit'}`)) {
    failures.push(`figura check of the ${parts.length} ERD parts of the ${name} schema exited ${check.status}: ${output(check)}`);
  }
  return parts.flatMap((part) => [...part.source.matchAll(ERD_TABLE)].map(([, tableName]) => tableName));
}

function expectEveryTableOnce(name, drawnTables, expectedCount) {
  if (drawnTables === undefined) return;
  if (drawnTables.length !== expectedCount || new Set(drawnTables).size !== expectedCount) {
    failures.push(`the ERD parts of the ${name} schema draw ${drawnTables.length} tables, ${new Set(drawnTables).size} of them distinct, expected ${expectedCount}`);
  }
}

function checkPrismaErd(workDirectory) {
  expectEveryTableOnce('prisma', erdPartsInDocument(workDirectory, 'prisma', ['--source', 'prisma', PRISMA_SCHEMA]), PRISMA_TABLE_COUNT);
}

function checkHubsAndSpokesErd(workDirectory) {
  const schema = hubsAndSpokesSchema();
  const schemaPath = join(workDirectory, 'hubs.json');
  writeFileSync(schemaPath, JSON.stringify(schema));
  expectEveryTableOnce('hubs-and-spokes', erdPartsInDocument(workDirectory, 'hubs-and-spokes', ['--source', 'manual', schemaPath]), schema.tables.length);
}

const missing = missingTools();
if (missing.length > 0) {
  console.error('figura-e2e FAILED: the real tools are missing:');
  for (const problem of missing) console.error(`  - ${problem.message}`);
  process.exit(1);
}

const workDirectory = mkdtempSync(join(tmpdir(), 'figura-e2e-'));
try {
  buildDemo(workDirectory);
  stopBrokenDocument(workDirectory);
  checkGroupsAndContainers(workDirectory);
  checkPrismaErd(workDirectory);
  checkHubsAndSpokesErd(workDirectory);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('figura-e2e FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'figura-e2e passed: the real d2, Chromium and poppler built the demo with a preview per page, stopped the broken document with LABEL-OVERLAP, DIAGRAM-TOO-WIDE and DIAGRAM-TOO-TALL before any PDF with a PNG picture of each failed diagram, passed a sequence group and edges between containers, failed a labelled edge into a container in dagre and ELK with its own remedy, and checked every dagre ERD part of the Prisma fixture and the hubs-and-spokes schema on the page, each table drawn once.',
);
