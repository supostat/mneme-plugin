#!/usr/bin/env node
//
// Smoke gate of figura against the real tools, outside npm test: each stage needs what its tool
// needs — the d2 stage the network, curl and tar, the browser stage Chromium 131 or newer, the
// render stage a d2 the launcher can serve, the checks stage both d2 and Chromium for the broken
// fixtures, a message inside a sequence group and edges into and between containers in both
// layouts, the pdf stage d2, Chromium and poppler (pdftoppm, pdftotext), the erd stage a d2 the
// launcher can serve for the 30-table and hubs-and-spokes fixtures, where self references draw no
// edge and the date column of public_holidays keeps its date type in the SVG.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { locateChromium } from '../figura/scripts/browser-locate.mjs';
import { openCdpSession } from '../figura/scripts/cdp-session.mjs';
import { schemaModel } from '../figura/scripts/erd-model.mjs';
import { planErdDiagrams, svgSizeMeasurement } from '../figura/scripts/erd-split.mjs';
import { FiguraError } from '../figura/scripts/figura-error.mjs';
import { diagramSizeProblems, layoutLimits, layoutProblems, printScales } from '../figura/scripts/layout-checks.mjs';
import { startLoopbackServer } from '../figura/scripts/loopback-server.mjs';
import { measureDiagrams } from '../figura/scripts/measure-diagram.mjs';
import { renderDiagram } from '../figura/scripts/render-diagram.mjs';
import { loadTheme } from '../figura/scripts/theme.mjs';
import { hubsAndSpokesSchema } from './fixtures/figura/erd-hubs.mjs';

const FIGURA_BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'figura', 'bin');
const FIXTURE_DIAGRAMS = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'figura', 'diagrams');
const TEMPLATE_DOCUMENT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'figura', 'template', 'document.html');
const TEMPLATE_TITLE_WORDS = ['Document', 'title'];
const THIRTY_TABLES_FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'figura', 'erd-thirty-tables.json');
const FOOTER_BAND_POINTS = 50;
const ZERO_WIDTH_SPACE = '​';
const EDGE_LINE = /^(.+)\."[^"]*" -> (.+)\."[^"]*": \{/gm;
const POPPLER_RECIPE = 'install poppler: brew install poppler (macOS) or apt install poppler-utils (Debian/Ubuntu)';
const CHECK_FIXTURES = [
  { name: 'clean', layout: 'elk', code: undefined },
  { name: 'label-overlap', layout: 'elk', code: 'LABEL-OVERLAP' },
  { name: 'text-overflow', layout: 'elk', code: 'TEXT-OVERFLOW' },
  { name: 'too-wide', layout: 'elk', code: 'DIAGRAM-TOO-WIDE' },
  { name: 'too-tall', layout: 'elk', code: 'DIAGRAM-TOO-TALL' },
  { name: 'sequence-group', layout: 'elk', code: undefined },
  { name: 'edge-into-container', layout: 'dagre', code: 'LABEL-OVERLAP', remedy: 'reads as a link within it' },
  { name: 'edge-into-container', layout: 'elk', code: 'LABEL-OVERLAP', remedy: 'reads as a link within it' },
  { name: 'edge-between-containers', layout: 'dagre', code: undefined },
  { name: 'edge-between-containers', layout: 'elk', code: undefined },
];
const SMOKE_NODE_LABEL = 'figura smoke node';
const A4_POINTS = { width: 595.28, height: 841.89 };
const PAGE_SIZE_TOLERANCE_POINTS = 1;
const SMOKE_PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>figura smoke</title><style>@page { size: A4; margin: 0; }</style></head>
  <body>
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="60">
      <text id="smoke-text" x="10" y="40" font-size="20">${SMOKE_NODE_LABEL}</text>
    </svg>
  </body>
</html>
`;
const ROLE_DIAGRAM = 'source: Source system {class: source}\ncore: Core service {class: core}\nsource -> core: pushes people\n';
const ROLE_DIAGRAM_TEXTS = ['Source system', 'Core service', 'pushes people'];
const WOFF_SIGNATURE = 'wOFF';
const WOFF_HEADER_BYTES = 44;
const WOFF_TABLE_ENTRY_BYTES = 20;
const INTER_IN_ASCII = Buffer.from('Inter', 'latin1');
const INTER_IN_UTF16BE = Buffer.from([0x00, 0x49, 0x00, 0x6e, 0x00, 0x74, 0x00, 0x65, 0x00, 0x72]);
const MEASURE_SMOKE_TEXT = `(() => {
  const box = document.getElementById('smoke-text').getBBox();
  return { width: box.width, height: box.height };
})()`;

function isExecutableFile(path) {
  return existsSync(path) && (statSync(path).mode & 0o111) !== 0;
}

function renderWithPinnedD2(workDirectory) {
  const pinnedBin = join(workDirectory, 'bin');
  const home = join(workDirectory, 'home');
  mkdirSync(pinnedBin);
  mkdirSync(home);
  copyFileSync(join(FIGURA_BIN, 'launch.sh'), join(pinnedBin, 'launch.sh'));
  copyFileSync(join(FIGURA_BIN, 'release.json'), join(pinnedBin, 'release.json'));
  const source = join(workDirectory, 'smoke.d2');
  const output = join(workDirectory, 'smoke.svg');
  writeFileSync(source, `smoke: ${SMOKE_NODE_LABEL}\n`);
  const run = spawnSync('sh', [join(pinnedBin, 'launch.sh'), source, output], {
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    return [`the launcher did not render with the pinned d2 (exit ${run.status}): ${run.stderr.trim()}`];
  }
  const engineVersion = JSON.parse(readFileSync(join(pinnedBin, 'release.json'), 'utf8')).engine_version;
  const cachedD2 = join(home, '.figura', 'bin', engineVersion, 'd2');
  const problems = [];
  if (!isExecutableFile(cachedD2)) {
    problems.push(`no executable d2 in the cache at ${cachedD2}`);
  }
  const svg = existsSync(output) ? readFileSync(output, 'utf8') : '';
  if (!svg.includes('<svg')) {
    problems.push(`d2 wrote no SVG to ${output}`);
  } else if (!svg.includes(SMOKE_NODE_LABEL)) {
    problems.push(`the SVG does not carry the node text "${SMOKE_NODE_LABEL}"`);
  }
  return problems;
}

function pdfPageCount(pdf) {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

function a4Problems(pdf) {
  const mediaBoxes = [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
  if (mediaBoxes.length === 0) return ['the printed PDF carries no MediaBox'];
  return mediaBoxes
    .map(([, width, height]) => [Number(width), Number(height)])
    .filter(
      ([width, height]) =>
        Math.abs(width - A4_POINTS.width) > PAGE_SIZE_TOLERANCE_POINTS || Math.abs(height - A4_POINTS.height) > PAGE_SIZE_TOLERANCE_POINTS,
    )
    .map(([width, height]) => `a printed page is ${width}×${height} pt, not A4`);
}

function printedPdfProblems(pdf) {
  const pageCount = pdfPageCount(pdf);
  return [...a4Problems(pdf), ...(pageCount === 1 ? [] : [`the print of one page produced ${pageCount} pages`])];
}

function firstPageFooterWords(pdfPath) {
  const layout = spawnSync('pdftotext', ['-bbox', pdfPath, '-'], { encoding: 'utf8' });
  if (layout.error?.code === 'ENOENT') return { problem: `pdftotext is not on PATH — ${POPPLER_RECIPE}` };
  const firstPage = layout.stdout.split('<page ')[1] ?? '';
  const pageHeight = Number(/height="([\d.]+)"/.exec(firstPage)?.[1]);
  const words = [...firstPage.matchAll(/<word xMin="[\d.]+" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">([^<]*)<\/word>/g)]
    .filter(([, yMin]) => Number(yMin) > pageHeight - FOOTER_BAND_POINTS)
    .map(([, , word]) => word);
  return { words };
}

function buildTemplateWithRealTools(workDirectory) {
  const documentPath = join(workDirectory, 'smoke-document.html');
  copyFileSync(TEMPLATE_DOCUMENT, documentPath);
  const build = spawnSync('/bin/sh', [join(FIGURA_BIN, 'figura'), 'build', documentPath], { cwd: workDirectory, encoding: 'utf8' });
  if (build.status !== 0) return [`figura build exited with ${build.status}: ${`${build.stderr}${build.stdout}`.trim()}`];
  const pdf = readFileSync(join(workDirectory, 'smoke-document.pdf'));
  const problems = a4Problems(pdf);
  const footer = firstPageFooterWords(join(workDirectory, 'smoke-document.pdf'));
  if (footer.problem !== undefined) return [...problems, footer.problem];
  for (const expectedWord of [...TEMPLATE_TITLE_WORDS, '1']) {
    if (!footer.words.includes(expectedWord)) problems.push(`the footer of page 1 lacks "${expectedWord}" (it reads ${JSON.stringify(footer.words)})`);
  }
  const previews = readdirSync(join(workDirectory, '.figura', 'smoke-document')).filter((fileName) => fileName.endsWith('.png'));
  const pageCount = pdfPageCount(pdf);
  if (previews.length !== pageCount) problems.push(`${previews.length} previews for ${pageCount} pages`);
  return problems;
}

async function measureAndPrintWithChromium(workDirectory) {
  let chromium;
  try {
    chromium = locateChromium();
  } catch (error) {
    if (error instanceof FiguraError) return [error.message];
    throw error;
  }
  writeFileSync(join(workDirectory, 'page.html'), SMOKE_PAGE);
  const server = await startLoopbackServer([{ urlPrefix: '/', directory: workDirectory }]);
  const session = openCdpSession({ executablePath: chromium.executablePath });
  try {
    const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
    await session.send('Page.enable', {}, sessionId);
    const pageUrl = `${server.origin}/page.html`;
    const [navigation] = await Promise.all([
      session.send('Page.navigate', { url: pageUrl }, sessionId),
      session.waitForEvent('Page.loadEventFired', { sessionId }),
    ]);
    if (navigation.errorText !== undefined) return [`Chromium could not open ${pageUrl}: ${navigation.errorText}`];
    const { result } = await session.send('Runtime.evaluate', { expression: MEASURE_SMOKE_TEXT, returnByValue: true }, sessionId);
    const problems = [];
    if (!(result.value?.width > 0 && result.value?.height > 0)) {
      problems.push(`getBBox of the SVG text measured ${JSON.stringify(result.value)}`);
    }
    const { data } = await session.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, pageRanges: '1' }, sessionId);
    return [...problems, ...printedPdfProblems(Buffer.from(data, 'base64'))];
  } finally {
    await session.close();
    await server.close();
  }
}

function woffNameTable(font) {
  const tableCount = font.readUInt16BE(12);
  for (let index = 0; index < tableCount; index += 1) {
    const entry = WOFF_HEADER_BYTES + index * WOFF_TABLE_ENTRY_BYTES;
    if (font.toString('latin1', entry, entry + 4) !== 'name') continue;
    const offset = font.readUInt32BE(entry + 4);
    const compressedLength = font.readUInt32BE(entry + 8);
    const originalLength = font.readUInt32BE(entry + 12);
    const table = font.subarray(offset, offset + compressedLength);
    return compressedLength < originalLength ? inflateSync(table) : table;
  }
  return Buffer.alloc(0);
}

function embeddedFontsAreInter(svg) {
  const fonts = [...svg.matchAll(/url\("data:[^;"]+;base64,([^"]+)"\)/g)].map(([, data]) => Buffer.from(data, 'base64'));
  if (fonts.length === 0) return 'the SVG embeds no fonts';
  const foreign = fonts.filter((font) => {
    if (font.toString('latin1', 0, 4) !== WOFF_SIGNATURE) return true;
    const names = woffNameTable(font);
    return !names.includes(INTER_IN_ASCII) && !names.includes(INTER_IN_UTF16BE);
  });
  return foreign.length === 0 ? undefined : `${foreign.length} of ${fonts.length} embedded fonts are not Inter`;
}

function renderRolesWithRealD2(workDirectory) {
  const theme = loadTheme();
  let svg;
  try {
    ({ svg } = renderDiagram({ ordinal: 1, source: ROLE_DIAGRAM, layout: 'elk', caption: 'render smoke' }, theme, { workDirectory }));
  } catch (error) {
    if (error instanceof FiguraError) return [error.message];
    throw error;
  }
  const lowerCaseSvg = svg.toLowerCase();
  const problems = ROLE_DIAGRAM_TEXTS.filter((text) => !svg.includes(`>${text}<`)).map((text) => `the SVG lacks the text "${text}"`);
  for (const role of ['source', 'core']) {
    if (!lowerCaseSvg.includes(theme.roles[role].fill)) problems.push(`the SVG lacks the ${role} role fill ${theme.roles[role].fill}`);
  }
  const fontProblem = embeddedFontsAreInter(svg);
  if (fontProblem !== undefined) problems.push(fontProblem);
  return problems;
}

async function checkFixturesWithRealTools(workDirectory) {
  let executablePath;
  try {
    executablePath = locateChromium().executablePath;
  } catch (error) {
    if (error instanceof FiguraError) return [error.message];
    throw error;
  }
  const theme = loadTheme();
  const fixtures = CHECK_FIXTURES.map((fixture, index) => ({
    ...fixture,
    ordinal: index + 1,
    caption: `${fixture.name} (${fixture.layout})`,
    source: readFileSync(join(FIXTURE_DIAGRAMS, `${fixture.name}.d2`), 'utf8'),
  }));
  let rendered;
  try {
    rendered = fixtures.map((fixture) => ({ ...fixture, ...renderDiagram(fixture, theme, { workDirectory }) }));
  } catch (error) {
    if (error instanceof FiguraError) return [error.message];
    throw error;
  }
  const measurements = await measureDiagrams(rendered.map((diagram) => diagram.svgPath), { executablePath });
  const limits = layoutLimits(theme);
  return rendered.flatMap((diagram, index) => {
    const problems = layoutProblems(diagram, measurements[index], limits, printScales([diagram], [measurements[index]], limits)[0]);
    const codes = [...new Set(problems.map((problem) => problem.code))];
    if (diagram.code === undefined) {
      return codes.length === 0 ? [] : [`the ${diagram.caption} fixture failed the checks with ${codes.join(', ')}`];
    }
    if (!codes.includes(diagram.code)) return [`the ${diagram.caption} fixture did not fail with ${diagram.code} (got ${JSON.stringify(codes)})`];
    if (diagram.remedy !== undefined && !problems.some((problem) => problem.code === diagram.code && problem.remedy.includes(diagram.remedy))) {
      return [`the ${diagram.caption} fixture failed without the remedy "${diagram.remedy}"`];
    }
    return [];
  });
}

function realD2SplitProblems(fixtureName, schema, workDirectory, theme) {
  const { model } = schemaModel(schema);
  const plan = planErdDiagrams(model, { theme, workDirectory });
  const problems = plan.problems.map((problem) => `the ${fixtureName}: ${problem.message}`);
  const placed = plan.diagrams.flatMap((diagram) => diagram.tables);
  if (placed.length !== model.tables.length || new Set(placed).size !== model.tables.length) {
    problems.push(`the parts of the ${fixtureName} place ${placed.length} tables, ${new Set(placed).size} of them distinct, of ${model.tables.length}`);
  }
  const limits = layoutLimits(theme);
  const svgByTable = new Map();
  for (const diagram of plan.diagrams) {
    const part = { ordinal: diagram.number, layout: 'dagre', source: diagram.source };
    const { svg } = renderDiagram(part, theme, { workDirectory });
    for (const tableName of diagram.tables) svgByTable.set(tableName, svg);
    const measurement = svgSizeMeasurement(svg);
    problems.push(...diagramSizeProblems(part, measurement, limits, printScales([part], [measurement], limits)[0]).map((problem) => `the ${fixtureName}: ${problem.message}`));
    const selfEdge = [...diagram.source.matchAll(EDGE_LINE)].find(([, fromTable, toTable]) => fromTable === toTable);
    if (selfEdge !== undefined) problems.push(`the ${fixtureName}: part ${diagram.number} draws a self reference as an edge: ${selfEdge[0]}`);
  }
  return { problems, svgByTable };
}

function splitErdFixturesWithRealD2(workDirectory) {
  const theme = loadTheme();
  try {
    const thirtyTables = realD2SplitProblems('30-table fixture', JSON.parse(readFileSync(THIRTY_TABLES_FIXTURE, 'utf8')), workDirectory, theme);
    const hubs = realD2SplitProblems('hubs-and-spokes fixture', hubsAndSpokesSchema(), workDirectory, theme);
    const typeShown = hubs.svgByTable.get('public_holidays').includes(`>date${ZERO_WIDTH_SPACE}<`);
    const typeProblems = typeShown ? [] : ['the real d2 dropped the date type of public_holidays.date, a column named after its type'];
    return [...thirtyTables.problems, ...hubs.problems, ...typeProblems];
  } catch (error) {
    if (error instanceof FiguraError) return [error.message];
    throw error;
  }
}

const STAGES = new Map([
  [
    'd2',
    {
      check: renderWithPinnedD2,
      passed: 'the launcher downloaded, verified and cached the pinned d2, and d2 rendered an SVG with the node text',
    },
  ],
  [
    'browser',
    {
      check: measureAndPrintWithChromium,
      passed: 'Chromium answered over the CDP pipe, opened a page from the loopback server, measured SVG text with getBBox and printed one A4 page',
    },
  ],
  [
    'render',
    {
      check: renderRolesWithRealD2,
      passed: 'the real d2 behind the launcher took the theme TTFs and role classes and wrote an SVG with the node texts in embedded Inter',
    },
  ],
  [
    'checks',
    {
      check: checkFixturesWithRealTools,
      passed:
        'the real d2 and Chromium measured the fixtures: the clean one, a message inside a sequence group and edges between two containers pass, the broken ones fail with LABEL-OVERLAP, TEXT-OVERFLOW, DIAGRAM-TOO-WIDE and DIAGRAM-TOO-TALL, and a labelled edge into a container fails in dagre and ELK with its own remedy',
    },
  ],
  [
    'pdf',
    {
      check: buildTemplateWithRealTools,
      passed: 'figura build printed the template as A4 with the title and page number in the footer and one preview per page',
    },
  ],
  [
    'erd',
    {
      check: splitErdFixturesWithRealD2,
      passed:
        'the real d2 rendered every part of the 30-table and hubs-and-spokes fixtures with dagre within the width and height of an A4 page, each table in one part, no self reference drawn as an edge and the date type of public_holidays.date shown',
    },
  ],
]);

const [stageName] = process.argv.slice(2);
const stage = STAGES.get(stageName);
if (stage === undefined) {
  console.error(`figura-smoke: usage: figura-smoke.mjs <stage> (stages: ${[...STAGES.keys()].join(', ')})`);
  process.exit(2);
}

const workDirectory = mkdtempSync(join(tmpdir(), 'figura-smoke-'));
let problems;
try {
  problems = await stage.check(workDirectory);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}
if (problems.length > 0) {
  console.error(`figura-smoke: stage ${stageName} FAILED:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`figura-smoke: stage ${stageName} passed — ${stage.passed}.`);
