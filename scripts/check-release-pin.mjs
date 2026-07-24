#!/usr/bin/env node
//
// Two-sided test of the release-pin toolchain: the generator
// (scripts/generate-release-pin.mjs) and the pin rules of
// scripts/validate-manifests.mjs.
//
// The positive side alone would accept any self-consistent rule, so the
// failing side is exercised explicitly (same lesson as check-skill-names.mjs):
// a broken pin must be rejected, and a version drift must be rejected WITH an
// error that tells the author how to repair it (--restamp) — then --restamp
// itself must actually repair it.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/, so it is not
// shipped in the installed bundle.
//
// Usage: node scripts/check-release-pin.mjs   (also runs as part of npm test)

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const validator = resolve(scriptsDir, 'validate-manifests.mjs');
const generator = resolve(scriptsDir, 'generate-release-pin.mjs');
const MISMATCH_EXPLANATION = 'does not match plugin.json version';

const failures = [];

function buildFixtureRoot(root) {
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  mkdirSync(join(root, 'plugin', '.claude-plugin'), { recursive: true });
  mkdirSync(join(root, 'plugin', 'bin'), { recursive: true });
  mkdirSync(join(root, 'plugin', 'skills', 'dev'), { recursive: true });

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
        description: 'fixture plugin for the release-pin rules',
        mcpServers: { memory: { command: '${CLAUDE_PLUGIN_ROOT}/bin/launch.sh' } },
        version: '1.2.3',
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, 'plugin', 'skills', 'dev', 'SKILL.md'),
    ['---', 'name: dev', 'description: fixture skill', 'allowed-tools: [Read]', '---', '', '# fixture', ''].join('\n'),
  );
}

function writePayload(root) {
  const payloadPath = join(root, 'payload.json');
  writeFileSync(
    payloadPath,
    JSON.stringify(
      {
        version: '0.9.0',
        assets: [
          'https://example.invalid/releases/download/engine-v0.9.0/mneme-darwin-arm64',
          'https://example.invalid/releases/download/engine-v0.9.0/mneme-linux-x64',
        ],
        sha256: {
          'darwin-arm64': 'a'.repeat(64),
          'linux-x64': 'b'.repeat(64),
        },
      },
      null,
      2,
    ),
  );
  return payloadPath;
}

function run(binArgs) {
  const result = spawnSync(process.execPath, binArgs, { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const root = mkdtempSync(join(tmpdir(), 'mneme-release-pin-'));
try {
  buildFixtureRoot(root);
  const pinPath = join(root, 'plugin', 'bin', 'release.json');

  // Case 0: no pin at all — the pre-release state must validate silently.
  const noPin = run([validator, root]);
  if (noPin.status !== 0) {
    failures.push(`a fixture WITHOUT release.json was rejected — pin absence must be the silent pre-release state:\n${noPin.output.trim()}`);
  }

  // Case 1: generator output from a valid payload passes the validator.
  const generated = run([generator, writePayload(root), root]);
  if (generated.status !== 0) {
    failures.push(`the generator rejected a valid dispatch payload:\n${generated.output.trim()}`);
  } else if (!existsSync(pinPath)) {
    failures.push('the generator exited 0 but wrote no plugin/bin/release.json');
  } else {
    const valid = run([validator, root]);
    if (valid.status !== 0) {
      failures.push(`a freshly generated pin was rejected by the validator:\n${valid.output.trim()}`);
    }
  }

  // Case 2: a syntactically broken pin is rejected.
  const goodPin = readFileSync(pinPath, 'utf8');
  writeFileSync(pinPath, '{ this is not json');
  const broken = run([validator, root]);
  if (broken.status === 0) {
    failures.push('a syntactically broken release.json was ACCEPTED');
  } else if (!broken.output.includes('invalid JSON')) {
    failures.push(`the broken-pin rejection does not name invalid JSON:\n${broken.output.trim()}`);
  }
  writeFileSync(pinPath, goodPin);

  // Case 3: plugin_version drift is rejected with a repair hint.
  const drifted = JSON.parse(goodPin);
  drifted.plugin_version = '0.0.9';
  writeFileSync(pinPath, `${JSON.stringify(drifted, null, 2)}\n`);
  const mismatch = run([validator, root]);
  if (mismatch.status === 0) {
    failures.push('a pin whose plugin_version drifted from plugin.json was ACCEPTED');
  } else if (!mismatch.output.includes(MISMATCH_EXPLANATION)) {
    failures.push(`the version-drift rejection does not explain the mismatch — the error reads:\n${mismatch.output.trim()}`);
  }

  // Case 4: --restamp repairs exactly that drift.
  const restamp = run([generator, '--restamp', root]);
  if (restamp.status !== 0) {
    failures.push(`--restamp failed on a drifted pin:\n${restamp.output.trim()}`);
  } else {
    const repaired = run([validator, root]);
    if (repaired.status !== 0) {
      failures.push(`the validator still rejects the pin after --restamp:\n${repaired.output.trim()}`);
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('Release-pin check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('Release-pin check passed: generator output validates, a broken or drifted pin is rejected, --restamp repairs the drift.');
