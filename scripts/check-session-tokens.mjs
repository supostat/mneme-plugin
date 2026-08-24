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
// ANCHOR part (default mode only): greps over the REAL SKILL.md files — the norm in dev, the
// five replicas (plan, fix, migrate, setup, design), the Bash carve-out and frontmatter grant in
// each replica skill, shared anchor lines that must not diverge between norm and replicas, and a
// negation guard: text that weakens fail-open («задержать меню», «троттлинг»/throttling) fails.
// The search corpus is the six SKILL.md files ONLY — never this checker, its fixtures, or the
// docs/ specs (the self-match trap: the spec legitimately DISCUSSES the rejected throttling).
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
  const skillText = (name) => readFileSync(join(repoRoot, 'plugin', 'skills', name, 'SKILL.md'), 'utf8');
  const REPLICA_SKILLS = ['plan', 'fix', 'migrate', 'setup', 'design'];

  // Shared anchor lines: present in the dev norm AND in every replica, byte-for-byte (the
  // diverged-replica detector, the check-skill-handoff (d) pattern).
  const SHARED_ANCHORS = [
    'scripts/session-tokens.mjs --cwd',
    '≈168k в окне · сессия 52k in / 9k out',
    'окно: н/д',
  ];

  const dev = skillText('dev');
  if (!dev.includes('### TOKEN-LINE')) {
    failures.push('dev: the TOKEN-LINE norm section (### TOKEN-LINE) is missing from OUTPUT-GRAMMAR');
  }
  if (!/^- TOKEN-LINE — /m.test(dev)) {
    failures.push('dev: the TOKEN-LINE bullet is missing from the Rules section');
  }
  for (const anchor of SHARED_ANCHORS) {
    if (!dev.includes(anchor)) failures.push(`dev: norm anchor line "${anchor}" is missing`);
  }

  for (const name of REPLICA_SKILLS) {
    const text = skillText(name);
    if (!text.includes('TOKEN-LINE — compact replica')) {
      failures.push(`${name}: the TOKEN-LINE compact replica is missing`);
      continue;
    }
    for (const anchor of SHARED_ANCHORS) {
      if (!text.includes(anchor)) failures.push(`${name}: replica anchor line "${anchor}" diverged or is missing`);
    }
    const frontmatter = text.slice(0, text.indexOf('\n---', 3));
    if (!/allowed-tools:.*\bBash\b/.test(frontmatter)) {
      failures.push(`${name}: allowed-tools frontmatter carries no Bash — the replica's call is mechanically impossible`);
    }
    const permissionsStart = text.indexOf('## Permissions');
    const permissions = permissionsStart === -1 ? '' : text.slice(permissionsStart, text.indexOf('\n## ', permissionsStart + 1));
    if (permissionsStart === -1) {
      failures.push(`${name}: no ## Permissions section found`);
    } else if (!permissions.includes('session-tokens')) {
      failures.push(`${name}: Permissions carries no session-tokens carve-out — the grant lives in prose AND frontmatter, both`);
    }
  }

  // Negation guard (the check-skill-handoff (e)/(g) pattern): a replica must not weaken
  // fail-open. Word-boundary matching where morphology could false-positive (\b lesson).
  const WEAKENERS = [
    { pattern: /задержать меню|задерживает меню|может задержать/i, label: 'menu-delay wording' },
    { pattern: /троттлинг|\bthrottl/i, label: 'throttling wording' },
    { pattern: /TOKEN-LINE (опционал|optional)/i, label: 'optional-TOKEN-LINE wording' },
  ];
  for (const name of ['dev', ...REPLICA_SKILLS]) {
    const text = skillText(name);
    for (const { pattern, label } of WEAKENERS) {
      const match = text.match(pattern);
      if (match) failures.push(`${name}: negation guard — fail-open-weakening ${label} ("${match[0]}")`);
    }
  }
}

if (failures.length > 0) {
  console.error('check-session-tokens FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`check-session-tokens OK (behavior: 7 cases${behaviorOnly ? '' : ', anchors: norm + 5 replicas + carve-outs + negation guard'})`);
