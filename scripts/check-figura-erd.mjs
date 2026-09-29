#!/usr/bin/env node
//
// Gate for figura's ERD pipeline with the real theme, render and layout checks and a launcher stub
// whose SVG grows with the tables and columns: model errors by name, keys, unique columns,
// cardinality and domains in D2, the adaptive split of a 30-table fixture where every part passes,
// stubs for cut relations, hidden service columns, deterministic output and the erd command.

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { erdD2 } from '../figura/scripts/erd-d2.mjs';
import { schemaModel, withDomains } from '../figura/scripts/erd-model.mjs';
import { planErdDiagrams, svgSizeMeasurement } from '../figura/scripts/erd-split.mjs';
import { diagramSizeProblems, layoutLimits } from '../figura/scripts/layout-checks.mjs';
import { renderDiagram } from '../figura/scripts/render-diagram.mjs';
import { loadTheme } from '../figura/scripts/theme.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(REPO_ROOT, 'scripts', 'fixtures', 'figura');
const FAKE_LAUNCHER = join(FIXTURES, 'fake-launcher.sh');
const THIRTY_TABLES = join(FIXTURES, 'erd-thirty-tables.json');
const REFERENCE_SCHEMA = join(REPO_ROOT, 'figura', 'reference', 'erd-manual.json');
const EXPECTED_PART_SIZES = [4, 4, 5, 4, 6, 6, 1];
const failures = [];
const workDirectory = mkdtempSync(join(tmpdir(), 'figura-erd-check-'));
const theme = loadTheme();

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function expectIncludes(what, text, expected) {
  if (!text.includes(expected)) failures.push(`${what} lacks ${JSON.stringify(expected)}`);
}

function expectProblem(caseName, problems, expectedText) {
  if (!problems.some((problem) => problem.code === 'ERD-INVALID' && problem.message.includes(expectedText))) {
    failures.push(`${caseName}: no ERD-INVALID naming "${expectedText}" among ${JSON.stringify(problems.map((problem) => problem.message))}`);
  }
}

function checkModelErrors() {
  const users = { name: 'users', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] };
  const orders = { name: 'orders', columns: [{ name: 'id', type: 'uuid' }, { name: 'user_id', type: 'uuid' }] };
  const relation = (overrides) => ({ from: { table: 'orders', column: 'user_id' }, to: { table: 'users', column: 'id' }, cardinality: 'many-to-one', ...overrides });
  expectProblem('duplicate table', schemaModel({ tables: [users, users] }).problems, 'table "users" is declared twice');
  expectProblem('unknown table', schemaModel({ tables: [orders], relations: [relation({})] }).problems, 'points at the unknown table users');
  expectProblem(
    'unknown column',
    schemaModel({ tables: [users, orders], relations: [relation({ from: { table: 'orders', column: 'buyer_id' } })] }).problems,
    'names the unknown column orders.buyer_id',
  );
  expectProblem('many-to-many', schemaModel({ tables: [users, orders], relations: [relation({ cardinality: 'many-to-many' })] }).problems, 'through its join table');
}

function checkD2(referenceModel) {
  const allTables = referenceModel.tables.map((table) => table.name);
  const source = erdD2(referenceModel, allTables);
  for (const expected of [
    'shape: sql_table',
    'class: core',
    '"id": "uuid" {constraint: primary_key}',
    '"email": "text" {constraint: unique}',
    '"account_id": "uuid" {constraint: foreign_key}',
    '"order_id": "uuid" {constraint: [primary_key; foreign_key]}',
    '"identity": {',
    '"sales": {',
    '"sales"."orders"."account_id" -> "identity"."accounts"."id": {source-arrowhead.shape: cf-many; target-arrowhead.shape: cf-one}',
    '"identity"."credentials"."account_id" -> "identity"."accounts"."id": {source-arrowhead.shape: cf-one; target-arrowhead.shape: cf-one}',
    '"created_at": "timestamptz"',
  ]) {
    expectIncludes('the reference ERD', source, expected);
  }
  if (erdD2(referenceModel, allTables, { hideServiceColumns: true }).includes('"created_at"')) failures.push('--hide-service-columns kept created_at');
  if (erdD2(referenceModel, allTables) !== source) failures.push('two renders of the same ERD differ');
  expectIncludes('an ERD with a domain mapping', erdD2(withDomains(referenceModel, { storefront: ['order*'] }), allTables), '"storefront": {');
}

function stubPlan(model, label) {
  const planDirectory = join(workDirectory, label);
  mkdirSync(planDirectory);
  return planErdDiagrams(model, { theme, workDirectory: planDirectory, launcherPath: FAKE_LAUNCHER });
}

function checkSplit() {
  const { model } = schemaModel(readJson(THIRTY_TABLES));
  const plan = stubPlan(model, 'first');
  const sizes = plan.diagrams.map((diagram) => diagram.tables.length);
  if (JSON.stringify(sizes) !== JSON.stringify(EXPECTED_PART_SIZES) || plan.problems.length > 0) {
    failures.push(`the 30-table split gave parts ${JSON.stringify(sizes)} with ${plan.problems.length} problems, expected ${JSON.stringify(EXPECTED_PART_SIZES)}`);
  }
  const placed = plan.diagrams.flatMap((diagram) => diagram.tables);
  if (placed.length !== 30 || new Set(placed).size !== 30) failures.push(`the split placed ${placed.length} tables, ${new Set(placed).size} of them distinct, expected 30`);
  const limits = layoutLimits(theme);
  for (const diagram of plan.diagrams) {
    const { svg } = renderDiagram({ ordinal: diagram.number, layout: 'elk', source: diagram.source }, theme, { workDirectory, launcherPath: FAKE_LAUNCHER });
    const problems = diagramSizeProblems({ ordinal: diagram.number }, svgSizeMeasurement(svg), limits);
    if (problems.length > 0) failures.push(`part ${diagram.number} fails the checks: ${problems.map((problem) => problem.message).join('; ')}`);
  }
  const domainOf = new Map(model.tables.map((table) => [table.name, table.domain]));
  for (const [index, domain] of ['billing', 'catalog', 'identity'].entries()) {
    const tables = plan.diagrams[index]?.tables ?? [];
    if (!tables.every((table) => domainOf.get(table) === domain)) failures.push(`part ${index + 1} is not the ${domain} domain: ${JSON.stringify(tables)}`);
  }
  expectIncludes('the billing part', plan.diagrams[0]?.source ?? '', '"accounts → diagram 3": {class: neutral}');
  expectIncludes('the billing part', plan.diagrams[0]?.source ?? '', '"products → diagram 2": {class: neutral}');
  const again = stubPlan(model, 'second');
  if (JSON.stringify(again.diagrams) !== JSON.stringify(plan.diagrams)) failures.push('two splits of the same schema differ');
  const oversized = { tables: [{ name: 'huge', columns: Array.from({ length: 70 }, (_, index) => ({ name: `column_${index}`, type: 'text' })) }] };
  const refused = stubPlan(schemaModel(oversized).model, 'oversized');
  if (!refused.problems.some((problem) => problem.code === 'DIAGRAM-TOO-TALL' && problem.message.includes('table huge alone') && problem.message.includes('--hide-service-columns'))) {
    failures.push(`a table too tall alone was not refused with DIAGRAM-TOO-TALL and the hint: ${JSON.stringify(refused.problems.map((problem) => problem.message))}`);
  }
}

function runErd(bundle, commandArguments) {
  return spawnSync('/bin/sh', [join(bundle, 'bin', 'figura'), 'erd', ...commandArguments], { cwd: workDirectory, env: { ...process.env, HOME: workDirectory }, encoding: 'utf8' });
}

function checkCommand() {
  const bundle = join(workDirectory, 'figura');
  cpSync(join(REPO_ROOT, 'figura'), bundle, { recursive: true });
  copyFileSync(FAKE_LAUNCHER, join(bundle, 'bin', 'launch.sh'));
  chmodSync(join(bundle, 'bin', 'launch.sh'), 0o755);
  const full = runErd(bundle, ['--source', 'manual', THIRTY_TABLES, '--out', 'erd-out']);
  const files = readdirSync(join(workDirectory, 'erd-out')).sort();
  if (full.status !== 0 || !full.stdout.startsWith('figura: wrote 7 ERD diagrams to erd-out — erd-01.d2 (4 tables)') || files.length !== 7) {
    failures.push(`figura erd exited ${full.status} with ${JSON.stringify(full.stdout)} and ${files.length} files: ${full.stderr.trim()}`);
  }
  const hidden = runErd(bundle, ['--source', 'manual', THIRTY_TABLES, '--out', 'erd-hidden', '--hide-service-columns']);
  const hiddenSources = readdirSync(join(workDirectory, 'erd-hidden')).map((file) => readFileSync(join(workDirectory, 'erd-hidden', file), 'utf8')).join('\n');
  if (hidden.status !== 0 || hiddenSources.includes('"created_at"') || hiddenSources.includes('"updated_at"')) failures.push('figura erd --hide-service-columns kept a service column');
  const subset = runErd(bundle, ['--source', 'manual', THIRTY_TABLES, '--out', 'erd-subset', '--tables', 'accounts,sessions']);
  if (subset.status !== 0 || !subset.stdout.includes('wrote 1 ERD diagram to erd-subset — erd-01.d2 (2 tables)')) failures.push(`figura erd --tables gave: ${subset.stdout}${subset.stderr}`);
  const unsupported = runErd(bundle, ['--source', 'mystery', THIRTY_TABLES, '--out', 'erd-none']);
  if (unsupported.status !== 2) failures.push(`figura erd with an unknown source exited ${unsupported.status}, expected 2`);
}

try {
  checkModelErrors();
  checkD2(schemaModel(readJson(REFERENCE_SCHEMA)).model);
  checkSplit();
  checkCommand();
} catch (error) {
  failures.push(`the ERD pipeline threw: ${error.stack ?? error.message}`);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('figura erd check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'figura erd check passed: model errors are named, keys, unique columns, cardinality and domains reach D2, the 30-table fixture splits by component, domain and breadth-first halving into parts that all pass, cut relations become stubs, service columns hide, output is deterministic, and figura erd writes the parts.',
);
