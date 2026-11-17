#!/usr/bin/env node
//
// Gate of the project map's plugin side (spec-map-plugin, phase map-skill): the real
// plugin/scripts/project-graph.mjs against its two fixtures (Ruby and TypeScript in graph-project,
// Dart in graph-dart), a temporary git history, a dirty working tree over a stamp commit, a
// repository without commits, a non-git directory and this repository itself, plus the
// load-bearing anchors of plugin/skills/map/SKILL.md.
//
// Usage: node scripts/check-map.mjs   (also runs as part of npm test)

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const graphScript = join(repoRoot, 'plugin', 'scripts', 'project-graph.mjs');
const fixtureRoot = join(repoRoot, 'scripts', 'fixtures', 'graph-project');
const dartFixtureRoot = join(repoRoot, 'scripts', 'fixtures', 'graph-dart');
const skillPath = join(repoRoot, 'plugin', 'skills', 'map', 'SKILL.md');
const scratch = mkdtempSync(join(tmpdir(), 'mneme-check-map-'));

const EXIT_MISMATCH = 1;
const EXIT_USAGE = 2;
const GRAPH_EXTENSIONS = new Set(['rb', 'erb', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'dart']);
const SECTION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_TERMS = 24;
const MAX_TERM_LENGTH = 32;
const PLUGIN_CODE_DIRECTORY = 'plugin/scripts';
const REPO_TOOLING_DIRECTORY = 'scripts';
const SKILL_ANCHORS = [
  'The project map is empty.',
  '`1 — принять`',
  '`2 — переименовать`',
  '`3 — слить с <соседний домен>`',
  '`4 — отклонить`',
  '`5 — показать целиком`',
  'ни один раздел не пишется без цифры',
  '`map/`',
  '`INDEX.md`',
  '`glossary.md`',
  '--since',
  '3000',
  '24',
  '32',
  'Index not rebuilt:',
  'не повторять',
];
const ISOLATED_GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'check-map',
  GIT_AUTHOR_EMAIL: 'check-map@example.invalid',
  GIT_COMMITTER_NAME: 'check-map',
  GIT_COMMITTER_EMAIL: 'check-map@example.invalid',
};

const failures = [];

function runGraph(...args) {
  return spawnSync('node', [graphScript, ...args], { encoding: 'utf8', env: ISOLATED_GIT_ENV });
}

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: ISOLATED_GIT_ENV });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr.trim()}`);
  return result.stdout;
}

function expectExit(caseName, result, expectedStatus) {
  if (result.status !== expectedStatus) {
    failures.push(`${caseName}: exit ${result.status}, expected ${expectedStatus} (stderr: ${result.stderr.trim()})`);
    return false;
  }
  return true;
}

function readGraph(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function codePoints(text) {
  return Array.from(text).length;
}

// (a) both fixtures match their stored expectations, and a wrong expectation is refused
{
  expectExit('fixture-expect', runGraph('--root', fixtureRoot, '--expect', join(fixtureRoot, 'expected.json')), 0);
  expectExit('fixture-dart-expect', runGraph('--root', dartFixtureRoot, '--expect', join(dartFixtureRoot, 'expected.json')), 0);
  expectExit(
    'fixture-expect-changed',
    runGraph('--root', fixtureRoot, '--changed', 'app/models/invoice.rb', '--expect', join(fixtureRoot, 'expected-changed.json')),
    0,
  );
  const wrongExpectation = readGraph(join(fixtureRoot, 'expected.json'));
  wrongExpectation.clusters[0].files = [];
  const wrongPath = join(scratch, 'wrong-expected.json');
  writeFileSync(wrongPath, JSON.stringify(wrongExpectation));
  const refused = runGraph('--root', fixtureRoot, '--expect', wrongPath);
  if (expectExit('fixture-expect-wrong', refused, EXIT_MISMATCH) && !refused.stderr.includes('clusters')) {
    failures.push(`fixture-expect-wrong: the mismatch names no path (stderr: ${refused.stderr.trim()})`);
  }
}

// (b) --since on a temporary git history: one commit over the fixture touching invoice.rb → billing only
{
  const temporaryRepo = join(scratch, 'since-repo');
  cpSync(fixtureRoot, temporaryRepo, { recursive: true });
  git(temporaryRepo, 'init', '-q');
  git(temporaryRepo, 'add', '-A');
  git(temporaryRepo, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'base');
  appendFileSync(join(temporaryRepo, 'app', 'models', 'invoice.rb'), "\nInvoice.class_eval { def paid?; true; end }\n");
  git(temporaryRepo, 'add', '-A');
  git(temporaryRepo, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'touch invoice');
  const out = join(scratch, 'since.json');
  if (expectExit('since-temporary-git', runGraph('--root', temporaryRepo, '--since', 'HEAD~1', '--out', out), 0)) {
    const clusterIds = readGraph(out).clusters.map((cluster) => cluster.id);
    if (clusterIds.join(',') !== 'billing') {
      failures.push(`since-temporary-git: clusters [${clusterIds.join(', ')}], expected only billing`);
    }
    const changed = readGraph(out).clusters[0]?.changed_files ?? [];
    if (changed.join(',') !== 'app/models/invoice.rb') {
      failures.push(`since-temporary-git: changed_files [${changed.join(', ')}], expected app/models/invoice.rb`);
    }
  }
}

// (b2) the working tree counts: a stamp commit, a later commit, then unstaged, staged, untracked,
// ignored and deleted files on top — each kind is expected in (or out of) changed_files and
// uncommitted_files by its own named line
{
  const worktreeRepo = join(scratch, 'worktree-repo');
  cpSync(fixtureRoot, worktreeRepo, { recursive: true });
  git(worktreeRepo, 'init', '-q');
  git(worktreeRepo, 'add', '-A');
  git(worktreeRepo, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'stamp');
  const stamp = git(worktreeRepo, 'rev-parse', 'HEAD').trim();
  appendFileSync(join(worktreeRepo, 'app', 'models', 'invoice.rb'), '\n# committed in the later commit\n');
  git(worktreeRepo, 'add', '-A');
  git(worktreeRepo, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'later commit');
  const laterCommit = git(worktreeRepo, 'rev-parse', 'HEAD').trim();
  appendFileSync(join(worktreeRepo, 'app', 'services', 'billing', 'ledger.rb'), '\n# unstaged edit\n');
  appendFileSync(join(worktreeRepo, 'app', 'models', 'user.rb'), '\n# staged edit\n');
  git(worktreeRepo, 'add', 'app/models/user.rb');
  writeFileSync(join(worktreeRepo, 'app', 'services', 'billing', 'refund.rb'), 'module Billing\n  class Refund\n  end\nend\n');
  writeFileSync(join(worktreeRepo, '.gitignore'), 'app/services/billing/scratch.rb\n');
  writeFileSync(join(worktreeRepo, 'app', 'services', 'billing', 'scratch.rb'), 'module Billing\n  class Scratch\n  end\nend\n');
  rmSync(join(worktreeRepo, 'frontend', 'apps', 'Billing', 'store.ts'));

  const kindOf = new Map([
    ['app/models/invoice.rb', 'committed in the later commit'],
    ['app/services/billing/ledger.rb', 'unstaged edit'],
    ['app/models/user.rb', 'staged edit'],
    ['app/services/billing/refund.rb', 'untracked file'],
    ['app/services/billing/scratch.rb', 'ignored file'],
    ['frontend/apps/Billing/store.ts', 'deleted file'],
  ]);
  const described = (file) => `${file} (${kindOf.get(file) ?? 'untouched file'})`;
  const compareFiles = (caseName, cluster, field, expected) => {
    const actual = cluster[field] ?? [];
    for (const file of expected.filter((path) => !actual.includes(path))) {
      failures.push(`${caseName}: ${described(file)} missing from ${field} of ${cluster.id}`);
    }
    for (const file of actual.filter((path) => !expected.includes(path))) {
      failures.push(`${caseName}: ${described(file)} wrongly in ${field} of ${cluster.id}`);
    }
  };
  const compareClusters = (caseName, graph, expectations) => {
    const selectedIds = new Set(graph.clusters.map((cluster) => cluster.id));
    const unselected = Object.keys(expectations)
      .filter((id) => !selectedIds.has(id))
      .map((id) => ({ id, changed_files: [], uncommitted_files: [] }));
    for (const cluster of [...graph.clusters, ...unselected]) {
      const expected = expectations[cluster.id] ?? { changed: [], uncommitted: [] };
      compareFiles(caseName, cluster, 'changed_files', expected.changed);
      compareFiles(caseName, cluster, 'uncommitted_files', expected.uncommitted);
    }
  };

  const sinceOut = join(scratch, 'worktree-since.json');
  if (expectExit('since-worktree', runGraph('--root', worktreeRepo, '--since', stamp, '--out', sinceOut), 0)) {
    compareClusters('since-worktree', readGraph(sinceOut), {
      access: { changed: ['app/models/user.rb'], uncommitted: ['app/models/user.rb'] },
      billing: {
        changed: ['app/models/invoice.rb', 'app/services/billing/ledger.rb', 'app/services/billing/refund.rb'],
        uncommitted: ['app/services/billing/ledger.rb', 'app/services/billing/refund.rb'],
      },
    });
  }

  const afterStampOut = join(scratch, 'worktree-after-stamp.json');
  if (expectExit('since-after-stamp', runGraph('--root', worktreeRepo, '--since', laterCommit, '--out', afterStampOut), 0)) {
    compareClusters('since-after-stamp', readGraph(afterStampOut), {
      access: { changed: ['app/models/user.rb'], uncommitted: ['app/models/user.rb'] },
      billing: {
        changed: ['app/services/billing/ledger.rb', 'app/services/billing/refund.rb'],
        uncommitted: ['app/services/billing/ledger.rb', 'app/services/billing/refund.rb'],
      },
    });
  }

  const changedOut = join(scratch, 'worktree-changed.json');
  if (expectExit('changed-worktree', runGraph('--root', worktreeRepo, '--changed', 'app/models/invoice.rb', '--out', changedOut), 0)) {
    compareClusters('changed-worktree', readGraph(changedOut), {
      billing: {
        changed: ['app/models/invoice.rb'],
        uncommitted: ['app/services/billing/ledger.rb', 'app/services/billing/refund.rb'],
      },
    });
  }

  const primaryOut = join(scratch, 'worktree-primary.json');
  if (expectExit('primary-worktree', runGraph('--root', worktreeRepo, '--out', primaryOut), 0)) {
    for (const cluster of readGraph(primaryOut).clusters) {
      for (const field of ['changed_files', 'uncommitted_files'].filter((name) => name in cluster)) {
        failures.push(`primary-worktree: cluster ${cluster.id} carries ${field} — a primary graph is never narrowed`);
      }
    }
  }

  const badCommit = runGraph('--root', worktreeRepo, '--since', 'no-such-commit');
  const badCommitCause = 'cannot diff no-such-commit against the working tree';
  if (expectExit('since-bad-commit', badCommit, EXIT_USAGE) && !badCommit.stderr.includes(badCommitCause)) {
    failures.push(`since-bad-commit: the error does not say «${badCommitCause}» (stderr: ${badCommit.stderr.trim()})`);
  }

  const headlessRepo = join(scratch, 'headless-repo');
  cpSync(fixtureRoot, headlessRepo, { recursive: true });
  git(headlessRepo, 'init', '-q');
  const headless = runGraph('--root', headlessRepo, '--changed', 'app/models/invoice.rb');
  const headlessCause = 'cannot diff HEAD against the working tree';
  if (expectExit('headless-changed', headless, EXIT_USAGE) && !headless.stderr.includes(headlessCause)) {
    failures.push(`headless-changed: the error does not say «${headlessCause}» (stderr: ${headless.stderr.trim()})`);
  }
}

// (c) a directory outside any git repository is refused with a named error
{
  const nonGit = join(scratch, 'non-git');
  cpSync(join(fixtureRoot, 'app'), join(nonGit, 'app'), { recursive: true });
  const refused = runGraph('--root', nonGit);
  if (expectExit('non-git-root', refused, EXIT_USAGE) && !refused.stderr.includes('is not inside a git repository')) {
    failures.push(`non-git-root: the error does not name the cause (stderr: ${refused.stderr.trim()})`);
  }
}

// (d) the skill text: first step, menus, limits, forbidden files, the graph script call. Its grant,
// model-invocation key, shipped scripts and bearer calls are pinned once, by check-skill-handoff
// (j), (o), (i) and check-session-tokens.
{
  const skill = readFileSync(skillPath, 'utf8');
  for (const anchor of SKILL_ANCHORS) {
    if (!skill.includes(anchor)) failures.push(`map: anchor «${anchor}» missing`);
  }
  const firstStep = skill.match(/^### Step[^\n]*\n([\s\S]*?)(?=^### )/m);
  if (firstStep === null) {
    failures.push('map: no ### Step heading');
  } else if (!firstStep[1].includes('map_list {}')) {
    failures.push('map: the first step is not map_list {}');
  }
  if (!skill.includes('project-graph.mjs')) {
    failures.push('map: the graph script call is missing');
  }
}

// (e) the real script over this repository, and --since HEAD~1 on its real history
{
  const out = join(scratch, 'repo.json');
  if (expectExit('repo-graph', runGraph('--root', repoRoot, '--out', out), 0)) {
    const graph = readGraph(out);
    const trackedNodes = git(repoRoot, 'ls-files', '-z')
      .split('\0')
      .filter((file) => file !== '' && GRAPH_EXTENSIONS.has(file.slice(file.lastIndexOf('.') + 1)));
    const owners = new Map();
    for (const cluster of graph.clusters) {
      for (const file of cluster.files) owners.set(file, (owners.get(file) ?? 0) + 1);
    }
    for (const file of trackedNodes) {
      const count = owners.get(file) ?? 0;
      if (count !== 1) failures.push(`repo-graph: ${file} sits in ${count} clusters, expected exactly one`);
    }
    if (graph.clusters.length < 2) failures.push(`repo-graph: ${graph.clusters.length} clusters, expected at least two`);
    const hasDirectory = (directory) => graph.clusters.some((cluster) => cluster.dirs.includes(directory));
    if (!hasDirectory(PLUGIN_CODE_DIRECTORY)) failures.push(`repo-graph: no cluster holds ${PLUGIN_CODE_DIRECTORY}`);
    if (!hasDirectory(REPO_TOOLING_DIRECTORY)) failures.push(`repo-graph: no cluster holds ${REPO_TOOLING_DIRECTORY}`);
    for (const cluster of graph.clusters) {
      const draft = cluster.draft;
      if (!SECTION_ID_PATTERN.test(draft.id)) failures.push(`repo-graph: draft id "${draft.id}" is not a section slug`);
      for (const anchor of draft.anchors) {
        if (anchor.endsWith('/')) failures.push(`repo-graph: anchor "${anchor}" of ${draft.id} ends with a slash`);
      }
      if (draft.terms.length > MAX_TERMS) failures.push(`repo-graph: ${draft.id} carries ${draft.terms.length} terms, the engine holds ${MAX_TERMS}`);
      for (const term of draft.terms) {
        if (codePoints(term) > MAX_TERM_LENGTH) failures.push(`repo-graph: term "${term}" of ${draft.id} exceeds ${MAX_TERM_LENGTH} code points`);
      }
      if ('body' in draft) failures.push(`repo-graph: draft ${draft.id} carries a body — the body is the spawn's`);
    }

    const parent = spawnSync('git', ['-C', repoRoot, 'rev-parse', '--verify', '--quiet', 'HEAD~1'], { encoding: 'utf8' });
    if (parent.status !== 0) {
      console.log('check-map: --since HEAD~1 skipped — the repository has a single commit');
    } else {
      const sinceOut = join(scratch, 'repo-since.json');
      if (expectExit('repo-since', runGraph('--root', repoRoot, '--since', 'HEAD~1', '--out', sinceOut), 0)) {
        const since = readGraph(sinceOut);
        const fullIds = new Set(graph.clusters.map((cluster) => cluster.id));
        const graphNodes = new Set(graph.clusters.flatMap((cluster) => cluster.files));
        const untracked = git(repoRoot, 'ls-files', '--others', '--exclude-standard').split('\n');
        const nodesChangedSince = (commit) =>
          new Set([...git(repoRoot, 'diff', '--name-only', commit, '--').split('\n'), ...untracked].filter((file) => graphNodes.has(file)));
        const diffNodes = nodesChangedSince('HEAD~1');
        const uncommittedNodes = nodesChangedSince('HEAD');
        const changed = new Set();
        for (const cluster of since.clusters) {
          if (!fullIds.has(cluster.id)) failures.push(`repo-since: cluster ${cluster.id} is not in the full graph`);
          for (const file of cluster.changed_files ?? []) {
            changed.add(file);
            if (!diffNodes.has(file)) failures.push(`repo-since: ${file} is reported as changed but HEAD~1 and the working tree agree on it`);
          }
          for (const file of cluster.uncommitted_files ?? []) {
            if (!uncommittedNodes.has(file)) failures.push(`repo-since: ${file} is reported as uncommitted but HEAD and the working tree agree on it`);
          }
          for (const file of cluster.files.filter((path) => uncommittedNodes.has(path))) {
            if (!(cluster.uncommitted_files ?? []).includes(file)) {
              failures.push(`repo-since: ${file} differs from HEAD but ${cluster.id} does not report it as uncommitted`);
            }
          }
        }
        for (const file of diffNodes) {
          if (!changed.has(file)) failures.push(`repo-since: ${file} changed since HEAD~1 but no cluster reports it`);
        }
      }
    }
  }
}

rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  console.error('check-map FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('check-map OK (Ruby/TypeScript and Dart fixture expectations, --since on a temporary history, the working tree in --since and uncommitted_files, git refusals, non-git refusal, skill anchors, the real repository)');
