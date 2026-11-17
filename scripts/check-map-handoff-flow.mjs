#!/usr/bin/env node
//
// End-to-end of the map hand-over on real git and the real plugin/scripts/project-graph.mjs: dev's
// MAP-HANDOFF diff rule and the map's --since select the same sections before and after the run's
// commit, a stamp after the commit leaves nothing touched, and a stamp taken over uncommitted files
// surfaces again — the case COMMIT-FIRST and COMMIT-WAIT exist for. The git commands run here are
// the literals dev's MAP-HANDOFF and map's Step 1 state.
//
// Usage: node scripts/check-map-handoff-flow.mjs   (also runs as part of npm test)

import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const graphScript = join(repoRoot, 'plugin', 'scripts', 'project-graph.mjs');
const fixtureRoot = join(repoRoot, 'scripts', 'fixtures', 'graph-project');
const devMapHandoff = sectionOf(join(repoRoot, 'plugin', 'skills', 'dev', 'SKILL.md'), '### MAP-HANDOFF');
const mapStepOne = sectionOf(join(repoRoot, 'plugin', 'skills', 'map', 'SKILL.md'), '### Step 1:');
const scratch = mkdtempSync(join(tmpdir(), 'mneme-check-map-handoff-flow-'));

const DIFF_SINCE = ['diff', '--name-only'];
const UNTRACKED_LISTING = ['ls-files', '--others', '--exclude-standard'];
const RULE_LITERALS = [`git ${DIFF_SINCE.join(' ')} <commit>`, `git ${UNTRACKED_LISTING.join(' ')}`];
const RUN_COMMITTED_EDIT = 'app/models/invoice.rb';
const LAST_PHASE_EDIT = 'app/services/access/grant.rb';
const LAST_PHASE_NEW_FILE = 'app/services/billing/refund.rb';

const isolatedGitEnvironment = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'check-map-handoff-flow',
  GIT_AUTHOR_EMAIL: 'check-map-handoff-flow@example.invalid',
  GIT_COMMITTER_NAME: 'check-map-handoff-flow',
  GIT_COMMITTER_EMAIL: 'check-map-handoff-flow@example.invalid',
};

const failures = [];

function sectionOf(path, heading) {
  const text = readFileSync(path, 'utf8');
  const start = text.indexOf(`\n${heading}`);
  if (start === -1) return '';
  const end = text.indexOf('\n### ', start + 1);
  return text.slice(start, end === -1 ? undefined : end).replace(/\s+/g, ' ');
}

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: isolatedGitEnvironment });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr.trim()}`);
  return result.stdout;
}

function lines(output) {
  return output.split('\n').filter((line) => line !== '');
}

function commit(repo, message) {
  git(repo, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message);
  return git(repo, 'rev-parse', 'HEAD').trim();
}

function changedSince(repo, stamp) {
  return new Set([...lines(git(repo, ...DIFF_SINCE, stamp)), ...lines(git(repo, ...UNTRACKED_LISTING))]);
}

function covers(anchor, path) {
  return path === anchor || path.startsWith(`${anchor}/`);
}

function touchedSections(sections, changed) {
  return sections
    .filter((section) => [...changed].some((path) => section.anchors.some((anchor) => covers(anchor, path))))
    .map((section) => section.id)
    .sort();
}

function graphSince(repo, stamp, name) {
  const out = join(scratch, `${name}.json`);
  const result = spawnSync('node', [graphScript, '--root', repo, '--since', stamp, '--out', out], {
    encoding: 'utf8',
    env: isolatedGitEnvironment,
  });
  if (result.status !== 0) throw new Error(`project-graph --since ${stamp} exited ${result.status}: ${result.stderr.trim()}`);
  return JSON.parse(readFileSync(out, 'utf8')).clusters;
}

function fullGraph(repo) {
  const out = join(scratch, 'full.json');
  const result = spawnSync('node', [graphScript, '--root', repo, '--out', out], { encoding: 'utf8', env: isolatedGitEnvironment });
  if (result.status !== 0) throw new Error(`project-graph exited ${result.status}: ${result.stderr.trim()}`);
  return JSON.parse(readFileSync(out, 'utf8')).clusters;
}

function expectSame(step, what, actual, expected) {
  if (actual.join(',') !== expected.join(',')) {
    failures.push(`flow-${step}: ${what} [${actual.join(', ')}], expected [${expected.join(', ')}]`);
  }
}

try {
  const repo = join(scratch, 'project');
  cpSync(fixtureRoot, repo, { recursive: true });
  git(repo, 'init', '-q');
  git(repo, 'add', '-A');
  const stamp = commit(repo, 'map written');
  const sections = fullGraph(repo).map((cluster) => ({ id: cluster.id, anchors: cluster.draft.anchors }));
  const allSectionIds = sections.map((section) => section.id).sort();

  appendFileSync(join(repo, RUN_COMMITTED_EDIT), '\n# committed work of the run\n');
  git(repo, 'add', '--', RUN_COMMITTED_EDIT);
  const runCommit = commit(repo, 'run phase');

  appendFileSync(join(repo, LAST_PHASE_EDIT), '\n# last phase, not committed\n');
  writeFileSync(join(repo, LAST_PHASE_NEW_FILE), 'module Billing\n  class Refund\n  end\nend\n');

  const touchedBeforeCommit = touchedSections(sections, changedSince(repo, stamp));
  expectSame(4, 'dev touches', touchedBeforeCommit, allSectionIds);
  const uncommitted = [...changedSince(repo, 'HEAD')].sort();
  expectSame(4, 'uncommitted paths', uncommitted, [LAST_PHASE_EDIT, LAST_PHASE_NEW_FILE].sort());

  const selectedBeforeCommit = graphSince(repo, stamp, 'before-commit');
  expectSame(5, 'map selects', selectedBeforeCommit.map((cluster) => cluster.id).sort(), touchedBeforeCommit);
  const waiting = selectedBeforeCommit.flatMap((cluster) => cluster.uncommitted_files).sort();
  expectSame(5, 'uncommitted_files', waiting, uncommitted);

  git(repo, 'add', '--', ...uncommitted);
  const handoverCommit = commit(repo, 'last phase committed by COMMIT-FIRST');
  expectSame(6, 'dev touches after the commit', touchedSections(sections, changedSince(repo, stamp)), touchedBeforeCommit);
  expectSame(6, 'uncommitted paths after the commit', [...changedSince(repo, 'HEAD')], []);
  const selectedAfterCommit = graphSince(repo, stamp, 'after-commit');
  expectSame(6, 'map selects after the commit', selectedAfterCommit.map((cluster) => cluster.id).sort(), touchedBeforeCommit);
  expectSame(6, 'uncommitted_files after the commit', selectedAfterCommit.flatMap((cluster) => cluster.uncommitted_files), []);

  expectSame(7, 'dev touches after a stamp at the commit', touchedSections(sections, changedSince(repo, handoverCommit)), []);
  expectSame(7, 'map selects after a stamp at the commit', graphSince(repo, handoverCommit, 'stamp-at-commit').map((cluster) => cluster.id), []);

  const resurfaced = graphSince(repo, runCommit, 'stamp-over-uncommitted').map((cluster) => cluster.id).sort();
  expectSame(8, 'a stamp taken over uncommitted files re-selects', resurfaced, allSectionIds);

  for (const literal of RULE_LITERALS) {
    if (!devMapHandoff.includes(literal)) failures.push(`flow-9: dev's MAP-HANDOFF does not run «${literal}» — this check runs a rule the skill does not state`);
    if (!mapStepOne.includes(literal)) failures.push(`flow-9: map's Step 1 does not state «${literal}» — this check runs a rule the skill does not state`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('check-map-handoff-flow FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('check-map-handoff-flow OK (dev\'s diff rule and the map\'s --since agree before and after the run\'s commit, a stamp at the commit touches nothing, a stamp over uncommitted files resurfaces)');
