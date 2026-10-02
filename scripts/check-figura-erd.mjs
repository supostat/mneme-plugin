#!/usr/bin/env node
//
// Gate for figura's ERD pipeline with the real theme, render and layout checks and a launcher stub
// whose SVG grows with the tables and columns: model errors by name, keys, unique columns,
// cardinality, domains and foreign keys that name their table in D2, key columns only, a subset that
// keeps the target of its foreign keys, parts that grow inside their domain and are measured with
// dagre on the 30-table and the hubs-and-spokes fixtures, no stub boxes, single-table remedies built
// from the flags passed and the measured cause, deterministic output and the erd command.

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { erdD2, relationEndColumns } from '../figura/scripts/erd-d2.mjs';
import { modelSubset, schemaModel, withDomains } from '../figura/scripts/erd-model.mjs';
import { planErdDiagrams, singleTableRemedy, svgSizeMeasurement } from '../figura/scripts/erd-split.mjs';
import { diagramSizeProblems, layoutLimits } from '../figura/scripts/layout-checks.mjs';
import { renderDiagram } from '../figura/scripts/render-diagram.mjs';
import { loadTheme } from '../figura/scripts/theme.mjs';
import { HOLIDAY_TABLES, HUB_INCOMING_FOREIGN_KEYS, hubsAndSpokesSchema } from './fixtures/figura/erd-hubs.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(REPO_ROOT, 'scripts', 'fixtures', 'figura');
const FAKE_LAUNCHER = join(FIXTURES, 'fake-launcher.sh');
const THIRTY_TABLES = join(FIXTURES, 'erd-thirty-tables.json');
const REFERENCE_SCHEMA = join(REPO_ROOT, 'figura', 'reference', 'erd-manual.json');
const EXPECTED_PART_SIZES = [4, 4, 5, 4, 7, 6];
const STUB_MARKERS = ['{class: neutral}', '→ diagram'];
const failures = [];
const workDirectory = mkdtempSync(join(tmpdir(), 'figura-erd-check-'));
const launcherLog = join(workDirectory, 'launcher.log');
const theme = loadTheme();

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function expectIncludes(what, text, expected) {
  if (!text.includes(expected)) failures.push(`${what} lacks ${JSON.stringify(expected)}`);
}

function expectExcludes(what, text, unexpected) {
  if (text.includes(unexpected)) failures.push(`${what} carries ${JSON.stringify(unexpected)}`);
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
    'class: table',
    '"id": "uuid" {constraint: primary_key}',
    '"email": "text" {constraint: unique}',
    '"account_id": "uuid → accounts" {constraint: foreign_key}',
    '"account_id": "uuid → accounts" {constraint: [foreign_key; unique]}',
    '"order_id": "uuid → orders" {constraint: [primary_key; foreign_key]}',
    '"identity": {\n  label.near: top-left',
    '"sales": {',
    '"sales"."orders"."account_id" -> "identity"."accounts"."id": {source-arrowhead.shape: cf-many; target-arrowhead.shape: cf-one}',
    '"identity"."credentials"."account_id" -> "identity"."accounts"."id": {source-arrowhead.shape: cf-one; target-arrowhead.shape: cf-one}',
    '"created_at": "timestamptz"',
  ]) {
    expectIncludes('the reference ERD', source, expected);
  }
  if (erdD2(referenceModel, allTables, { hideServiceColumns: true }).includes('"created_at"')) failures.push('--hide-service-columns kept created_at');
  const keyColumnsOnly = erdD2(referenceModel, allTables, { keyColumns: true });
  for (const hidden of ['"display_name"', '"password_hash"', '"placed_at"', '"title"', '"quantity"', '"created_at"']) expectExcludes('the key-columns ERD', keyColumnsOnly, hidden);
  for (const kept of ['"id": "uuid" {constraint: primary_key}', '"email": "text" {constraint: unique}', '"account_id": "uuid → accounts" {constraint: foreign_key}']) {
    expectIncludes('the key-columns ERD', keyColumnsOnly, kept);
  }
  const ordersOnly = erdD2(modelSubset(referenceModel, ['orders']).model, ['orders']);
  expectIncludes('the ERD of the orders subset', ordersOnly, '"account_id": "uuid → accounts" {constraint: foreign_key}');
  for (const unexpected of ['"accounts": {', ' -> ']) expectExcludes('the ERD of the orders subset', ordersOnly, unexpected);
  if (erdD2(referenceModel, allTables) !== source) failures.push('two renders of the same ERD differ');
  expectIncludes('an ERD with a domain mapping', erdD2(withDomains(referenceModel, { storefront: ['order*'] }), allTables), '"storefront": {');
}

function stubPlan(model, label, columnOptions = {}) {
  const planDirectory = join(workDirectory, label);
  mkdirSync(planDirectory);
  return planErdDiagrams(model, { theme, ...columnOptions, workDirectory: planDirectory, launcherPath: FAKE_LAUNCHER });
}

function expectPartsWithoutStubs(fixtureName, plan) {
  for (const diagram of plan.diagrams) {
    for (const marker of STUB_MARKERS) expectExcludes(`part ${diagram.number} of the ${fixtureName}`, diagram.source, marker);
    const tableCount = diagram.source.split('shape: sql_table').length - 1;
    if (tableCount !== diagram.tables.length) failures.push(`part ${diagram.number} of the ${fixtureName} draws ${tableCount} tables for its ${diagram.tables.length}`);
  }
}

function expectEveryTableOnce(fixtureName, plan, model) {
  const placed = plan.diagrams.flatMap((diagram) => diagram.tables);
  if (placed.length !== model.tables.length || new Set(placed).size !== model.tables.length) {
    failures.push(`the ${fixtureName} split placed ${placed.length} tables, ${new Set(placed).size} of them distinct, expected ${model.tables.length}`);
  }
}

function checkThirtyTables() {
  const { model } = schemaModel(readJson(THIRTY_TABLES));
  const plan = stubPlan(model, 'first');
  const sizes = plan.diagrams.map((diagram) => diagram.tables.length);
  if (JSON.stringify(sizes) !== JSON.stringify(EXPECTED_PART_SIZES) || plan.problems.length > 0) {
    failures.push(`the 30-table split gave parts ${JSON.stringify(sizes)} with ${plan.problems.length} problems, expected ${JSON.stringify(EXPECTED_PART_SIZES)}`);
  }
  expectEveryTableOnce('30-table', plan, model);
  expectPartsWithoutStubs('30-table fixture', plan);
  const limits = layoutLimits(theme);
  for (const diagram of plan.diagrams) {
    const { svg } = renderDiagram({ ordinal: diagram.number, layout: 'dagre', source: diagram.source }, theme, { workDirectory, launcherPath: FAKE_LAUNCHER });
    const problems = diagramSizeProblems({ ordinal: diagram.number, layout: 'dagre', source: diagram.source }, svgSizeMeasurement(svg), limits);
    if (problems.length > 0) failures.push(`part ${diagram.number} fails the checks: ${problems.map((problem) => problem.message).join('; ')}`);
  }
  const domainOf = new Map(model.tables.map((table) => [table.name, table.domain]));
  for (const [index, domain] of ['billing', 'catalog', 'identity'].entries()) {
    const tables = plan.diagrams[index]?.tables ?? [];
    if (!tables.every((table) => domainOf.get(table) === domain)) failures.push(`part ${index + 1} is not the ${domain} domain: ${JSON.stringify(tables)}`);
  }
  const again = stubPlan(model, 'second');
  if (JSON.stringify(again.diagrams) !== JSON.stringify(plan.diagrams)) failures.push('two splits of the same schema differ');
}

function checkHubsAndSpokes() {
  const { model, problems } = schemaModel(hubsAndSpokesSchema());
  if (problems.length > 0) failures.push(`the hubs-and-spokes fixture is not a valid schema: ${problems.map((problem) => problem.message).join('; ')}`);
  for (const [hub, expected] of Object.entries(HUB_INCOMING_FOREIGN_KEYS)) {
    const incoming = model.relations.filter((relation) => relation.to.table === hub).length;
    if (incoming !== expected) failures.push(`the hub ${hub} takes ${incoming} foreign keys, expected ${expected}`);
  }
  const plan = stubPlan(model, 'hubs');
  if (plan.problems.length > 0) failures.push(`the hubs-and-spokes split reported ${plan.problems.map((problem) => problem.message).join('; ')}`);
  expectEveryTableOnce('hubs-and-spokes', plan, model);
  expectPartsWithoutStubs('hubs-and-spokes fixture', plan);
  if (!plan.diagrams.some((diagram) => JSON.stringify(diagram.tables) === JSON.stringify(HOLIDAY_TABLES))) {
    failures.push(`the holidays domain is not one part: ${JSON.stringify(plan.diagrams.filter((diagram) => diagram.tables.some((table) => HOLIDAY_TABLES.includes(table))).map((diagram) => diagram.tables))}`);
  }
  const domainOf = new Map(model.tables.map((table) => [table.name, table.domain]));
  for (const domain of new Set(domainOf.values())) {
    const domainParts = plan.diagrams.filter((diagram) => domainOf.get(diagram.tables[0]) === domain);
    const earlySingle = domainParts.slice(0, -1).find((diagram) => diagram.tables.length === 1);
    if (earlySingle !== undefined) failures.push(`the ${domain} domain left ${earlySingle.tables[0]} alone before its last part`);
  }
}

function checkMeasuredWithDagre() {
  const renders = existsSync(launcherLog) ? readFileSync(launcherLog, 'utf8').split('\n').filter((line) => line !== '') : [];
  if (renders.length === 0) failures.push('the launcher stub logged no render of a part');
  const otherLayouts = renders.filter((line) => !line.includes('--layout dagre'));
  if (otherLayouts.length > 0) failures.push(`${otherLayouts.length} of ${renders.length} part renders were not measured with dagre: ${otherLayouts[0]}`);
}

function wideTableModel(tableColumns) {
  const table = { name: 'quiz_category_questions', columns: tableColumns };
  const relation = { from: { table: table.name, column: 'parent_quiz_category_question_id' }, to: { table: table.name, column: 'id' }, cardinality: 'many-to-one' };
  return schemaModel({ tables: [table], relations: [relation] }).model;
}

function checkSingleTableRemedies() {
  const serviceColumns = [{ name: 'created_at', type: 'timestamp' }, { name: 'updated_at', type: 'timestamp' }];
  const tallWithService = { tables: [{ name: 'huge', columns: [...Array.from({ length: 68 }, (_, index) => ({ name: `column_${index}`, type: 'text' })), ...serviceColumns] }] };
  const afterServiceHidden = stubPlan(schemaModel(tallWithService).model, 'service-hidden', { hideServiceColumns: true });
  const tooTall = afterServiceHidden.problems.find((problem) => problem.code === 'DIAGRAM-TOO-TALL' && problem.message.includes('table huge alone'));
  if (tooTall === undefined) {
    failures.push(`a table too tall alone was not refused with DIAGRAM-TOO-TALL: ${JSON.stringify(afterServiceHidden.problems.map((problem) => problem.message))}`);
  } else {
    expectIncludes('the remedy after --hide-service-columns', tooTall.remedy, '--key-columns');
    expectExcludes('the remedy after --hide-service-columns', tooTall.remedy, '--hide-service-columns');
  }
  const allUnique = { tables: [{ name: 'unique_codes', columns: Array.from({ length: 70 }, (_, index) => ({ name: `code_${index}`, type: 'text', unique: true })) }] };
  const keysOnly = stubPlan(schemaModel(allUnique).model, 'keys-only', { keyColumns: true });
  const nothingToHide = keysOnly.problems.find((problem) => problem.code === 'DIAGRAM-TOO-TALL' && problem.message.includes('table unique_codes alone'));
  if (nothingToHide === undefined) {
    failures.push(`a table of 70 keys was not refused with DIAGRAM-TOO-TALL: ${JSON.stringify(keysOnly.problems.map((problem) => problem.message))}`);
  } else {
    for (const flag of ['--key-columns', '--hide-service-columns']) expectExcludes('the remedy of a table of keys', nothingToHide.remedy, flag);
    for (const expected of ['it keeps 70 columns', '--tables']) expectIncludes('the remedy of a table of keys', nothingToHide.remedy, expected);
  }
  const keyIsLongest = wideTableModel([{ name: 'id', type: 'bigint', primaryKey: true }, { name: 'parent_quiz_category_question_id', type: 'bigint' }, { name: 'status', type: 'varchar' }]);
  const keyRemedy = singleTableRemedy(keyIsLongest.tables[0], 'DIAGRAM-TOO-WIDE', relationEndColumns(keyIsLongest), {});
  for (const flag of ['--key-columns', '--hide-service-columns']) expectExcludes('the remedy of a table whose longest row is a key', keyRemedy, flag);
  expectIncludes('the remedy of a table whose longest row is a key', keyRemedy, 'its longest row is "parent_quiz_category_question_id: bigint → quiz_category_questions"');
  const notesAreLongest = wideTableModel([
    { name: 'id', type: 'bigint', primaryKey: true },
    { name: 'parent_quiz_category_question_id', type: 'bigint' },
    { name: 'explanation_shown_to_the_player_after_a_wrong_answer_to_this_question', type: 'text' },
  ]);
  const notesRemedy = singleTableRemedy(notesAreLongest.tables[0], 'DIAGRAM-TOO-WIDE', relationEndColumns(notesAreLongest), {});
  expectIncludes('the remedy of a table whose longest row is not a key', notesRemedy, '--key-columns');
  expectExcludes('the remedy of a table whose longest row is not a key', notesRemedy, '--hide-service-columns');
}

function runErd(bundle, commandArguments) {
  return spawnSync('/bin/sh', [join(bundle, 'bin', 'figura'), 'erd', ...commandArguments], { cwd: workDirectory, env: { ...process.env, HOME: workDirectory }, encoding: 'utf8' });
}

function writtenSources(outName) {
  return readdirSync(join(workDirectory, outName))
    .sort()
    .map((file) => readFileSync(join(workDirectory, outName, file), 'utf8'))
    .join('\n');
}

function checkCommand() {
  const bundle = join(workDirectory, 'figura');
  cpSync(join(REPO_ROOT, 'figura'), bundle, { recursive: true });
  copyFileSync(FAKE_LAUNCHER, join(bundle, 'bin', 'launch.sh'));
  chmodSync(join(bundle, 'bin', 'launch.sh'), 0o755);
  const full = runErd(bundle, ['--source', 'manual', THIRTY_TABLES, '--out', 'erd-out']);
  const files = readdirSync(join(workDirectory, 'erd-out')).sort();
  if (full.status !== 0 || !full.stdout.startsWith('figura: wrote 6 ERD diagrams to erd-out for pre.d2 blocks with data-layout="dagre" — erd-01.d2 (4 tables)') || files.length !== 6) {
    failures.push(`figura erd exited ${full.status} with ${JSON.stringify(full.stdout)} and ${files.length} files: ${full.stderr.trim()}`);
  }
  const again = runErd(bundle, ['--source', 'manual', THIRTY_TABLES, '--out', 'erd-again']);
  if (again.status !== 0 || writtenSources('erd-again') !== writtenSources('erd-out')) failures.push('two runs of figura erd wrote different parts');
  const hidden = runErd(bundle, ['--source', 'manual', THIRTY_TABLES, '--out', 'erd-hidden', '--hide-service-columns']);
  const hiddenSources = writtenSources('erd-hidden');
  if (hidden.status !== 0 || hiddenSources.includes('"created_at"') || hiddenSources.includes('"updated_at"')) failures.push('figura erd --hide-service-columns kept a service column');
  const keys = runErd(bundle, ['--source', 'manual', THIRTY_TABLES, '--out', 'erd-keys', '--key-columns']);
  const keySources = writtenSources('erd-keys');
  if (keys.status !== 0 || keySources.includes('"display_name"') || keySources.includes('"total_cents"') || !keySources.includes('"sku": "text" {constraint: unique}')) {
    failures.push(`figura erd --key-columns did not keep only the key columns: ${keys.stdout}${keys.stderr}`);
  }
  const subset = runErd(bundle, ['--source', 'manual', THIRTY_TABLES, '--out', 'erd-subset', '--tables', 'accounts,sessions']);
  if (subset.status !== 0 || !subset.stdout.includes('wrote 1 ERD diagram to erd-subset for pre.d2 blocks with data-layout="dagre" — erd-01.d2 (2 tables)')) {
    failures.push(`figura erd --tables gave: ${subset.stdout}${subset.stderr}`);
  }
  const unsupported = runErd(bundle, ['--source', 'mystery', THIRTY_TABLES, '--out', 'erd-none']);
  if (unsupported.status !== 2) failures.push(`figura erd with an unknown source exited ${unsupported.status}, expected 2`);
}

try {
  process.env.FIGURA_FAKE_LAUNCHER_LOG = launcherLog;
  checkModelErrors();
  checkD2(schemaModel(readJson(REFERENCE_SCHEMA)).model);
  checkThirtyTables();
  checkHubsAndSpokes();
  checkMeasuredWithDagre();
  checkSingleTableRemedies();
  delete process.env.FIGURA_FAKE_LAUNCHER_LOG;
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
  'figura erd check passed: model errors are named; keys, unique columns, cardinality, domains and foreign keys that name their table reach D2; key columns only and a subset keep the foreign key targets; the 30-table and hubs-and-spokes fixtures split into dagre-measured parts that grow inside their domain without stub boxes; single-table remedies follow the flags and the measured cause; output is deterministic, and figura erd writes the parts.',
);
