#!/usr/bin/env node
//
// Negative test for the skill-name rule of scripts/validate-manifests.mjs.
//
// The positive side of the rule is covered every time the validator runs over this repo. What
// nothing covered until now is the FAILING side: a skill whose name carries the plugin prefix
// (`name: mneme:dev` in `skills/mneme__dev/`) must be REJECTED, with an error that explains the
// host adds the namespace itself. That regression already shipped once — this script is what
// keeps it from shipping again.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/, so it is not shipped in the
// installed bundle (same rule as scripts/validate-manifests.mjs).
//
// Usage: node scripts/check-skill-names.mjs   (also runs as part of npm test)

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const validator = resolve(dirname(fileURLToPath(import.meta.url)), 'validate-manifests.mjs');
const PREFIX_EXPLANATION = 'prepends the plugin';

const failures = [];

function skillDocument(declaredName) {
  return [
    '---',
    `name: ${declaredName}`,
    'description: fixture skill for the skill-name rule',
    'allowed-tools: [Read]',
    '---',
    '',
    '# fixture',
    '',
  ].join('\n');
}

function buildFixtureRoot(root, skillDirectoryName, declaredName) {
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  mkdirSync(join(root, 'plugin', '.claude-plugin'), { recursive: true });
  mkdirSync(join(root, 'plugin', 'skills', skillDirectoryName), { recursive: true });

  writeFileSync(
    join(root, '.claude-plugin', 'marketplace.json'),
    JSON.stringify(
      {
        name: 'fixture-marketplace',
        owner: { name: 'Fixture Owner' },
        plugins: [{ name: 'fixture', source: './plugin' }],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, 'plugin', '.claude-plugin', 'plugin.json'),
    JSON.stringify(
      {
        name: 'fixture',
        description: 'fixture plugin for the skill-name rule',
        mcpServers: { memory: { command: '${CLAUDE_PLUGIN_ROOT}/bin/fixture' } },
        version: '0.0.1',
      },
      null,
      2,
    ),
  );
  writeFileSync(join(root, 'plugin', 'skills', skillDirectoryName, 'SKILL.md'), skillDocument(declaredName));
}

function runValidatorAgainst(skillDirectoryName, declaredName) {
  const root = mkdtempSync(join(tmpdir(), 'mneme-skill-names-'));
  try {
    buildFixtureRoot(root, skillDirectoryName, declaredName);
    const result = spawnSync(process.execPath, [validator, root], { encoding: 'utf8' });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const prefixed = runValidatorAgainst('mneme__dev', 'mneme:dev');
if (prefixed.status === 0) {
  failures.push('a skill named "mneme:dev" in skills/mneme__dev was ACCEPTED — the doubled-prefix regression is unguarded');
} else if (!prefixed.output.includes(PREFIX_EXPLANATION)) {
  failures.push(`the rejection of "mneme:dev" does not explain that the host prepends the plugin namespace — the error reads:\n${prefixed.output.trim()}`);
}

const clean = runValidatorAgainst('dev', 'dev');
if (clean.status !== 0) {
  failures.push(`a skill named "dev" in skills/dev was REJECTED — the rule is too strict:\n${clean.output.trim()}`);
}

if (failures.length > 0) {
  console.error('Skill-name rule check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('Skill-name rule check passed: a plugin-prefixed skill name is rejected with an explanation, a bare one is accepted.');
