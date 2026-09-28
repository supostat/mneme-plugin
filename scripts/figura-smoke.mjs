#!/usr/bin/env node
//
// Smoke gate of figura against the real tools, outside npm test: each stage needs what its tool
// needs, and the d2 stage needs the network, curl and tar.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIGURA_BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'figura', 'bin');
const SMOKE_NODE_LABEL = 'figura smoke node';

function isExecutableFile(path) {
  return existsSync(path) && (statSync(path).mode & 0o111) !== 0;
}

function renderWithPinnedD2(workDirectory) {
  const pinnedBin = join(workDirectory, 'bin');
  const home = join(workDirectory, 'home');
  mkdirSync(pinnedBin);
  mkdirSync(home);
  copyFileSync(join(FIGURA_BIN, 'launch.sh'), join(pinnedBin, 'launch.sh'));
  copyFileSync(join(FIGURA_BIN, 'release.json'), join(pinnedBin, 'release.json'));
  const source = join(workDirectory, 'smoke.d2');
  const output = join(workDirectory, 'smoke.svg');
  writeFileSync(source, `smoke: ${SMOKE_NODE_LABEL}\n`);
  const run = spawnSync('sh', [join(pinnedBin, 'launch.sh'), source, output], {
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    return [`the launcher did not render with the pinned d2 (exit ${run.status}): ${run.stderr.trim()}`];
  }
  const engineVersion = JSON.parse(readFileSync(join(pinnedBin, 'release.json'), 'utf8')).engine_version;
  const cachedD2 = join(home, '.figura', 'bin', engineVersion, 'd2');
  const problems = [];
  if (!isExecutableFile(cachedD2)) {
    problems.push(`no executable d2 in the cache at ${cachedD2}`);
  }
  const svg = existsSync(output) ? readFileSync(output, 'utf8') : '';
  if (!svg.includes('<svg')) {
    problems.push(`d2 wrote no SVG to ${output}`);
  } else if (!svg.includes(SMOKE_NODE_LABEL)) {
    problems.push(`the SVG does not carry the node text "${SMOKE_NODE_LABEL}"`);
  }
  return problems;
}

const STAGES = new Map([
  [
    'd2',
    {
      check: renderWithPinnedD2,
      passed: 'the launcher downloaded, verified and cached the pinned d2, and d2 rendered an SVG with the node text',
    },
  ],
]);

const [stageName] = process.argv.slice(2);
const stage = STAGES.get(stageName);
if (stage === undefined) {
  console.error(`figura-smoke: usage: figura-smoke.mjs <stage> (stages: ${[...STAGES.keys()].join(', ')})`);
  process.exit(2);
}

const workDirectory = mkdtempSync(join(tmpdir(), 'figura-smoke-'));
let problems;
try {
  problems = stage.check(workDirectory);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}
if (problems.length > 0) {
  console.error(`figura-smoke: stage ${stageName} FAILED:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`figura-smoke: stage ${stageName} passed — ${stage.passed}.`);
