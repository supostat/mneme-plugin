#!/usr/bin/env node
// Proves that a guard catches what it claims to catch: every mutation from the module is written
// into the real file, the guard must go red with the expected named line, and the original comes
// back in a finally. Run from the repository root:
//
//   node scripts/prove-guard-mutations.mjs <mutations.mjs>
//
// The module exports `guard` (the guard's argv) and `mutations`, a list of
// { label, file, find, replace, expect, within?, all? }: `find` must occur exactly once (or at
// least once with `all: true`), only inside the paragraph that `within` opens when it is given;
// `expect` is a substring of the guard's named stderr line. The guard must be green before and after
// the mutations, every mutated file reads back byte for byte, and git sees the same tree at the
// end. An interrupt (Ctrl+C, SIGTERM) or a guard past GUARD_TIMEOUT_MS still restores the file in
// flight before anything else happens. Exit 0 — every mutation PROVEN; 1 — a mutation FAILED, the
// guard was red before or after, or the tree changed; 2 — a malformed call; 130 — interrupted.

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const USAGE = 'usage: node scripts/prove-guard-mutations.mjs <mutations.mjs> (the module exports guard and mutations)';
const GUARD_TIMEOUT_MS = 300_000;
const INTERRUPT_SIGNALS = ['SIGINT', 'SIGTERM'];

for (const signal of INTERRUPT_SIGNALS) {
  process.on(signal, () => {
    process.exitCode = 130;
  });
}

const exitWith = (code, lines) => {
  for (const line of lines) (code === 0 ? console.log : console.error)(line);
  process.exit(code);
};

const isNonEmptyString = (value) => typeof value === 'string' && value !== '';

const malformedMutation = (mutation) => {
  if (!isNonEmptyString(mutation?.label)) return 'a mutation without a label';
  for (const field of ['file', 'find', 'expect']) {
    if (!isNonEmptyString(mutation[field])) return `${mutation.label}: «${field}» must be a non-empty string`;
  }
  if (typeof mutation.replace !== 'string') return `${mutation.label}: «replace» must be a string`;
  if (mutation.within !== undefined && !(mutation.within instanceof RegExp)) return `${mutation.label}: «within» must be a RegExp`;
  if (mutation.all !== undefined && typeof mutation.all !== 'boolean') return `${mutation.label}: «all» must be a boolean`;
  return null;
};

const modulePath = process.argv[2];
if (!isNonEmptyString(modulePath)) exitWith(2, [USAGE]);
let mutationModule;
try {
  mutationModule = await import(pathToFileURL(resolve(modulePath)).href);
} catch (error) {
  exitWith(2, [`${modulePath}: cannot load the mutation module: ${error.message.split('\n')[0]}`, USAGE]);
}
const { guard, mutations } = mutationModule;
if (!Array.isArray(guard) || guard.length === 0 || !guard.every(isNonEmptyString)) {
  exitWith(2, [`${modulePath}: «guard» must be a non-empty argv array`, USAGE]);
}
if (!Array.isArray(mutations) || mutations.length === 0) {
  exitWith(2, [`${modulePath}: «mutations» must be a non-empty list`, USAGE]);
}
const malformed = mutations.map(malformedMutation).filter(Boolean);
if (malformed.length > 0) exitWith(2, malformed.map((problem) => `${modulePath}: ${problem}`));

const runGuard = () => spawnSync(guard[0], guard.slice(1), { encoding: 'utf8', timeout: GUARD_TIMEOUT_MS });

const guardStartFailure = (guardRun) =>
  guardRun.error !== undefined && guardRun.error.code !== 'ETIMEDOUT' ? guardRun.error.message : null;

const guardFailureReason = (guardRun) => {
  if (guardRun.error?.code === 'ETIMEDOUT') return `timed out after ${GUARD_TIMEOUT_MS / 1000} s`;
  return firstLineOf(guardRun.stderr ?? '') || (guardRun.signal === null ? `exit ${guardRun.status}` : `killed by ${guardRun.signal}`);
};

const wasInterrupted = (guardRun) => INTERRUPT_SIGNALS.includes(guardRun.signal) && guardRun.error === undefined;

const gitTreeSnapshot = () =>
  [['status', '--porcelain'], ['diff', '--stat']]
    .map((gitArguments) => {
      const result = spawnSync('git', gitArguments, { encoding: 'utf8' });
      if (result.status !== 0) exitWith(2, [`git ${gitArguments.join(' ')} failed: ${result.stderr.trim()}`]);
      return result.stdout;
    })
    .join('\n');

const firstLineOf = (text) => text.split('\n').map((line) => line.trim()).find(Boolean) ?? '';

const paragraphBounds = (text, within) => {
  const start = text.search(within);
  if (start === -1) return null;
  const blankLine = /\r?\n[ \t]*\r?\n/.exec(text.slice(start));
  return { start, end: blankLine === null ? text.length : start + blankLine.index };
};

const mutatedText = (text, { find, replace, within, all }) => {
  const bounds = within === undefined ? { start: 0, end: text.length } : paragraphBounds(text, within);
  if (bounds === null) return { problem: `no paragraph opens with ${within}` };
  const scope = text.slice(bounds.start, bounds.end);
  const occurrences = scope.split(find).length - 1;
  const where = within === undefined ? '' : ` in the paragraph ${within}`;
  if (occurrences === 0) return { problem: `anchor «${find}» not found${where}` };
  if (occurrences > 1 && all !== true) {
    return { problem: `anchor «${find}» occurs ${occurrences} times${where} — narrow it or set all: true` };
  }
  const mutatedScope = all === true ? scope.split(find).join(replace) : scope.replace(find, () => replace);
  return { text: text.slice(0, bounds.start) + mutatedScope + text.slice(bounds.end) };
};

const verdictOf = (mutation, guardRun) => {
  if (guardRun.status === 0) return `FAILED ${mutation.label}: stayed green`;
  const namedLine = guardRun.stderr.split('\n').find((line) => line.includes(mutation.expect));
  if (guardRun.status === 1 && namedLine !== undefined) return `PROVEN ${mutation.label}: ${namedLine.trim()}`;
  return `FAILED ${mutation.label}: red for another reason: ${guardFailureReason(guardRun)}`;
};

const baseline = runGuard();
if (guardStartFailure(baseline) !== null) exitWith(2, [`${guard.join(' ')} cannot start: ${guardStartFailure(baseline)}`]);
if (baseline.status !== 0) {
  exitWith(1, [`baseline red: ${guard.join(' ')} fails before any mutation: ${guardFailureReason(baseline)}`]);
}
const treeBefore = gitTreeSnapshot();

const verdicts = [];
const problems = [];
for (const mutation of mutations) {
  let original;
  try {
    original = readFileSync(mutation.file, 'utf8');
  } catch (error) {
    verdicts.push(`FAILED ${mutation.label}: cannot read ${mutation.file}: ${error.message}`);
    continue;
  }
  const mutated = mutatedText(original, mutation);
  if (mutated.problem !== undefined) {
    verdicts.push(`FAILED ${mutation.label}: ${mutated.problem}`);
    continue;
  }
  let guardRun;
  try {
    writeFileSync(mutation.file, mutated.text);
    guardRun = runGuard();
  } finally {
    writeFileSync(mutation.file, original);
  }
  if (readFileSync(mutation.file, 'utf8') !== original) problems.push(`${mutation.file} did not read back byte for byte after ${mutation.label}`);
  if (wasInterrupted(guardRun)) exitWith(130, [`interrupted during «${mutation.label}» — ${mutation.file} restored, the remaining mutations not run`]);
  verdicts.push(verdictOf(mutation, guardRun));
}

problems.unshift(...verdicts.filter((verdict) => verdict.startsWith('FAILED')));
const afterwards = runGuard();
if (afterwards.status !== 0) problems.push(`guard red after the mutations were restored: ${guardFailureReason(afterwards)}`);
if (gitTreeSnapshot() !== treeBefore) problems.push('the working tree differs from the one before the mutations');

for (const verdict of verdicts) console.log(verdict);
if (problems.length > 0) exitWith(1, [`${problems.length} problem(s) — the guard is not proven:`, ...problems.map((problem) => `  - ${problem}`)]);
console.log(`all ${mutations.length} mutations proven against ${guard.join(' ')}; guard green and tree unchanged afterwards`);
