#!/usr/bin/env node
//
// Gate for figura's ERD sources: one storefront schema written as Prisma, TypeORM entities,
// schema.rb and a recorded psql catalog gives one model and, through the real erd-d2, one D2; the
// erd command writes the same parts from every source; a psql stub on PATH proves the password
// stays out of psql's arguments and figura's stdout and stderr, a missing psql stops with
// PSQL-NOT-FOUND, and TypeORM declarations the parser does not model are named in a warning.

import { spawnSync } from 'node:child_process';
import { accessSync, chmodSync, constants, copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { erdD2 } from '../figura/scripts/erd-d2.mjs';
import { schemaModel } from '../figura/scripts/erd-model.mjs';
import { readPrismaSchema } from '../figura/scripts/erd-source-prisma.mjs';
import { postgresConnection, readPostgresSchema } from '../figura/scripts/erd-source-psql.mjs';
import { readRailsSchema } from '../figura/scripts/erd-source-rails.mjs';
import { readTypeormSchema } from '../figura/scripts/erd-source-typeorm.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(REPO_ROOT, 'scripts', 'fixtures', 'figura');
const SCHEMAS = join(FIXTURES, 'schemas');
const FAKE_PSQL = join(FIXTURES, 'fake-psql.sh');
const FAKE_LAUNCHER = join(FIXTURES, 'fake-launcher.sh');
const FILE_SOURCES = [
  ['prisma', join(SCHEMAS, 'schema.prisma'), readPrismaSchema],
  ['typeorm', join(SCHEMAS, 'typeorm'), readTypeormSchema],
  ['rails', join(SCHEMAS, 'schema.rb'), readRailsSchema],
];
const ENCODED_PASSWORD = 's3cr%40t-pass';
const PASSWORD = 's3cr@t-pass';
const ADDRESS = `postgresql://storefront:${ENCODED_PASSWORD}@db.internal:5432/storefront?sslmode=require`;
const ADDRESS_WITHOUT_PASSWORD = 'postgresql://storefront@db.internal:5432/storefront?sslmode=require';
const SECRETS = [ENCODED_PASSWORD, PASSWORD, ADDRESS, ADDRESS_WITHOUT_PASSWORD];
const PSQL_FLAGS = ['-X', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1'];
const COMMAND_TOOLS = ['node', 'dirname', 'grep', 'head', 'cut'];
const EXPECTED_D2_LINES = [
  '"role": "account_role"',
  '"email": "varchar(320)" {constraint: unique}',
  '"placed_at": "timestamptz"',
  '"price": "numeric(10,2)"',
  '"metadata": "jsonb"',
  '"created_at": "timestamp"',
  '"account_id": "uuid → accounts" {constraint: [foreign_key; unique]}',
  '"order_id": "uuid → orders" {constraint: [primary_key; foreign_key]}',
  '"A": "bigint → products" {constraint: [primary_key; foreign_key]}',
  '"credentials"."account_id" -> "accounts"."id": {source-arrowhead.shape: cf-one; target-arrowhead.shape: cf-one}',
  '"categories"."parent_id" -> "categories"."id": {source-arrowhead.shape: cf-many; target-arrowhead.shape: cf-one}',
  '"_ProductToTag"."B" -> "tags"."id": {source-arrowhead.shape: cf-many; target-arrowhead.shape: cf-one}',
];
const failures = [];
const workDirectory = mkdtempSync(join(tmpdir(), 'figura-erd-sources-check-'));
const psqlCall = join(workDirectory, 'psql-call');
const stubBin = join(workDirectory, 'stub-bin');
const stubEnvironment = {
  ...process.env,
  HOME: workDirectory,
  PATH: `${stubBin}${delimiter}${process.env.PATH}`,
  FIGURA_FAKE_PSQL_CATALOG: join(SCHEMAS, 'psql-catalog.json'),
  FIGURA_FAKE_PSQL_CALL: psqlCall,
};

function byKey(key) {
  return (first, second) => (key(first) < key(second) ? -1 : key(first) > key(second) ? 1 : 0);
}

function canonicalModel(model) {
  const relationKey = (relation) => `${relation.from.table}.${relation.from.column}>${relation.to.table}.${relation.to.column}`;
  return JSON.stringify({ tables: [...model.tables].sort(byKey((table) => table.name)), relations: [...model.relations].sort(byKey(relationKey)) }, null, 1);
}

function firstDifference(text, reference) {
  const lines = text.split('\n');
  const referenceLines = reference.split('\n');
  const index = lines.findIndex((line, lineIndex) => line !== referenceLines[lineIndex]);
  return `line ${index + 1}: ${JSON.stringify(lines[index])} against ${JSON.stringify(referenceLines[index])}`;
}

function leakedSecrets(text) {
  return SECRETS.filter((secret) => text.includes(secret));
}

function sourceResult(name, read) {
  const { schema, warnings } = read();
  const { model, problems } = schemaModel(schema);
  if (problems.length + warnings.length > 0) failures.push(`the ${name} source reported ${[...problems, ...warnings].map((problem) => problem.message).join('; ')}`);
  return { name, model, canonical: canonicalModel(model), d2: erdD2(model, model.tables.map((table) => table.name)) };
}

function checkSourcesAgree() {
  const database = sourceResult('psql', () => readPostgresSchema(postgresConnection(ADDRESS), { environment: stubEnvironment }));
  for (const [name, path, read] of FILE_SOURCES) {
    const result = sourceResult(name, () => read(path));
    if (result.canonical !== database.canonical) failures.push(`the ${name} model differs from the psql model at ${firstDifference(result.canonical, database.canonical)}`);
    if (result.d2 !== database.d2) failures.push(`the ${name} D2 differs from the psql D2 at ${firstDifference(result.d2, database.d2)}`);
  }
  if (database.model.tables.length !== 8 || database.model.relations.length !== 8) {
    failures.push(`the storefront schema gave ${database.model.tables.length} tables and ${database.model.relations.length} relations, expected 8 and 8`);
  }
  for (const line of EXPECTED_D2_LINES) if (!database.d2.includes(line)) failures.push(`the storefront D2 lacks ${JSON.stringify(line)}`);
  const nullability = (table, column) => database.model.tables.find((candidate) => candidate.name === table)?.columns.find((candidate) => candidate.name === column)?.nullable;
  if (nullability('accounts', 'display_name') !== true || nullability('orders', 'account_id') !== false) failures.push('the psql catalog lost the nullability of its columns');
}

function checkPsqlCall() {
  const argumentsSeen = readFileSync(psqlCall, 'utf8').split('\n');
  const missingFlags = PSQL_FLAGS.filter((flag) => !argumentsSeen.includes(flag));
  if (missingFlags.length > 0) failures.push(`psql ran without ${missingFlags.join(' ')}`);
  if (!argumentsSeen.includes(ADDRESS_WITHOUT_PASSWORD)) failures.push('psql did not get the address without its password');
  if ([ENCODED_PASSWORD, PASSWORD].some((secret) => argumentsSeen.join('\n').includes(secret))) failures.push('the password reached the arguments of psql');
  if (readFileSync(`${psqlCall}.password`, 'utf8').trim() !== PASSWORD) failures.push('psql did not get the decoded password in PGPASSWORD');
}

function findOnCurrentPath(tool) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    try {
      accessSync(join(directory, tool), constants.X_OK);
      return join(directory, tool);
    } catch {
      continue;
    }
  }
  return undefined;
}

function toolsWithoutPsql() {
  const directory = join(workDirectory, 'tools-without-psql');
  mkdirSync(directory);
  for (const tool of COMMAND_TOOLS) {
    const toolPath = tool === 'node' ? process.execPath : findOnCurrentPath(tool);
    if (toolPath === undefined) failures.push(`the gate needs ${tool} on PATH`);
    else symlinkSync(toolPath, join(directory, tool));
  }
  return directory;
}

function runErd(bundle, commandArguments, environment) {
  return spawnSync('/bin/sh', [join(bundle, 'bin', 'figura'), 'erd', ...commandArguments], { cwd: workDirectory, env: environment, encoding: 'utf8' });
}

function writtenParts(outName) {
  const directory = join(workDirectory, outName);
  return readdirSync(directory)
    .sort()
    .map((file) => `${file}\n${readFileSync(join(directory, file), 'utf8')}`)
    .join('\n');
}

function expectRun(caseName, run, { status, stdoutIncludes = [], stderrIncludes = [] }) {
  const output = `${run.stdout}${run.stderr}`;
  if (run.status !== status) failures.push(`${caseName} exited ${run.status}, expected ${status}: ${output.trim()}`);
  for (const expected of stdoutIncludes) if (!run.stdout.includes(expected)) failures.push(`${caseName} printed no ${JSON.stringify(expected)} on stdout: ${run.stdout.trim()}`);
  for (const expected of stderrIncludes) if (!run.stderr.includes(expected)) failures.push(`${caseName} printed no ${JSON.stringify(expected)} on stderr: ${run.stderr.trim()}`);
  const leaks = leakedSecrets(output);
  if (leaks.length > 0) failures.push(`${caseName} leaked ${leaks.length} secret ${leaks.length === 1 ? 'string' : 'strings'} of the database address`);
}

function checkCommand() {
  const bundle = join(workDirectory, 'figura');
  cpSync(join(REPO_ROOT, 'figura'), bundle, { recursive: true });
  copyFileSync(FAKE_LAUNCHER, join(bundle, 'bin', 'launch.sh'));
  chmodSync(join(bundle, 'bin', 'launch.sh'), 0o755);
  const withoutAddress = Object.fromEntries(Object.entries(stubEnvironment).filter(([name]) => name !== 'DATABASE_URL'));

  const byUrl = runErd(bundle, ['--source', 'psql', '--url', ADDRESS, '--out', 'out-psql'], withoutAddress);
  expectRun('figura erd --source psql --url', byUrl, { status: 0, stdoutIncludes: ['figura: wrote ', '; 0 warnings'] });
  const byEnvironment = runErd(bundle, ['--source', 'psql', '--out', 'out-psql-environment'], { ...withoutAddress, DATABASE_URL: ADDRESS });
  expectRun('figura erd --source psql with DATABASE_URL', byEnvironment, { status: 0, stdoutIncludes: ['figura: wrote '] });
  const databaseParts = writtenParts('out-psql');
  for (const [name, path] of FILE_SOURCES) {
    const run = runErd(bundle, ['--source', name, path, '--out', `out-${name}`], withoutAddress);
    expectRun(`figura erd --source ${name}`, run, { status: 0, stdoutIncludes: ['figura: wrote ', '; 0 warnings'] });
    if (run.status === 0 && writtenParts(`out-${name}`) !== databaseParts) failures.push(`figura erd --source ${name} wrote other parts than --source psql`);
  }

  const refused = runErd(bundle, ['--source', 'psql', '--url', ADDRESS, '--out', 'out-refused'], { ...withoutAddress, FIGURA_FAKE_PSQL_FAILURE: '1' });
  expectRun('figura erd --source psql against a refusing server', refused, { status: 1, stderrIncludes: ['figura: --url FAILED:', 'PSQL-FAILED: psql exited with status 2', '[redacted]'] });
  const withoutPsql = runErd(bundle, ['--source', 'psql', '--out', 'out-without-psql'], { HOME: workDirectory, PATH: toolsWithoutPsql(), DATABASE_URL: ADDRESS });
  expectRun('figura erd --source psql without psql', withoutPsql, {
    status: 1,
    stderrIncludes: ['figura: DATABASE_URL FAILED:', 'PSQL-NOT-FOUND: psql is not on PATH', 'apt install postgresql-client'],
  });
  const noAddress = runErd(bundle, ['--source', 'psql', '--out', 'out-no-address'], withoutAddress);
  expectRun('figura erd --source psql without an address', noAddress, { status: 2, stderrIncludes: ['needs a postgres:// or postgresql:// URL in --url or DATABASE_URL'] });
  const urlForFile = runErd(bundle, ['--source', 'prisma', join(SCHEMAS, 'schema.prisma'), '--url', ADDRESS, '--out', 'out-mixed'], withoutAddress);
  expectRun('figura erd --source prisma --url', urlForFile, { status: 2 });

  const partialPath = join(SCHEMAS, 'typeorm-partial');
  const partial = runErd(bundle, ['--source', 'typeorm', partialPath, '--out', 'out-partial'], withoutAddress);
  expectRun('figura erd --source typeorm with unsupported declarations', partial, {
    status: 0,
    stdoutIncludes: ['; 1 warning'],
    stderrIncludes: [
      `figura: ${partialPath} WARNING:`,
      'TYPEORM-UNSUPPORTED: the parser left out 3 declarations it does not model',
      'Ledger (extends AuditTrail, which the parser did not find)',
      'Ledger.version (@VersionColumn)',
      'Ledger.parent (@TreeParent)',
    ],
  });
}

function checkTypeormDefaults() {
  const { schema } = readTypeormSchema(join(SCHEMAS, 'typeorm-partial'));
  const summary = schema.tables.map((table) => `${table.name}(${table.columns.map((column) => column.name).join(',')})`).join(' ');
  const expected = 'holder(id) ledger(id,ownerId) ledger_auditors_holder(ledgerId,holderId)';
  if (summary !== expected) failures.push(`TypeORM default naming gave ${summary}, expected ${expected}`);
}

function checkInvalidSources() {
  const brokenPrisma = join(workDirectory, 'broken.prisma');
  writeFileSync(brokenPrisma, 'model Broken {\n  id Int @id\n  shape Polygon\n}\n');
  const railsDirectory = join(workDirectory, 'db');
  mkdirSync(railsDirectory);
  writeFileSync(join(railsDirectory, 'schema.rb'), readFileSync(join(SCHEMAS, 'schema.rb')));
  writeFileSync(join(railsDirectory, 'seeds.rb'), 'Account.create!(email: "ada@example.com")\n');
  const expectInvalid = (caseName, read, expectedText) => {
    try {
      read();
      failures.push(`${caseName} was accepted`);
    } catch (error) {
      if (error.code !== 'ERD-INVALID' || !error.message.includes(expectedText)) failures.push(`${caseName} failed with ${error.message}, expected ERD-INVALID naming "${expectedText}"`);
    }
  };
  expectInvalid('a Prisma field of an unknown type', () => readPrismaSchema(brokenPrisma), 'model Broken field shape has the unknown type Polygon');
  expectInvalid('a missing schema.rb', () => readRailsSchema(join(workDirectory, 'missing', 'schema.rb')), 'cannot read');
  expectInvalid('a directory of Ruby files', () => readRailsSchema(railsDirectory), 'pass the db/schema.rb file itself');
  if (postgresConnection('mysql://storefront:secret@db.internal/storefront') !== undefined) failures.push('a mysql:// address passed for a postgres URL');
}

try {
  mkdirSync(stubBin);
  copyFileSync(FAKE_PSQL, join(stubBin, 'psql'));
  chmodSync(join(stubBin, 'psql'), 0o755);
  checkSourcesAgree();
  checkPsqlCall();
  checkTypeormDefaults();
  checkInvalidSources();
  checkCommand();
} catch (error) {
  failures.push(`the ERD sources threw: ${error.stack ?? error.message}`);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('figura erd sources check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'figura erd sources check passed: Prisma, TypeORM, schema.rb and the psql catalog give one model and one D2, the erd command writes the same parts from each, the password stays out of psql arguments and every output, a missing psql stops with PSQL-NOT-FOUND, and unsupported TypeORM declarations are named in a warning.',
);
