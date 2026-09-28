#!/usr/bin/env node
//
// Two-sided test of the multi-bundle rules of scripts/validate-manifests.mjs: a fixture
// marketplace of two bundles validates, and each per-bundle rule rejects its breakage in
// the second bundle with the repair named.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const validator = resolve(dirname(fileURLToPath(import.meta.url)), 'validate-manifests.mjs');
const failures = [];

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeSkill(root, bundleDirectory, skillDirectory, declaredName) {
  const path = join(root, bundleDirectory, 'skills', skillDirectory, 'SKILL.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    ['---', `name: ${declaredName}`, 'description: fixture skill', 'allowed-tools: [Read]', '---', '', '# fixture', ''].join('\n'),
  );
}

function buildTwoBundleRoot(root) {
  writeJson(join(root, '.claude-plugin', 'marketplace.json'), {
    name: 'fixture-marketplace',
    owner: { name: 'Fixture Owner' },
    plugins: [
      { name: 'alpha', source: './alpha' },
      { name: 'beta', source: './beta' },
    ],
  });
  writeJson(join(root, 'alpha', '.claude-plugin', 'plugin.json'), {
    name: 'alpha',
    description: 'fixture bundle with the launcher MCP server',
    mcpServers: { memory: { command: '${CLAUDE_PLUGIN_ROOT}/bin/launch.sh' } },
    version: '1.0.0',
  });
  writeSkill(root, 'alpha', 'dev', 'dev');
  writeJson(join(root, 'beta', '.claude-plugin', 'plugin.json'), {
    name: 'beta',
    description: 'fixture bundle of skills and scripts, no MCP server',
    version: '0.1.0',
  });
  writeSkill(root, 'beta', 'document', 'document');
  writeJson(join(root, 'beta', 'bin', 'release.json'), {
    engine_version: '0.7.1',
    plugin_version: '0.1.0',
    base_url: 'https://example.invalid/releases/download/v0.7.1',
    sha256: { 'darwin-arm64': 'c'.repeat(64) },
  });
}

function validateFixture(breakFixture) {
  const root = mkdtempSync(join(tmpdir(), 'mneme-manifest-bundles-'));
  try {
    buildTwoBundleRoot(root);
    breakFixture(root);
    const result = spawnSync(process.execPath, [validator, root], { encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function expectRejection(caseName, breakFixture, expectedText) {
  const result = validateFixture(breakFixture);
  if (result.status === 0) {
    failures.push(`${caseName}: the broken second bundle was ACCEPTED`);
  } else if (!result.output.includes(expectedText)) {
    failures.push(`${caseName}: rejected without naming the repair — expected "${expectedText}", got:\n${result.output.trim()}`);
  }
}

const pair = validateFixture(() => {});
if (pair.status !== 0) {
  failures.push(`two valid bundles (the second without mcpServers) were REJECTED:\n${pair.output.trim()}`);
} else if (!pair.output.includes('2 bundles (alpha, beta)')) {
  failures.push(`the success line does not name both bundles — it reads:\n${pair.output.trim()}`);
}

expectRejection(
  'name mismatch',
  (root) =>
    writeJson(join(root, 'beta', '.claude-plugin', 'plugin.json'), {
      name: 'gamma',
      description: 'fixture bundle whose manifest name drifted from its marketplace element',
      version: '0.1.0',
    }),
  'does not match the name "gamma" declared in beta/.claude-plugin/plugin.json',
);

expectRejection(
  'declared server without the launcher',
  (root) =>
    writeJson(join(root, 'beta', '.claude-plugin', 'plugin.json'), {
      name: 'beta',
      description: 'fixture bundle pointing its server at a raw binary',
      mcpServers: { tool: { command: '${CLAUDE_PLUGIN_ROOT}/bin/tool' } },
      version: '0.1.0',
    }),
  'starts through the launcher',
);

expectRejection(
  'repo-internal docs inside the bundle',
  (root) => mkdirSync(join(root, 'beta', 'docs'), { recursive: true }),
  'beta/docs: repo-internal path must NOT sit inside the shipped bundle',
);

expectRejection(
  'pin drift in the second bundle',
  (root) =>
    writeJson(join(root, 'beta', 'bin', 'release.json'), {
      engine_version: '0.7.1',
      plugin_version: '0.0.9',
      base_url: 'https://example.invalid/releases/download/v0.7.1',
      sha256: { 'darwin-arm64': 'c'.repeat(64) },
    }),
  'generate-release-pin.mjs --restamp beta',
);

expectRejection(
  'skill name off its directory',
  (root) => writeSkill(root, 'beta', 'document', 'doc'),
  'must match the skill directory "document"',
);

expectRejection(
  'second bundle without skills',
  (root) => rmSync(join(root, 'beta', 'skills'), { recursive: true, force: true }),
  'beta/skills: directory not found',
);

if (failures.length > 0) {
  console.error('Multi-bundle manifest check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  'Multi-bundle manifest check passed: two bundles validate (one without MCP servers), and a name mismatch, a raw-binary server, docs/ in a bundle, a drifted pin, a misnamed skill and a skill-less bundle are each rejected with the repair named.',
);
