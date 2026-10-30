#!/usr/bin/env node
//
// Gate for the UserPromptSubmit diary hook: the one UserPromptSubmit command in
// plugin/hooks/hooks.json prints the engine's one-line diary brief for the agent
// (`launch.sh diary --brief`, wrapped by plugin/scripts/diary-due.sh as hook JSON) and stays
// silent on every other outcome. Three sections:
//
//   STRUCTURE — hooks.json: UserPromptSubmit holds exactly one group with exactly one command;
//     the command STARTS with the corpus guard (GUARD-ORDER: `[ -d "$HOME/.mneme" ] || exit 0; `
//     before anything is spawned), invokes scripts/diary-due.sh through ${CLAUDE_PLUGIN_ROOT},
//     and carries a numeric timeout within the budget — the hook runs on EVERY prompt. The
//     SessionStart, PostToolUse and Stop groups are still present (their content is pinned by
//     their own gates).
//   WRAPPER — the REAL hooks.json command under /bin/sh against a fixture plugin root holding
//     the real diary-due.sh and a FAKE launcher: (a) no $HOME/.mneme → silence and the launcher
//     is never called (the guard fires first); (b) a line with `"` and `\` inside a recall
//     query → valid JSON whose additionalContext equals the line byte for byte and which
//     carries NO systemMessage; (c) an empty answer → silence; (d) a failing launcher (exit 1)
//     → silence, nothing on stderr; (e) an engine without the subcommand (exit 2 with usage on
//     stderr) → silence.
//   CHAIN — the same command with a COPY of the real launch.sh, mocks only at the binary:
//     (f) dev mode — a fake bin/mneme answering only `diary --brief`; (g) production mode —
//     a release pin, the fake binary cached under $HOME/.mneme/bin/<version>/, a mock curl
//     that must never be called; (h) no pin and no dev build → silence, the launcher's exit 1
//     swallowed.
//
// Dev tooling: lives at the repo ROOT, never inside plugin/ (same rule as the other check-*).
//
// Usage: node scripts/check-diary-hook.mjs   (also runs as part of npm test)

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
const WRAPPER_INVOCATION = '${CLAUDE_PLUGIN_ROOT}/scripts/diary-due.sh';
const TIMEOUT_BUDGET_SECONDS = 5;
const PINNED_HOOK_GROUPS = ['SessionStart', 'PostToolUse', 'Stop'];
const ENGINE_VERSION = '9.9.9';
const DIARY_LINE =
  'diary: run 0f3b1c2d-4e5f-4a6b-8c7d-9e0f1a2b3c4d complete without a diary entry · memory gaps since the last note: "why the "quoted" gate failed", "path\\with\\backslash"';

// --- STRUCTURE: the hooks.json entry itself ---
const hooksJson = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));

for (const group of PINNED_HOOK_GROUPS.filter((name) => hooksJson.hooks[name] === undefined)) {
  failures.push(`STRUCTURE: the ${group} hook group is gone — the diary hook is ADDED to hooks.json, never swapped in for another group`);
}
const diaryGroups = hooksJson.hooks.UserPromptSubmit;
const diaryHooks = diaryGroups?.[0]?.hooks ?? [];
if (diaryGroups === undefined) {
  failures.push('STRUCTURE: hooks.json has no UserPromptSubmit group — the diary line would never reach the agent');
} else if (diaryGroups.length !== 1 || diaryHooks.length !== 1) {
  failures.push(`STRUCTURE: UserPromptSubmit must hold exactly one group with exactly one command (got ${diaryGroups.length} group(s), ${diaryHooks.length} command(s))`);
}
const diaryHook = diaryHooks[0];

if (diaryHook === undefined) {
  failures.push('STRUCTURE: UserPromptSubmit[0].hooks[0] (the diary command) is missing');
} else {
  if (!diaryHook.command.startsWith(GUARD_PREFIX)) {
    failures.push(`GUARD-ORDER: the diary command must START with "${GUARD_PREFIX}" — the corpus guard comes before any spawn, so a machine without mneme corpora pays nothing on every prompt`);
  }
  if (!diaryHook.command.includes(WRAPPER_INVOCATION)) {
    failures.push(`STRUCTURE: the diary command must invoke ${WRAPPER_INVOCATION} — the logic lives in the wrapper, not in the JSON string`);
  }
  if (typeof diaryHook.timeout !== 'number' || diaryHook.timeout > TIMEOUT_BUDGET_SECONDS) {
    failures.push(`STRUCTURE: the diary command needs a numeric timeout of at most ${TIMEOUT_BUDGET_SECONDS}s (got ${JSON.stringify(diaryHook.timeout)}) — the engine answers in milliseconds and the hook runs on every prompt, so a hung launcher must not hold a prompt`);
  }
}
const diaryCommand = diaryHook?.command ?? '';

// --- fixtures ---
const platformTarget = () => {
  const os = { darwin: 'darwin', linux: 'linux' }[process.platform];
  const arch = { arm64: 'arm64', x64: 'x64' }[process.arch];
  if (os === undefined || arch === undefined) {
    throw new Error(`check-diary-hook: unsupported fixture host ${process.platform}/${process.arch}`);
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
if [ "$#" -ne 2 ] || [ "$1" != diary ] || [ "$2" != --brief ]; then
  printf 'usage: mneme diary --brief\\n' >&2
  exit 2
fi
${answer}
`;
const answerLine = `printf '%s\\n' '${DIARY_LINE}'`;
const answerSilence = 'exit 0';
const answerFailure = `printf 'mneme-launch: error: no local build and no release pin\\n' >&2\nexit 1`;
const answerUsage = `printf 'usage: mneme diary --brief\\n' >&2\nexit 2`;

const fakeBinary = `#!/bin/sh
if [ "$#" -eq 2 ] && [ "$1" = diary ] && [ "$2" = --brief ]; then
  printf '%s\\n' '${DIARY_LINE}'
  exit 0
fi
printf 'usage: mneme diary --brief\\n' >&2
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
  const root = mkdtempSync(join(tmpdir(), `diary-${name}-`));
  const fixtureRoot = join(root, 'plugin');
  mkdirSync(join(fixtureRoot, 'bin'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'scripts'), { recursive: true });
  copyFileSync(join(pluginRoot, 'scripts', 'diary-due.sh'), join(fixtureRoot, 'scripts', 'diary-due.sh'));
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
  spawnSync('/bin/sh', ['-c', diaryCommand], {
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

const expectDiaryJson = (label, result) => {
  if (result.status !== 0) failures.push(`${label}: expected exit 0, got ${result.status}`);
  if (result.stderr !== '') failures.push(`${label}: expected an empty stderr, got: ${result.stderr.trim().slice(0, 160)}`);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    failures.push(`${label}: stdout is not valid JSON (${error.message}): ${result.stdout.trim().slice(0, 200)}`);
    return;
  }
  if (parsed.hookSpecificOutput?.hookEventName !== 'UserPromptSubmit') {
    failures.push(`${label}: hookSpecificOutput.hookEventName must be "UserPromptSubmit"`);
  }
  if (parsed.hookSpecificOutput?.additionalContext !== DIARY_LINE) {
    failures.push(`${label}: additionalContext must be the engine's line byte for byte (got: ${JSON.stringify(parsed.hookSpecificOutput?.additionalContext)})`);
  }
  if ('systemMessage' in parsed) {
    failures.push(`${label}: the hook must carry no systemMessage — the diary line is for the agent; the person sees the agent act on it`);
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
      expectDiaryJson('(b) quoted-and-backslashed-query', result);
      if (!existsSync(join(fixture.fixtureRoot, 'bin', 'launcher.log'))) {
        failures.push('(b) quoted-and-backslashed-query: the launcher was never called');
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
  scenario(
    'usage',
    (fixture) => {
      withCorpusRoot(fixture);
      writeExecutable(fixture.launcherPath, fakeLauncher(answerUsage));
    },
    (_fixture, result) => expectSilence('(e) engine-without-subcommand', result),
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
    (_fixture, result) => expectDiaryJson('(f) real-launcher-dev', result),
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
      expectDiaryJson('(g) real-launcher-production', result);
      if (existsSync(join(fixture.mockbin, 'curl.log'))) {
        failures.push('(g) real-launcher-production: curl was called although the pinned binary is cached');
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
      expectSilence('(h) no-pin-no-dev', result);
      if (existsSync(join(fixture.mockbin, 'curl.log'))) {
        failures.push('(h) no-pin-no-dev: curl was called without a release pin');
      }
    },
  );
} finally {
  for (const fixture of fixtures) rmSync(fixture.root, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('Diary hook check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  'Diary hook check passed: guard first in the single UserPromptSubmit command, timeout within budget, the other hook groups untouched, the wrapper is silent without a corpus root, on an empty answer, on a failing launcher and on an engine without the subcommand, prints the engine line with quotes and backslashes as valid JSON without a systemMessage, and the real launcher carries it through in dev and production mode while staying silent without a pin.',
);
