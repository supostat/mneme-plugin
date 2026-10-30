#!/usr/bin/env node
//
// Gate of the project map's plugin side (spec-map-plugin, phase map-skill): the real
// plugin/scripts/project-graph.mjs against its fixture, a temporary git history, a non-git
// directory and this repository itself, plus the load-bearing anchors of plugin/skills/map/SKILL.md.
//
// Usage: node scripts/check-map.mjs   (also runs as part of npm test)

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const graphScript = join(repoRoot, 'plugin', 'scripts', 'project-graph.mjs');
const fixtureRoot = join(repoRoot, 'scripts', 'fixtures', 'graph-project');
const skillPath = join(repoRoot, 'plugin', 'skills', 'map', 'SKILL.md');
const bundleScripts = new Set(readdirSync(join(repoRoot, 'plugin', 'scripts')));
const scratch = mkdtempSync(join(tmpdir(), 'mneme-check-map-'));

const EXIT_MISMATCH = 1;
const EXIT_USAGE = 2;
const GRAPH_EXTENSIONS = new Set(['rb', 'erb', 'ts', 'tsx', 'js', 'jsx', 'mjs']);
const SECTION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_TERMS = 24;
const MAX_TERM_LENGTH = 32;
const PLUGIN_CODE_DIRECTORY = 'plugin/scripts';
const REPO_TOOLING_DIRECTORY = 'scripts';
const EXPECTED_GRANT = [
  'Read',
  'Grep',
  'Bash',
  'Task',
  'mcp__plugin_mneme_memory__map_list',
  'mcp__plugin_mneme_memory__map_put',
  'mcp__plugin_mneme_memory__map_delete',
];
const SKILL_ANCHORS = [
  'disable-model-invocation: true',
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
  '--mark map-',
  '--delta map-',
];
const SCRIPT_INVOCATION = /(?:<base-dir-скилла>\/\.\.\/\.\.|\$CLAUDE_PLUGIN_ROOT)\/scripts\/([A-Za-z0-9._-]+)/g;
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

// (a) the fixture matches both stored expectations, and a wrong expectation is refused
{
  expectExit('fixture-expect', runGraph('--root', fixtureRoot, '--expect', join(fixtureRoot, 'expected.json')), 0);
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

// (c) a directory outside any git repository is refused with a named error
{
  const nonGit = join(scratch, 'non-git');
  cpSync(join(fixtureRoot, 'app'), join(nonGit, 'app'), { recursive: true });
  const refused = runGraph('--root', nonGit);
  if (expectExit('non-git-root', refused, EXIT_USAGE) && !refused.stderr.includes('is not inside a git repository')) {
    failures.push(`non-git-root: the error does not name the cause (stderr: ${refused.stderr.trim()})`);
  }
}

// (d) the skill text: grant, first step, menus, limits, forbidden files, bearer calls, scripts shipped
{
  const skill = readFileSync(skillPath, 'utf8');
  const declaration = skill.match(/^allowed-tools:\s*\[([^\]]*)\]/m);
  if (declaration === null) {
    failures.push('map: no allowed-tools list in the frontmatter');
  } else {
    const granted = declaration[1].split(',').map((token) => token.trim()).filter((token) => token !== '');
    const extra = granted.filter((token) => !EXPECTED_GRANT.includes(token));
    const missing = EXPECTED_GRANT.filter((token) => !granted.includes(token));
    if (extra.length > 0) failures.push(`map: allowed-tools grants ${extra.join(', ')} beyond the seven-token contract`);
    if (missing.length > 0) failures.push(`map: allowed-tools lacks ${missing.join(', ')} of the seven-token contract`);
  }
  for (const anchor of SKILL_ANCHORS) {
    if (!skill.includes(anchor)) failures.push(`map: anchor «${anchor}» missing`);
  }
  const firstStep = skill.match(/^### Step[^\n]*\n([\s\S]*?)(?=^### )/m);
  if (firstStep === null) {
    failures.push('map: no ### Step heading');
  } else if (!firstStep[1].includes('map_list {}')) {
    failures.push('map: the first step is not map_list {}');
  }
  for (const [, script] of skill.matchAll(SCRIPT_INVOCATION)) {
    if (!bundleScripts.has(script)) failures.push(`map: invokes plugin/scripts/${script}, which is not in the bundle`);
  }
  if (!/--mark map-[^\n]*\n/.test(skill) || !skill.includes('project-graph.mjs')) {
    failures.push('map: the graph script call or the --mark call is missing');
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
        const diffNodes = new Set(
          git(repoRoot, 'diff', '--name-only', 'HEAD~1..HEAD')
            .split('\n')
            .filter((file) => trackedNodes.includes(file)),
        );
        const changed = new Set();
        for (const cluster of since.clusters) {
          if (!fullIds.has(cluster.id)) failures.push(`repo-since: cluster ${cluster.id} is not in the full graph`);
          for (const file of cluster.changed_files ?? []) {
            changed.add(file);
            if (!diffNodes.has(file)) failures.push(`repo-since: ${file} is reported as changed but HEAD~1..HEAD does not touch it`);
          }
        }
        for (const file of diffNodes) {
          if (!changed.has(file)) failures.push(`repo-since: ${file} changed in HEAD~1..HEAD but no cluster reports it`);
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
console.log('check-map OK (fixture expectations, --since on a temporary history, non-git refusal, skill anchors, the real repository)');
