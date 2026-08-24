#!/usr/bin/env node
//
// Behavior + anchor test for the TOKEN-LINE machinery (spec-session-tokens).
//
// BEHAVIOR part (--behavior, and always): drives the REAL plugin/scripts/session-tokens.mjs
// against fixtures GENERATED into the OS tmpdir (never into the repo tree), asserting every
// degradation and the incremental byte-offset cache:
//   (1) normal tail → the literal format line with correct numbers;
//   (2) transcript with no usage anywhere → «окно: н/д — пустой usage»;
//   (3) missing transcript dir → «окно: н/д — транскрипт не найден»;
//   (4) two jsonl with mtimes ≤300s apart → «окно: н/д — две активные сессии», and the
//       positive control (>300s apart) → the normal line (the freshest file wins);
//   (5) cold run == hot run (sums identical, so the cache never skews the numbers);
//   (6) an appended fixture is read FROM THE OFFSET (cache offset === file size after run);
//   (7) a truncated fixture triggers a full recompute (numbers match the new content).
// The exit code of the script under test must be 0 in EVERY case — fail-open is the contract.
//
// ANCHOR part (default mode, added by the wire phase): norm + replicas greps over the real
// SKILL.md files. Until the wire phase lands it, default mode runs the behavior part only.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/ (same rule as the other check-*).
//
// Usage: node scripts/check-session-tokens.mjs [--behavior]

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scriptUnderTest = join(repoRoot, 'plugin', 'scripts', 'session-tokens.mjs');
const fixtureRoot = join(tmpdir(), `mneme-session-tokens-check-${process.pid}-${Date.now()}`);
const uniq = `${process.pid}-${Date.now()}`;

const failures = [];

function usageLine(input, output, cacheRead, cacheCreation) {
  return `${JSON.stringify({
    type: 'assistant',
    message: {
      usage: {
        input_tokens: input,
        output_tokens: output,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheCreation,
      },
    },
  })}\n`;
}

const noUsageLine = `${JSON.stringify({ type: 'user', message: { content: 'hi' } })}\n`;

let fixtureCounter = 0;
function makeProject(name) {
  fixtureCounter += 1;
  const cwd = `/fixture/${name}-${process.pid}-${Date.now()}-${fixtureCounter}`;
  const transcriptDir = join(fixtureRoot, cwd.replace(/[/.]/g, '-'));
  mkdirSync(transcriptDir, { recursive: true });
  return { cwd, transcriptDir };
}

function runScript(cwd) {
  const result = spawnSync('node', [scriptUnderTest, '--cwd', cwd, '--projects-dir', fixtureRoot], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    failures.push(`fail-open broken: exit ${result.status} for --cwd ${cwd} (stderr: ${result.stderr.trim()})`);
  }
  return result.stdout.trim();
}

function expect(caseName, actual, expected) {
  if (actual !== expected) {
    failures.push(`${caseName}: expected "${expected}", got "${actual}"`);
  }
}

function setMtime(path, msAgo) {
  const seconds = (Date.now() - msAgo) / 1000;
  utimesSync(path, seconds, seconds);
}

// (1) normal tail: window = last usage input+cache_read+cache_creation; session = Σin / Σout
{
  const { cwd, transcriptDir } = makeProject('normal');
  const transcript = join(transcriptDir, `session-normal-${uniq}.jsonl`);
  writeFileSync(
    transcript,
    noUsageLine + usageLine(40_000, 5_000, 0, 0) + usageLine(12_000, 4_000, 100_000, 2_000) + usageLine(2, 255, 150_000, 18_000),
  );
  expect('normal-tail', runScript(cwd), '≈168k в окне · сессия 52k in / 9k out');
}

// (2) transcript with no usage anywhere
{
  const { cwd, transcriptDir } = makeProject('no-usage');
  writeFileSync(join(transcriptDir, `session-empty-${uniq}.jsonl`), noUsageLine + noUsageLine);
  expect('empty-usage', runScript(cwd), 'окно: н/д — пустой usage');
}

// (3) missing transcript dir
{
  expect('missing-transcript', runScript(`/fixture/never-created-${process.pid}`), 'окно: н/д — транскрипт не найден');
}

// (4) two active sessions (mtimes ≤300s apart) degrade; >300s apart → freshest wins
{
  const { cwd, transcriptDir } = makeProject('parallel');
  const fresh = join(transcriptDir, `session-fresh-${uniq}.jsonl`);
  const stale = join(transcriptDir, `session-stale-${uniq}.jsonl`);
  writeFileSync(fresh, usageLine(1_000, 2_000, 3_000, 0));
  writeFileSync(stale, usageLine(9_000_000, 9_000_000, 0, 0));
  setMtime(fresh, 0);
  setMtime(stale, 100_000);
  expect('two-active-sessions', runScript(cwd), 'окно: н/д — две активные сессии');
  setMtime(stale, 400_000);
  expect('freshest-wins', runScript(cwd), '≈4k в окне · сессия 1k in / 2k out');
}

// (5) cold run == hot run
{
  const { cwd, transcriptDir } = makeProject('cold-hot');
  writeFileSync(join(transcriptDir, `session-coldhot-${uniq}.jsonl`), usageLine(30_000, 7_000, 60_000, 1_000));
  const cold = runScript(cwd);
  const hot = runScript(cwd);
  expect('cold-equals-hot', hot, cold);
  expect('cold-run-format', cold, '≈91k в окне · сессия 30k in / 7k out');
}

// (6) appended fixture is read from the offset; cache offset lands on the file size
{
  const { cwd, transcriptDir } = makeProject('append');
  const transcript = join(transcriptDir, `session-append-${uniq}.jsonl`);
  writeFileSync(transcript, usageLine(10_000, 3_000, 20_000, 0));
  expect('append-before', runScript(cwd), '≈30k в окне · сессия 10k in / 3k out');
  appendFileSync(transcript, usageLine(5_000, 2_000, 40_000, 1_000));
  expect('append-after', runScript(cwd), '≈46k в окне · сессия 15k in / 5k out');
  const cache = JSON.parse(readFileSync(join(tmpdir(), `mneme-session-tokens-session-append-${uniq}.jsonl.json`), 'utf8'));
  const fileSize = readFileSync(transcript, 'utf8').length;
  if (cache.offset !== fileSize) {
    failures.push(`append-offset: cache offset ${cache.offset} != file size ${fileSize} — increment was not consumed from the offset`);
  }
}

// (7) truncated fixture (size < offset) triggers a full recompute
{
  const { cwd, transcriptDir } = makeProject('truncate');
  const transcript = join(transcriptDir, `session-truncate-${uniq}.jsonl`);
  writeFileSync(transcript, usageLine(50_000, 9_000, 0, 0) + usageLine(50_000, 9_000, 0, 0));
  runScript(cwd);
  writeFileSync(transcript, usageLine(1_000, 500, 2_000, 0));
  expect('truncate-recompute', runScript(cwd), '≈3k в окне · сессия 1k in / 1k out');
}

rmSync(fixtureRoot, { recursive: true, force: true });

const behaviorOnly = process.argv.includes('--behavior');
if (!behaviorOnly) {
  // Anchor checks over the real SKILL.md files are added by the wire phase.
}

if (failures.length > 0) {
  console.error('check-session-tokens FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`check-session-tokens OK (behavior: 7 cases${behaviorOnly ? '' : ', anchors: pending wire phase'})`);
