#!/usr/bin/env node
//
// Smoke gate of figura against the real tools, outside npm test: each stage needs what its tool
// needs — the d2 stage the network, curl and tar, the browser stage Chromium 131 or newer.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateChromium } from '../figura/scripts/browser-locate.mjs';
import { openCdpSession } from '../figura/scripts/cdp-session.mjs';
import { FiguraError } from '../figura/scripts/figura-error.mjs';
import { startLoopbackServer } from '../figura/scripts/loopback-server.mjs';

const FIGURA_BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'figura', 'bin');
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

function printedPdfProblems(pdf) {
  const pdfText = pdf.toString('latin1');
  const mediaBox = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdfText);
  const pageCount = (pdfText.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  const problems = [];
  if (mediaBox === null) {
    problems.push('the printed PDF carries no MediaBox');
  } else {
    const [width, height] = [Number(mediaBox[1]), Number(mediaBox[2])];
    const isA4 =
      Math.abs(width - A4_POINTS.width) <= PAGE_SIZE_TOLERANCE_POINTS &&
      Math.abs(height - A4_POINTS.height) <= PAGE_SIZE_TOLERANCE_POINTS;
    if (!isA4) problems.push(`the printed page is ${width}×${height} pt, not A4`);
  }
  if (pageCount !== 1) problems.push(`the print of one page produced ${pageCount} pages`);
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
