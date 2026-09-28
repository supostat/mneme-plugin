#!/usr/bin/env node
//
// Scenario test of scripts/auto-bump.mjs: each scenario commits a history into a temporary git
// repository whose marketplace lists two bundles, alpha with a release pin, then checks what the
// bump run did.

import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const autoBumpScript = resolve(dirname(fileURLToPath(import.meta.url)), 'auto-bump.mjs');
const ALPHA_MANIFEST = 'alpha/.claude-plugin/plugin.json';
const ALPHA_PIN = 'alpha/bin/release.json';
const BETA_MANIFEST = 'beta/.claude-plugin/plugin.json';
const gitEnvironmentWithoutUserConfiguration = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};
const failures = [];

function git(repository, ...argumentList) {
  const result = spawnSync('git', argumentList, {
    cwd: repository,
    env: gitEnvironmentWithoutUserConfiguration,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`fixture step "git ${argumentList.join(' ')}" failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function writeJson(repository, relativePath, value) {
  const path = join(repository, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(repository, relativePath) {
  return JSON.parse(readFileSync(join(repository, relativePath), 'utf8'));
}

function writeMarketplace(repository, bundleNames) {
  writeJson(repository, '.claude-plugin/marketplace.json', {
    name: 'fixture-marketplace',
    owner: { name: 'Fixture Owner' },
    plugins: bundleNames.map((name) => ({ name, source: `./${name}` })),
  });
}

function writeManifest(repository, bundleName, version) {
  writeJson(repository, `${bundleName}/.claude-plugin/plugin.json`, {
    name: bundleName,
    description: `fixture bundle ${bundleName}`,
    version,
  });
}

function editCode(repository, bundleName) {
  appendFileSync(join(repository, bundleName, 'code.txt'), 'edit\n');
}

function commitAll(repository, message) {
  git(repository, 'add', '--all');
  git(repository, 'commit', '--quiet', '-m', message);
}

function addAlpha(repository) {
  writeManifest(repository, 'alpha', '1.0.0');
  writeJson(repository, ALPHA_PIN, {
    engine_version: '0.7.1',
    plugin_version: '1.0.0',
    base_url: 'https://example.invalid/releases/download/v0.7.1',
    sha256: { 'darwin-arm64': 'c'.repeat(64) },
  });
  editCode(repository, 'alpha');
}

function addBeta(repository) {
  writeManifest(repository, 'beta', '0.1.0');
  editCode(repository, 'beta');
}

function commitBothBundles(repository) {
  writeMarketplace(repository, ['alpha', 'beta']);
  addAlpha(repository);
  addBeta(repository);
  commitAll(repository, 'Create alpha and beta');
}

function commitCount(repository) {
  return Number(git(repository, 'rev-list', '--count', 'HEAD'));
}

function headSubject(repository) {
  return git(repository, 'log', '-1', '--format=%s');
}

function runAutoBump(repository) {
  return spawnSync(process.execPath, [autoBumpScript], {
    cwd: repository,
    env: gitEnvironmentWithoutUserConfiguration,
    encoding: 'utf8',
  });
}

function bump(repository) {
  const run = runAutoBump(repository);
  if (run.status !== 0) {
    throw new Error(`auto-bump exited with ${run.status}: ${run.stderr.trim()}`);
  }
  return run.stdout;
}

function idleRunExpectations(repository) {
  const commitsBefore = commitCount(repository);
  const output = bump(repository);
  return [
    ['output', output, ''],
    ['commits the run added', commitCount(repository) - commitsBefore, 0],
    ['changes left in the working tree', git(repository, 'status', '--porcelain'), ''],
  ];
}

function scenario(name, playScenario) {
  const repository = mkdtempSync(join(tmpdir(), 'mneme-auto-bump-'));
  try {
    git(repository, 'init', '--quiet', '--initial-branch=main');
    git(repository, 'config', 'user.name', 'Fixture Author');
    git(repository, 'config', 'user.email', 'author@example.invalid');
    for (const [property, actual, expected] of playScenario(repository)) {
      if (actual !== expected) {
        failures.push(`${name}: ${property} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
      }
    }
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
}

scenario('a change in alpha alone', (repository) => {
  commitBothBundles(repository);
  editCode(repository, 'alpha');
  commitAll(repository, 'Change alpha');
  const output = bump(repository);
  return [
    ['output', output, 'Bump alpha to 1.0.1 after bundle changes\n'],
    ['bump commit subject', headSubject(repository), 'Bump alpha to 1.0.1 after bundle changes'],
    ['files of the bump commit', git(repository, 'show', '--name-only', '--format=', 'HEAD'), `${ALPHA_MANIFEST}\n${ALPHA_PIN}`],
    ['alpha version', readJson(repository, ALPHA_MANIFEST).version, '1.0.1'],
    ['plugin_version in the alpha pin', readJson(repository, ALPHA_PIN).plugin_version, '1.0.1'],
    ['beta version', readJson(repository, BETA_MANIFEST).version, '0.1.0'],
    ['changes left in the working tree', git(repository, 'status', '--porcelain'), ''],
  ];
});

scenario('alpha, then beta, with no run between them, as after a red run', (repository) => {
  commitBothBundles(repository);
  editCode(repository, 'alpha');
  commitAll(repository, 'Change alpha');
  editCode(repository, 'beta');
  commitAll(repository, 'Change beta');
  const commitsBefore = commitCount(repository);
  bump(repository);
  return [
    ['bump commit subject', headSubject(repository), 'Bump alpha to 1.0.1 and beta to 0.1.1 after bundle changes'],
    ['commits the run added', commitCount(repository) - commitsBefore, 1],
    ['alpha version', readJson(repository, ALPHA_MANIFEST).version, '1.0.1'],
    ['beta version', readJson(repository, BETA_MANIFEST).version, '0.1.1'],
  ];
});

scenario('an author bump in the same commit as the code', (repository) => {
  commitBothBundles(repository);
  editCode(repository, 'alpha');
  writeManifest(repository, 'alpha', '1.1.0');
  commitAll(repository, 'Change alpha and bump it');
  return idleRunExpectations(repository);
});

scenario('an author bump followed by a code change', (repository) => {
  commitBothBundles(repository);
  writeManifest(repository, 'alpha', '1.1.0');
  commitAll(repository, 'Bump alpha');
  editCode(repository, 'alpha');
  commitAll(repository, 'Change alpha');
  bump(repository);
  return [['alpha version', readJson(repository, ALPHA_MANIFEST).version, '1.1.1']];
});

scenario('an edit on the line next to "version" that keeps its value', (repository) => {
  commitBothBundles(repository);
  writeJson(repository, ALPHA_MANIFEST, { name: 'alpha', description: 'fixture bundle alpha, reworded', version: '1.0.0' });
  commitAll(repository, 'Reword the alpha description');
  bump(repository);
  return [['alpha version', readJson(repository, ALPHA_MANIFEST).version, '1.0.1']];
});

scenario('a reformatted version line after a code change', (repository) => {
  commitBothBundles(repository);
  editCode(repository, 'alpha');
  commitAll(repository, 'Change alpha');
  const manifestFile = join(repository, ALPHA_MANIFEST);
  writeFileSync(manifestFile, readFileSync(manifestFile, 'utf8').replace('"version": "1.0.0"', '"version":    "1.0.0"'));
  commitAll(repository, 'Reformat the alpha version line');
  bump(repository);
  return [['alpha version', readJson(repository, ALPHA_MANIFEST).version, '1.0.1']];
});

scenario('a rerun after the bump commit', (repository) => {
  commitBothBundles(repository);
  editCode(repository, 'alpha');
  commitAll(repository, 'Change alpha');
  bump(repository);
  return idleRunExpectations(repository);
});

scenario('a bundle added later with no commits after it', (repository) => {
  writeMarketplace(repository, ['alpha']);
  addAlpha(repository);
  commitAll(repository, 'Create alpha');
  writeMarketplace(repository, ['alpha', 'beta']);
  addBeta(repository);
  commitAll(repository, 'Add beta');
  return idleRunExpectations(repository);
});

scenario('a merged branch that bumped alpha and then changed it', (repository) => {
  commitBothBundles(repository);
  git(repository, 'switch', '--quiet', '--create', 'feature');
  writeManifest(repository, 'alpha', '1.1.0');
  commitAll(repository, 'Bump alpha on the branch');
  editCode(repository, 'alpha');
  commitAll(repository, 'Change alpha on the branch');
  git(repository, 'switch', '--quiet', 'main');
  git(repository, 'merge', '--quiet', '--no-ff', '--no-edit', 'feature');
  bump(repository);
  return [['alpha version', readJson(repository, ALPHA_MANIFEST).version, '1.1.1']];
});

scenario('a shallow clone', (repository) => {
  commitBothBundles(repository);
  editCode(repository, 'alpha');
  commitAll(repository, 'Change alpha');
  const shallowClone = join(repository, 'shallow-clone');
  git(repository, 'clone', '--quiet', '--depth', '1', `file://${repository}`, shallowClone);
  const run = runAutoBump(shallowClone);
  return [
    ['exit status', run.status, 1],
    ['stderr names the full-history checkout', run.stderr.includes('fetch-depth: 0'), true],
    ['commits in the clone', commitCount(shallowClone), 1],
  ];
});

if (failures.length > 0) {
  console.error('Auto-bump check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'Auto-bump check passed: every history scenario bumps exactly the bundles changed since their version base, in one commit, and a shallow clone is refused.',
);
