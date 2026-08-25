#!/usr/bin/env node
//
// Behavior + anchor test for the TOKEN-LINE / RUN-COST machinery (spec-session-tokens,
// spec-run-cost).
//
// BEHAVIOR part (--behavior, and always): drives the REAL plugin/scripts/session-tokens.mjs
// against fixtures GENERATED into the OS tmpdir (never into the repo tree), asserting every
// degradation, the incremental byte-offset cache, the message.id dedup, the main-model window
// filter and the mark/delta run-cost modes:
//   (1) normal tail → the literal menu line with correct window, denominator and percent;
//   (2) transcript with no usage anywhere → «окно: н/д — пустой usage»;
//   (3) missing transcript dir → «окно: н/д — транскрипт не найден»;
//   (4) two jsonl with mtimes ≤300s apart → «окно: н/д — две активные сессии», and the
//       positive control (>300s apart) → the normal line (the freshest file wins);
//   (5) cold run == hot run (sums identical, so the cache never skews the numbers);
//   (6) an appended fixture is read FROM THE OFFSET (cache offset === file size after run);
//   (7) a truncated fixture triggers a full recompute (numbers match the new content);
//   (8) duplicate lines of one message.id count ONCE (delta shows deduped out and turns);
//   (9) a trailing record of ANOTHER model does not steal the window — the MAIN model
//       (most unique messages) provides lastUsage, denominator and percent;
//  (10) an unknown model prints the window with NO denominator (honest degradation);
//  (11) --mark is silent; a later --delta prints exactly the marked-to-now differences;
//  (12) subagents/agent-*.jsonl output is deduped and reported as its own figure;
//  (13) a v1-schema cache (no schema field) triggers a cold recompute, never a failure;
//  (14) --label signs the delta line; (15) --label signs the degradation base too;
//  (16) no --label keeps the historic «прогон» prefix byte for byte.
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

function usageLine(messageId, model, input, output, cacheRead, cacheCreation) {
  return `${JSON.stringify({
    type: 'assistant',
    message: {
      id: messageId,
      model,
      usage: {
        input_tokens: input,
        output_tokens: output,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheCreation,
      },
    },
  })}\n`;
}

const FABLE = 'claude-fable-5';
const noUsageLine = `${JSON.stringify({ type: 'user', message: { content: 'hi' } })}\n`;

let fixtureCounter = 0;
function makeProject(name) {
  fixtureCounter += 1;
  const cwd = `/fixture/${name}-${process.pid}-${Date.now()}-${fixtureCounter}`;
  const transcriptDir = join(fixtureRoot, cwd.replace(/[/.]/g, '-'));
  mkdirSync(transcriptDir, { recursive: true });
  return { cwd, transcriptDir };
}

function runScript(cwd, ...extraArgs) {
  const result = spawnSync(
    'node',
    [scriptUnderTest, '--cwd', cwd, '--projects-dir', fixtureRoot, ...extraArgs],
    { encoding: 'utf8' },
  );
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

// (1) normal tail: window = MAIN model's lastUsage input+cache_read+cache_creation, /limit · %
{
  const { cwd, transcriptDir } = makeProject('normal');
  const transcript = join(transcriptDir, `session-normal-${uniq}.jsonl`);
  writeFileSync(
    transcript,
    noUsageLine +
      usageLine('msg-n1', FABLE, 40_000, 5_000, 0, 0) +
      usageLine('msg-n2', FABLE, 12_000, 4_000, 100_000, 2_000) +
      usageLine('msg-n3', FABLE, 2, 255, 150_000, 18_000),
  );
  expect('normal-tail', runScript(cwd), 'контекст ≈168k/1M · 17%');
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
  writeFileSync(fresh, usageLine('msg-p1', FABLE, 1_000, 2_000, 3_000, 0));
  writeFileSync(stale, usageLine('msg-p2', FABLE, 9_000_000, 9_000_000, 0, 0));
  setMtime(fresh, 0);
  setMtime(stale, 100_000);
  expect('two-active-sessions', runScript(cwd), 'окно: н/д — две активные сессии');
  setMtime(stale, 400_000);
  expect('freshest-wins', runScript(cwd), 'контекст ≈4k/1M · 0%');
}

// (5) cold run == hot run
{
  const { cwd, transcriptDir } = makeProject('cold-hot');
  writeFileSync(join(transcriptDir, `session-coldhot-${uniq}.jsonl`), usageLine('msg-c1', FABLE, 30_000, 7_000, 60_000, 1_000));
  const cold = runScript(cwd);
  const hot = runScript(cwd);
  expect('cold-equals-hot', hot, cold);
  expect('cold-run-format', cold, 'контекст ≈91k/1M · 9%');
}

// (6) appended fixture is read from the offset; cache offset lands on the file size
{
  const { cwd, transcriptDir } = makeProject('append');
  const transcript = join(transcriptDir, `session-append-${uniq}.jsonl`);
  writeFileSync(transcript, usageLine('msg-a1', FABLE, 10_000, 3_000, 20_000, 0));
  expect('append-before', runScript(cwd), 'контекст ≈30k/1M · 3%');
  appendFileSync(transcript, usageLine('msg-a2', FABLE, 5_000, 2_000, 40_000, 1_000));
  expect('append-after', runScript(cwd), 'контекст ≈46k/1M · 5%');
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
  writeFileSync(transcript, usageLine('msg-t1', FABLE, 50_000, 9_000, 0, 0) + usageLine('msg-t2', FABLE, 50_000, 9_000, 0, 0));
  runScript(cwd);
  writeFileSync(transcript, usageLine('msg-t3', FABLE, 1_000, 500, 2_000, 0));
  expect('truncate-recompute', runScript(cwd), 'контекст ≈3k/1M · 0%');
}

// (8) message.id dedup: duplicate streaming lines of one message count ONCE (out AND turns)
{
  const { cwd, transcriptDir } = makeProject('dedup');
  const duplicated = usageLine('msg-d1', FABLE, 2, 4_000, 10_000, 0);
  writeFileSync(
    join(transcriptDir, `session-dedup-${uniq}.jsonl`),
    duplicated + duplicated + duplicated + usageLine('msg-d2', FABLE, 2, 1_000, 15_000, 0),
  );
  expect('dedup-delta', runScript(cwd, '--delta', 'run-none'), 'прогон (с начала текущей сессии) ~5k out · 2 турн');
}

// (9) main-model window: a trailing auxiliary record of another model does not steal lastUsage
{
  const { cwd, transcriptDir } = makeProject('main-model');
  writeFileSync(
    join(transcriptDir, `session-mainmodel-${uniq}.jsonl`),
    usageLine('msg-m1', FABLE, 2, 3_000, 100_000, 5_000) +
      usageLine('msg-m2', FABLE, 2, 4_000, 500_000, 74_000) +
      usageLine('msg-m3', 'claude-opus-5', 2, 641, 24_606, 50_266),
  );
  expect('main-model-window', runScript(cwd), 'контекст ≈574k/1M · 57%');
}

// (10) unknown model: window with NO denominator — a degradation, never a guessed limit
{
  const { cwd, transcriptDir } = makeProject('unknown-model');
  writeFileSync(join(transcriptDir, `session-unknown-${uniq}.jsonl`), usageLine('msg-u1', 'mystery-model-9', 1_000, 500, 3_000, 0));
  expect('unknown-model', runScript(cwd), 'контекст ≈4k');
}

// (11) mark → append → delta: --mark is silent, --delta prints the differences since the mark
{
  const { cwd, transcriptDir } = makeProject('mark-delta');
  const transcript = join(transcriptDir, `session-markdelta-${uniq}.jsonl`);
  writeFileSync(transcript, usageLine('msg-k1', FABLE, 2, 3_000, 10_000, 0));
  expect('mark-silent', runScript(cwd, '--mark', 'run-x'), '');
  appendFileSync(transcript, usageLine('msg-k2', FABLE, 2, 2_000, 20_000, 0));
  expect('delta-after-mark', runScript(cwd, '--delta', 'run-x'), 'прогон ~2k out · 1 турн');
}

// (12) subagents: deduped Σoutput of <session>/subagents/agent-*.jsonl as a SEPARATE figure
{
  const { cwd, transcriptDir } = makeProject('subagents');
  const sessionName = `session-sub-${uniq}`;
  writeFileSync(join(transcriptDir, `${sessionName}.jsonl`), usageLine('msg-s1', FABLE, 2, 1_000, 5_000, 0));
  const subagentsDir = join(transcriptDir, sessionName, 'subagents');
  mkdirSync(subagentsDir, { recursive: true });
  const duplicated = usageLine('msg-sa1', FABLE, 2, 5_000, 0, 0);
  writeFileSync(join(subagentsDir, 'agent-a.jsonl'), duplicated + duplicated + usageLine('msg-sa2', FABLE, 2, 7_000, 0, 0));
  expect(
    'subagents-delta',
    runScript(cwd, '--delta', 'run-none'),
    'прогон (с начала текущей сессии) ~1k out · 1 турн · субагенты 12k out',
  );
}

// (14) --label signs the delta line: «допрос ~Xk out · N турн» after a mark
{
  const { cwd, transcriptDir } = makeProject('label-mark');
  const transcript = join(transcriptDir, `session-labelmark-${uniq}.jsonl`);
  writeFileSync(transcript, usageLine('msg-l1', FABLE, 2, 3_000, 10_000, 0));
  expect('label-mark-silent', runScript(cwd, '--mark', 'grill-topic'), '');
  appendFileSync(transcript, usageLine('msg-l2', FABLE, 2, 2_000, 20_000, 0));
  expect('label-delta-after-mark', runScript(cwd, '--delta', 'grill-topic', '--label', 'допрос'), 'допрос ~2k out · 1 турн');
}

// (15) --label signs the degradation base too: «допрос (с начала текущей сессии) …»
{
  const { cwd, transcriptDir } = makeProject('label-nomark');
  writeFileSync(join(transcriptDir, `session-labelnomark-${uniq}.jsonl`), usageLine('msg-n1', FABLE, 2, 4_000, 10_000, 0));
  expect(
    'label-delta-without-mark',
    runScript(cwd, '--delta', 'grill-missing', '--label', 'допрос'),
    'допрос (с начала текущей сессии) ~4k out · 1 турн',
  );
}

// (16) no --label → the historic «прогон» prefix, byte for byte (regression)
{
  const { cwd, transcriptDir } = makeProject('label-absent');
  writeFileSync(join(transcriptDir, `session-labelabsent-${uniq}.jsonl`), usageLine('msg-r1', FABLE, 2, 6_000, 10_000, 0));
  expect('no-label-regression', runScript(cwd, '--delta', 'run-none'), 'прогон (с начала текущей сессии) ~6k out · 1 турн');
}

// (13) v1-schema cache (no schema field) triggers a cold recompute, never a failure
{
  const { cwd, transcriptDir } = makeProject('v1-cache');
  const transcript = join(transcriptDir, `session-v1cache-${uniq}.jsonl`);
  writeFileSync(transcript, usageLine('msg-v1', FABLE, 1_000, 500, 2_000, 0));
  writeFileSync(
    join(tmpdir(), `mneme-session-tokens-session-v1cache-${uniq}.jsonl.json`),
    JSON.stringify({ offset: 0, input: 999_000, output: 999_000, cacheRead: 0, cacheCreation: 0, lastUsage: null }),
  );
  expect('v1-cache-recompute', runScript(cwd), 'контекст ≈3k/1M · 0%');
}

rmSync(fixtureRoot, { recursive: true, force: true });

const behaviorOnly = process.argv.includes('--behavior');
if (!behaviorOnly) {
  const skillText = (name) => readFileSync(join(repoRoot, 'plugin', 'skills', name, 'SKILL.md'), 'utf8');
  const REPLICA_SKILLS = ['plan', 'fix', 'migrate', 'setup', 'design', 'grill-agent'];

  // Shared anchor lines: present in the dev norm AND in every replica, byte-for-byte (the
  // diverged-replica detector, the check-skill-handoff (d) pattern).
  const SHARED_ANCHORS = [
    'scripts/session-tokens.mjs --cwd',
    'контекст ≈574k/1M · 57%',
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

  // RUN-COST norm: the mark/delta modes belong to the BEARERS registry — every bearer must
  // carry its own replica (section + literal call anchors), and only bearers may mention the
  // modes at all (the guard below).
  const RUN_COST_BEARERS = ['dev', 'grill-agent'];
  if (!dev.includes('### RUN-COST')) {
    failures.push('dev: the RUN-COST norm section (### RUN-COST) is missing');
  }
  if (!/^- RUN-COST — /m.test(dev)) {
    failures.push('dev: the RUN-COST bullet is missing from the Rules section');
  }
  if (!dev.includes('RUN_COST_BEARERS')) {
    failures.push('dev: the norm does not name the RUN_COST_BEARERS registry');
  }
  const RUN_COST_ANCHORS = {
    dev: [
      '--mark <run_id>',
      '--delta <run_id>',
      'прогон ~46k out · 31 турн · субагенты 12k out',
      'прогон (с начала текущей сессии)',
    ],
    'grill-agent': [
      '--mark grill-',
      '--delta grill-',
      '--label допрос',
      'раундов N · failed K',
      'допрос (с начала текущей сессии)',
    ],
  };
  for (const bearer of RUN_COST_BEARERS) {
    const text = skillText(bearer);
    if (!text.includes('### RUN-COST')) {
      failures.push(`${bearer}: bearer without its own ### RUN-COST replica section`);
    }
    for (const anchor of RUN_COST_ANCHORS[bearer]) {
      if (!text.includes(anchor)) failures.push(`${bearer}: RUN-COST anchor "${anchor}" is missing`);
    }
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

  // Retired-format guard: the old two-figure sample («≈Xk в окне · сессия Yk in / Zk out»)
  // must be GONE from the runtime corpus — it was the defect's carrier (a cumulative figure
  // with no decision question next to the window figure provoked misreading).
  for (const name of ['dev', ...REPLICA_SKILLS]) {
    const match = skillText(name).match(/в окне · сессия|сессия \d+k in \/ \d+k out/);
    if (match) failures.push(`${name}: retired two-figure format sample still present ("${match[0]}")`);
  }

  // RUN-COST stays with the bearers: a mark/delta mention in a NON-bearer menu skill is dead
  // text AND breaks the «read-only session-tokens call» carve-out truth (--mark writes the
  // cache). Bearers are exempt — their replicas are anchor-checked above instead.
  for (const name of REPLICA_SKILLS.filter((skill) => !RUN_COST_BEARERS.includes(skill))) {
    const match = skillText(name).match(/--mark|--delta|RUN-COST/);
    if (match) failures.push(`${name}: RUN-COST mention outside the bearers registry ("${match[0]}")`);
  }
}

if (failures.length > 0) {
  console.error('check-session-tokens FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`check-session-tokens OK (behavior: 16 cases${behaviorOnly ? '' : ', anchors: norm + RUN-COST + 6 replicas + carve-outs + negation guards'})`);
