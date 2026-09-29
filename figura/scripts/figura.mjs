#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { locateChromium } from './browser-locate.mjs';
import { buildSuccessLine, failureReport } from './build-report.mjs';
import { extractDiagrams } from './extract-diagrams.mjs';
import { FiguraError } from './figura-error.mjs';
import { inlineDiagrams } from './inline-diagrams.mjs';
import { layoutLimits, layoutProblems } from './layout-checks.mjs';
import { measureDiagrams } from './measure-diagram.mjs';
import { preflight } from './preflight.mjs';
import { printableDocument, printPdf } from './print-pdf.mjs';
import { clearPreviews, rasterizePages } from './rasterize-pages.mjs';
import { renderDiagram } from './render-diagram.mjs';
import { loadTheme } from './theme.mjs';

const MANIFEST_URL = new URL('../.claude-plugin/plugin.json', import.meta.url);
const USAGE = 'usage: figura <command>\ncommands:\n  version\n  check <document.html>\n  build <document.html>';

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

function existingDocumentPath(documentArgument) {
  if (documentArgument === undefined) {
    console.error(USAGE);
    return undefined;
  }
  const documentPath = resolve(documentArgument);
  if (!existsSync(documentPath)) {
    console.error(`figura: error: ${documentPath} does not exist`);
    return undefined;
  }
  return documentPath;
}

async function checkCommand([documentArgument]) {
  const documentPath = existingDocumentPath(documentArgument);
  if (documentPath === undefined) return 2;
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

async function buildCommand([documentArgument]) {
  const documentPath = existingDocumentPath(documentArgument);
  if (documentPath === undefined) return 2;
  const pdfPath = `${documentPath.replace(/\.html?$/i, '')}.pdf`;
  rmSync(pdfPath, { force: true });
  clearPreviews(documentPath);
  const missing = preflight('build');
  if (missing.length > 0) {
    console.error(failureReport(documentPath, missing));
    return 1;
  }
  const workDirectory = mkdtempSync(join(tmpdir(), 'figura-build-'));
  try {
    const { html, theme, diagrams, problems } = await checkDocument(documentPath, workDirectory);
    if (problems.length > 0) {
      console.error(failureReport(documentPath, problems));
      return 1;
    }
    const printable = printableDocument(inlineDiagrams(html, diagrams), theme);
    const { pageCount } = await printPdf(printable, { executablePath: locateChromium().executablePath, pdfPath });
    const previewPaths = rasterizePages(pdfPath, documentPath);
    console.log(buildSuccessLine({ pdfPath, pageCount, diagramCount: diagrams.length, warnings: [], previewPaths }));
    return 0;
  } catch (error) {
    if (!(error instanceof FiguraError)) throw error;
    rmSync(pdfPath, { force: true });
    console.error(failureReport(documentPath, [error]));
    return 1;
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

const COMMANDS = new Map([
  ['version', printVersion],
  ['check', checkCommand],
  ['build', buildCommand],
]);

const [commandName, ...commandArguments] = process.argv.slice(2);
const command = COMMANDS.get(commandName);
if (command === undefined) {
  console.error(USAGE);
  process.exit(2);
}
process.exitCode = await command(commandArguments);
