#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { locateChromium } from './browser-locate.mjs';
import { buildSuccessLine, failureReport } from './build-report.mjs';
import { modelSubset, schemaModel, withDomains } from './erd-model.mjs';
import { readManualSchema } from './erd-source-manual.mjs';
import { planErdDiagrams } from './erd-split.mjs';
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
const USAGE = [
  'usage: figura <command>',
  'commands:',
  '  version',
  '  check <document.html>',
  '  build <document.html>',
  '  erd --source manual <schema.json> --out <directory> [--hide-service-columns] [--tables a,b] [--domains <json>]',
].join('\n');
const ERD_SOURCES = ['manual'];
const ERD_OUTPUT_FILE = /^erd-\d+\.d2$/;

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

function erdOptions(commandArguments) {
  const options = { hideServiceColumns: false };
  const valued = new Map([
    ['--source', 'source'],
    ['--out', 'outDirectory'],
    ['--tables', 'tables'],
    ['--domains', 'domains'],
  ]);
  for (let index = 0; index < commandArguments.length; index += 1) {
    const argument = commandArguments[index];
    if (argument === '--hide-service-columns') {
      options.hideServiceColumns = true;
    } else if (valued.has(argument) && index + 1 < commandArguments.length) {
      options[valued.get(argument)] = commandArguments[index + 1];
      index += 1;
    } else if (!argument.startsWith('--') && options.schemaPath === undefined) {
      options.schemaPath = argument;
    } else {
      return undefined;
    }
  }
  const complete = ERD_SOURCES.includes(options.source) && options.schemaPath !== undefined && options.outDirectory !== undefined;
  return complete ? options : undefined;
}

function domainPatterns(domainsArgument) {
  if (domainsArgument === undefined) return {};
  const parsed = JSON.parse(domainsArgument);
  const isMapping =
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Object.values(parsed).every((patterns) => Array.isArray(patterns) && patterns.every((pattern) => typeof pattern === 'string'));
  if (!isMapping) throw new SyntaxError('expected {"domain": ["table", "prefix*"]}');
  return parsed;
}

function writeErdDiagrams(outDirectory, diagrams) {
  mkdirSync(outDirectory, { recursive: true });
  for (const fileName of readdirSync(outDirectory).filter((candidate) => ERD_OUTPUT_FILE.test(candidate))) {
    rmSync(join(outDirectory, fileName));
  }
  return diagrams.map((diagram) => {
    const fileName = `erd-${String(diagram.number).padStart(2, '0')}.d2`;
    writeFileSync(join(outDirectory, fileName), diagram.source);
    return `${fileName} (${diagram.tables.length} ${diagram.tables.length === 1 ? 'table' : 'tables'})`;
  });
}

async function erdCommand(commandArguments) {
  const options = erdOptions(commandArguments);
  if (options === undefined) {
    console.error(USAGE);
    return 2;
  }
  let patterns;
  try {
    patterns = domainPatterns(options.domains);
  } catch (error) {
    console.error(`figura: error: --domains is not a domain mapping: ${error.message}`);
    return 2;
  }
  const schemaPath = resolve(options.schemaPath);
  const missing = preflight('erd', { erdSource: options.source });
  if (missing.length > 0) {
    console.error(failureReport(schemaPath, missing));
    return 1;
  }
  const workDirectory = mkdtempSync(join(tmpdir(), 'figura-erd-'));
  try {
    const { model: sourceModel, problems } = schemaModel(readManualSchema(schemaPath));
    const tableNames = options.tables?.split(',').map((tableName) => tableName.trim()).filter((tableName) => tableName !== '');
    const subset = tableNames === undefined ? { model: sourceModel, problems: [] } : modelSubset(sourceModel, tableNames);
    if (problems.length + subset.problems.length > 0) {
      console.error(failureReport(schemaPath, [...problems, ...subset.problems]));
      return 1;
    }
    const plan = planErdDiagrams(withDomains(subset.model, patterns), {
      theme: loadTheme(),
      hideServiceColumns: options.hideServiceColumns,
      workDirectory,
    });
    if (plan.problems.length > 0) {
      console.error(failureReport(schemaPath, plan.problems));
      return 1;
    }
    const outDirectory = resolve(options.outDirectory);
    const written = writeErdDiagrams(outDirectory, plan.diagrams);
    const count = plan.diagrams.length;
    console.log(`figura: wrote ${count} ERD ${count === 1 ? 'diagram' : 'diagrams'} to ${relative(process.cwd(), outDirectory) || '.'} — ${written.join(', ')}`);
    return 0;
  } catch (error) {
    if (!(error instanceof FiguraError)) throw error;
    console.error(failureReport(schemaPath, [error]));
    return 1;
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

const COMMANDS = new Map([
  ['version', printVersion],
  ['check', checkCommand],
  ['build', buildCommand],
  ['erd', erdCommand],
]);

const [commandName, ...commandArguments] = process.argv.slice(2);
const command = COMMANDS.get(commandName);
if (command === undefined) {
  console.error(USAGE);
  process.exit(2);
}
process.exitCode = await command(commandArguments);
