#!/usr/bin/env node
//
// Gate for the SessionStart orientation hook: the second SessionStart command in
// plugin/hooks/hooks.json prints the engine's one-line survey for the current branch
// (`launch.sh survey --brief`, wrapped by plugin/scripts/session-orient.sh as hook JSON) and
// stays silent on every other outcome. Three sections:
//
//   STRUCTURE — hooks.json: SessionStart[0].hooks[0] is still the --warm command; hooks[1]
//     STARTS with the corpus guard (GUARD-ORDER: `[ -d "$HOME/.mneme" ] || exit 0; ` before
//     anything is spawned), invokes scripts/session-orient.sh through ${CLAUDE_PLUGIN_ROOT},
//     and carries a numeric timeout within the budget.
//   WRAPPER — the REAL hooks.json command under /bin/sh against a fixture plugin root holding
//     the real session-orient.sh and a FAKE launcher: (a) no $HOME/.mneme → silence and the
//     launcher is never called (the guard fires first); (b) a line with `"` in the branch →
//     valid JSON whose additionalContext and systemMessage equal the line byte for byte;
//     (c) an empty answer → silence; (d) a failing launcher → silence, nothing on stderr.
//   CHAIN — the same command with a COPY of the real launch.sh, mocks only at the binary:
//     (e) dev mode — a fake bin/mneme answering only `survey --brief`; (f) production mode —
//     a release pin, the fake binary cached under $HOME/.mneme/bin/<version>/, a mock curl
//     that must never be called; (g) no pin and no dev build → silence, the launcher's exit 1
//     swallowed.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/ (same rule as the other check-*).
//
// Usage: node scripts/check-orient-hook.mjs   (also runs as part of npm test)

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsDir, '..');
const pluginRoot = join(repoRoot, 'plugin');
const failures = [];

const GUARD_PREFIX = '[ -d "$HOME/.mneme" ] || exit 0; ';
const WRAPPER_INVOCATION = '${CLAUDE_PLUGIN_ROOT}/scripts/session-orient.sh';
const WARM_COMMAND_SUFFIX = '/bin/launch.sh --warm';
const TIMEOUT_BUDGET_SECONDS = 15;
const ENGINE_VERSION = '9.9.9';
const SURVEY_LINE =
  'feat/"quoted" · run 0f3b1c2d-4e5f-4a6b-8c7d-9e0f1a2b3c4d [running] · phase hook [pending: execute_step hook/implement attempt 1] · staged 1 · last 2026-10-06T10:00:00.000Z';

// --- STRUCTURE: the hooks.json entry itself ---
const hooksJson = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
const sessionStartHooks = hooksJson.hooks.SessionStart?.[0]?.hooks ?? [];
const warmHook = sessionStartHooks[0];
const orientHook = sessionStartHooks[1];

if (warmHook === undefined || !warmHook.command.endsWith(WARM_COMMAND_SUFFIX)) {
  failures.push(`STRUCTURE: SessionStart[0].hooks[0] must stay the cache pre-warm (… ${WARM_COMMAND_SUFFIX})`);
}
if (orientHook === undefined) {
  failures.push('STRUCTURE: SessionStart[0].hooks[1] (the orientation command) is missing');
} else {
  if (!orientHook.command.startsWith(GUARD_PREFIX)) {
    failures.push(`GUARD-ORDER: the orientation command must START with "${GUARD_PREFIX}" — the corpus guard comes before any spawn, so a machine without mneme corpora pays nothing`);
  }
  if (!orientHook.command.includes(WRAPPER_INVOCATION)) {
    failures.push(`STRUCTURE: the orientation command must invoke ${WRAPPER_INVOCATION} — the logic lives in the wrapper, not in the JSON string`);
  }
  if (typeof orientHook.timeout !== 'number' || orientHook.timeout > TIMEOUT_BUDGET_SECONDS) {
    failures.push(`STRUCTURE: the orientation command needs a numeric timeout of at most ${TIMEOUT_BUDGET_SECONDS}s (got ${JSON.stringify(orientHook.timeout)}) — the engine answers in milliseconds, a hung launcher must not hold the session`);
  }
}
const orientCommand = orientHook?.command ?? '';

// --- fixtures ---
const platformTarget = () => {
  const os = { darwin: 'darwin', linux: 'linux' }[process.platform];
  const arch = { arm64: 'arm64', x64: 'x64' }[process.arch];
  if (os === undefined || arch === undefined) {
    throw new Error(`check-orient-hook: unsupported fixture host ${process.platform}/${process.arch}`);
  }
  return `${os}-${arch}`;
};
const target = platformTarget();

const writeExecutable = (path, body) => {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
};

const fakeLauncher = (answer) => `#!/bin/sh
printf 'called\\n' >>"$(dirname -- "$0")/launcher.log"
if [ "$#" -ne 2 ] || [ "$1" != survey ] || [ "$2" != --brief ]; then
  printf 'usage: mneme survey --brief\\n' >&2
  exit 2
fi
${answer}
`;
const answerLine = `printf '%s\\n' '${SURVEY_LINE}'`;
const answerSilence = 'exit 0';
const answerFailure = `printf 'mneme-launch: error: no local build and no release pin\\n' >&2\nexit 1`;

const fakeBinary = `#!/bin/sh
if [ "$#" -eq 2 ] && [ "$1" = survey ] && [ "$2" = --brief ]; then
  printf '%s\\n' '${SURVEY_LINE}'
  exit 0
fi
printf 'usage: mneme survey --brief\\n' >&2
exit 2
`;

const mockCurl = `#!/bin/sh
printf 'called\\n' >>"$(dirname -- "$0")/curl.log"
exit 22
`;

const releasePin = `{
  "engine_version": "${ENGINE_VERSION}",
  "plugin_version": "0.0.0",
  "base_url": "https://example.invalid/release",
  "sha256": {
    "${target}": "cafe1234"
  }
}
`;

// A fixture is a plugin root (CLAUDE_PLUGIN_ROOT) with the REAL wrapper, a bin/ shaped by the
// scenario, a HOME and a cwd of its own.
const makeFixture = (name) => {
  const root = mkdtempSync(join(tmpdir(), `orient-${name}-`));
  const fixtureRoot = join(root, 'plugin');
  mkdirSync(join(fixtureRoot, 'bin'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'scripts'), { recursive: true });
  copyFileSync(join(pluginRoot, 'scripts', 'session-orient.sh'), join(fixtureRoot, 'scripts', 'session-orient.sh'));
  const home = join(root, 'home');
  mkdirSync(home);
  const cwd = join(root, 'project');
  mkdirSync(cwd);
  const mockbin = join(root, 'mockbin');
  mkdirSync(mockbin);
  return { root, fixtureRoot, home, cwd, mockbin, launcherPath: join(fixtureRoot, 'bin', 'launch.sh') };
};

const withCorpusRoot = (fixture) => mkdirSync(join(fixture.home, '.mneme'), { recursive: true });

const runHook = (fixture) =>
  spawnSync('/bin/sh', ['-c', orientCommand], {
    encoding: 'utf8',
    input: '{}',
    cwd: fixture.cwd,
    env: { PATH: `${fixture.mockbin}:${process.env.PATH}`, HOME: fixture.home, CLAUDE_PLUGIN_ROOT: fixture.fixtureRoot },
  });

const expectSilence = (label, result) => {
  if (result.status !== 0) failures.push(`${label}: expected exit 0, got ${result.status}`);
  if (result.stdout !== '') failures.push(`${label}: expected an empty stdout, got: ${result.stdout.trim().slice(0, 160)}`);
  if (result.stderr !== '') failures.push(`${label}: expected an empty stderr, got: ${result.stderr.trim().slice(0, 160)}`);
};

const expectOrientationJson = (label, result) => {
  if (result.status !== 0) failures.push(`${label}: expected exit 0, got ${result.status}`);
  if (result.stderr !== '') failures.push(`${label}: expected an empty stderr, got: ${result.stderr.trim().slice(0, 160)}`);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    failures.push(`${label}: stdout is not valid JSON (${error.message}): ${result.stdout.trim().slice(0, 200)}`);
    return;
  }
  if (parsed.hookSpecificOutput?.hookEventName !== 'SessionStart') {
    failures.push(`${label}: hookSpecificOutput.hookEventName must be "SessionStart"`);
  }
  if (parsed.hookSpecificOutput?.additionalContext !== SURVEY_LINE) {
    failures.push(`${label}: additionalContext must be the engine's line byte for byte (got: ${JSON.stringify(parsed.hookSpecificOutput?.additionalContext)})`);
  }
  if (parsed.systemMessage !== SURVEY_LINE) {
    failures.push(`${label}: systemMessage must be the engine's line byte for byte (got: ${JSON.stringify(parsed.systemMessage)})`);
  }
};

const fixtures = [];
const scenario = (name, build, check) => {
  const fixture = makeFixture(name);
  fixtures.push(fixture);
  build(fixture);
  check(fixture, runHook(fixture));
};

try {
  // --- WRAPPER: the real command, a fake launcher at the system boundary ---
  scenario(
    'guard',
    (fixture) => writeExecutable(fixture.launcherPath, fakeLauncher(answerLine)),
    (fixture, result) => {
      expectSilence('(a) no-corpus-root', result);
      if (existsSync(join(fixture.fixtureRoot, 'bin', 'launcher.log'))) {
        failures.push('(a) no-corpus-root: the launcher was spawned although $HOME/.mneme does not exist — the corpus guard must fire first');
      }
    },
  );
  scenario(
    'line',
    (fixture) => {
      withCorpusRoot(fixture);
      writeExecutable(fixture.launcherPath, fakeLauncher(answerLine));
    },
    (fixture, result) => {
      expectOrientationJson('(b) quoted-branch', result);
      if (!existsSync(join(fixture.fixtureRoot, 'bin', 'launcher.log'))) {
        failures.push('(b) quoted-branch: the launcher was never called');
      }
    },
  );
  scenario(
    'empty',
    (fixture) => {
      withCorpusRoot(fixture);
      writeExecutable(fixture.launcherPath, fakeLauncher(answerSilence));
    },
    (_fixture, result) => expectSilence('(c) empty-answer', result),
  );
  scenario(
    'failing',
    (fixture) => {
      withCorpusRoot(fixture);
      writeExecutable(fixture.launcherPath, fakeLauncher(answerFailure));
    },
    (_fixture, result) => expectSilence('(d) failing-launcher', result),
  );

  // --- CHAIN: the real launcher, mocks only at the engine binary ---
  const installRealLauncher = (fixture) => {
    copyFileSync(join(pluginRoot, 'bin', 'launch.sh'), fixture.launcherPath);
    chmodSync(fixture.launcherPath, 0o755);
  };
  scenario(
    'dev',
    (fixture) => {
      withCorpusRoot(fixture);
      installRealLauncher(fixture);
      writeExecutable(join(fixture.fixtureRoot, 'bin', 'mneme'), fakeBinary);
    },
    (_fixture, result) => expectOrientationJson('(e) real-launcher-dev', result),
  );
  scenario(
    'production',
    (fixture) => {
      withCorpusRoot(fixture);
      installRealLauncher(fixture);
      writeFileSync(join(fixture.fixtureRoot, 'bin', 'release.json'), releasePin);
      const cacheDir = join(fixture.home, '.mneme', 'bin', ENGINE_VERSION);
      mkdirSync(cacheDir, { recursive: true });
      writeExecutable(join(cacheDir, `mneme-${target}`), fakeBinary);
      writeExecutable(join(fixture.mockbin, 'curl'), mockCurl);
    },
    (fixture, result) => {
      expectOrientationJson('(f) real-launcher-production', result);
      if (existsSync(join(fixture.mockbin, 'curl.log'))) {
        failures.push('(f) real-launcher-production: curl was called although the pinned binary is cached');
      }
    },
  );
  scenario(
    'nopin',
    (fixture) => {
      withCorpusRoot(fixture);
      installRealLauncher(fixture);
      writeExecutable(join(fixture.mockbin, 'curl'), mockCurl);
    },
    (fixture, result) => {
      expectSilence('(g) no-pin-no-dev', result);
      if (existsSync(join(fixture.mockbin, 'curl.log'))) {
        failures.push('(g) no-pin-no-dev: curl was called without a release pin');
      }
    },
  );
} finally {
  for (const fixture of fixtures) rmSync(fixture.root, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('Orientation hook check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  'Orientation hook check passed: guard first in hooks.json, timeout within budget, the wrapper is silent without a corpus root, on an empty answer and on a failing launcher, prints the engine line as valid JSON with a quoted branch, and the real launcher carries it through in dev and production mode while staying silent without a pin.',
);
