#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { locateChromium } from './browser-locate.mjs';
import { extractDiagrams } from './extract-diagrams.mjs';
import { FiguraError } from './figura-error.mjs';
import { layoutLimits, layoutProblems } from './layout-checks.mjs';
import { measureDiagrams } from './measure-diagram.mjs';
import { preflight } from './preflight.mjs';
import { renderDiagram } from './render-diagram.mjs';
import { loadTheme } from './theme.mjs';

const MANIFEST_URL = new URL('../.claude-plugin/plugin.json', import.meta.url);
const USAGE = 'usage: figura <command>\ncommands:\n  version\n  check <document.html>';

function failureReport(documentPath, problems) {
  return [`figura: ${documentPath} FAILED:`, ...problems.map((problem) => `  - ${problem.message}`)].join('\n');
}

function printVersion() {
  const manifest = JSON.parse(readFileSync(MANIFEST_URL, 'utf8'));
  console.log(`${manifest.name} ${manifest.version}`);
  return 0;
}

function renderEachDiagram(diagrams, theme, workDirectory) {
  const rendered = [];
  const problems = [];
  for (const diagram of diagrams) {
    try {
      rendered.push({ ...diagram, ...renderDiagram(diagram, theme, { workDirectory }) });
    } catch (error) {
      if (!(error instanceof FiguraError)) throw error;
      problems.push(error);
    }
  }
  return { rendered, problems };
}

async function checkDocument(documentPath, workDirectory) {
  const theme = loadTheme();
  const html = readFileSync(documentPath, 'utf8');
  const { rendered, problems } = renderEachDiagram(extractDiagrams(html), theme, workDirectory);
  if (rendered.length > 0) {
    const measurements = await measureDiagrams(
      rendered.map((diagram) => diagram.svgPath),
      { executablePath: locateChromium().executablePath },
    );
    const limits = layoutLimits(theme);
    rendered.forEach((diagram, index) => problems.push(...layoutProblems(diagram, measurements[index], limits)));
  }
  return { html, theme, diagrams: rendered, problems };
}

async function checkCommand([documentArgument]) {
  if (documentArgument === undefined) {
    console.error(USAGE);
    return 2;
  }
  const documentPath = resolve(documentArgument);
  if (!existsSync(documentPath)) {
    console.error(`figura: error: ${documentPath} does not exist`);
    return 2;
  }
  const missing = preflight('check');
  if (missing.length > 0) {
    console.error(failureReport(documentPath, missing));
    return 1;
  }
  const workDirectory = mkdtempSync(join(tmpdir(), 'figura-check-'));
  try {
    const { diagrams, problems } = await checkDocument(documentPath, workDirectory);
    if (problems.length > 0) {
      console.error(failureReport(documentPath, problems));
      return 1;
    }
    console.log(`figura: ${documentPath} passed the check — ${diagrams.length} ${diagrams.length === 1 ? 'diagram fits' : 'diagrams fit'} the column and the page`);
    return 0;
  } catch (error) {
    if (!(error instanceof FiguraError)) throw error;
    console.error(failureReport(documentPath, [error]));
    return 1;
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

const COMMANDS = new Map([
  ['version', printVersion],
  ['check', checkCommand],
]);

const [commandName, ...commandArguments] = process.argv.slice(2);
const command = COMMANDS.get(commandName);
if (command === undefined) {
  console.error(USAGE);
  process.exit(2);
}
process.exitCode = await command(commandArguments);
