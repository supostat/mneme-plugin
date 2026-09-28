#!/usr/bin/env node
//
// Gate for figura's browser layer on fakes at the process boundary: the Chromium search order through
// FIGURA_CHROME and PATH stubs and the version refusal, the CDP client against a fake browser on fd 3
// and 4, the loopback server, and a preflight that lists every missing dependency.

import { accessSync, chmodSync, constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateChromium } from '../figura/scripts/browser-locate.mjs';
import { openCdpSession } from '../figura/scripts/cdp-session.mjs';
import { startLoopbackServer } from '../figura/scripts/loopback-server.mjs';
import { preflight } from '../figura/scripts/preflight.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAKE_BROWSER = join(REPO_ROOT, 'scripts', 'fixtures', 'figura', 'fake-browser.mjs');
const REAL_LAUNCHER = join(REPO_ROOT, 'figura', 'bin', 'launch.sh');
const LAUNCHER_TOOLS = ['dirname', 'uname', 'sed', 'head', 'awk', 'mkdir', 'rm', 'mv', 'chmod'];
const LAUNCH_FLAGS = ['--headless', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe'];
const CDP_TIMEOUT_MILLISECONDS = 500;
const failures = [];
const workDirectory = mkdtempSync(join(tmpdir(), 'figura-browser-check-'));

function writeExecutable(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  return path;
}

function writeBrowserStub(path, versionLine) {
  return writeExecutable(path, `#!/bin/sh\necho "${versionLine}"\n`);
}

function expectFailure(caseName, error, expectedCode, expectedText) {
  if (error?.code !== expectedCode || !error.message.includes(expectedText)) {
    failures.push(`${caseName}: expected ${expectedCode} naming "${expectedText}", got: ${error?.message ?? 'no error'}`);
  }
}

function locateFailure(options) {
  try {
    locateChromium(options);
    return undefined;
  } catch (error) {
    return error;
  }
}

async function rejectionOf(promise) {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

function checkChromiumSearch() {
  const firstPathDirectory = join(workDirectory, 'path-first');
  const secondPathDirectory = join(workDirectory, 'path-second');
  const emptyDirectory = join(workDirectory, 'empty');
  mkdirSync(emptyDirectory);
  writeBrowserStub(join(firstPathDirectory, 'chromium'), 'Chromium 140.0.7339.0');
  const stable = writeBrowserStub(join(secondPathDirectory, 'google-chrome-stable'), 'Google Chrome 150.0.7700.0');
  const pinned = writeBrowserStub(join(workDirectory, 'pinned', 'custom-chromium'), 'Chromium 135.0.7049.0');
  const application = writeBrowserStub(join(workDirectory, 'Applications', 'Chromium'), 'Chromium 131.0.6778.0');
  const tooOld = writeBrowserStub(join(workDirectory, 'old', 'chromium'), 'Chromium 120.0.6099.0');
  const pathStubs = `${firstPathDirectory}${delimiter}${secondPathDirectory}`;

  const locatedCases = [
    ['command order beats PATH order', { environment: { PATH: pathStubs }, applicationPaths: [] }, stable],
    ['FIGURA_CHROME beats PATH', { environment: { PATH: pathStubs, FIGURA_CHROME: pinned }, applicationPaths: [] }, pinned],
    ['application paths come after PATH', { environment: { PATH: emptyDirectory }, applicationPaths: [application] }, application],
  ];
  for (const [caseName, options, expected] of locatedCases) {
    let located;
    try {
      located = locateChromium(options).executablePath;
    } catch (error) {
      failures.push(`${caseName}: ${error.message}`);
      continue;
    }
    if (located !== expected) failures.push(`${caseName}: located ${located}, expected ${expected}`);
  }
  expectFailure(
    'no Chromium anywhere',
    locateFailure({ environment: { PATH: emptyDirectory }, applicationPaths: [] }),
    'CHROMIUM-NOT-FOUND',
    'brew install --cask google-chrome (macOS) or apt install chromium (Debian/Ubuntu)',
  );
  expectFailure(
    'FIGURA_CHROME on a missing file',
    locateFailure({ environment: { PATH: pathStubs, FIGURA_CHROME: join(workDirectory, 'missing-chrome') }, applicationPaths: [] }),
    'CHROMIUM-NOT-FOUND',
    'FIGURA_CHROME points at',
  );
  expectFailure(
    'Chromium below the minimum',
    locateFailure({ environment: { PATH: emptyDirectory, FIGURA_CHROME: tooOld }, applicationPaths: [] }),
    'CHROMIUM-TOO-OLD',
    'is Chromium 120; figura needs 131 or newer',
  );
}

async function checkCdpClient() {
  const session = openCdpSession({ executablePath: FAKE_BROWSER, commandTimeoutMilliseconds: CDP_TIMEOUT_MILLISECONDS });
  try {
    const version = await session.send('Browser.getVersion');
    if (version.product !== 'HeadlessChrome/131.0.0.0') {
      failures.push(`CDP response: Browser.getVersion answered ${JSON.stringify(version)}`);
    }
    const { arguments: browserArguments } = await session.send('Browser.getBrowserCommandLine');
    for (const flag of [...LAUNCH_FLAGS, `--user-data-dir=${session.profileDirectory}`]) {
      if (!browserArguments.includes(flag)) failures.push(`CDP launch: the browser started without ${flag}`);
    }
    if (!existsSync(session.profileDirectory)) {
      failures.push('CDP launch: the temporary profile directory is missing while the browser runs');
    }
    const [, event] = await Promise.all([
      session.send('Target.setDiscoverTargets', { discover: true }),
      session.waitForEvent('Target.targetCreated'),
    ]);
    if (event.targetInfo?.targetId !== 'fake-page') {
      failures.push(`CDP event: Target.targetCreated carried ${JSON.stringify(event)}`);
    }
    expectFailure(
      'CDP command error',
      await rejectionOf(session.send('Page.navigate', { url: 'about:blank' })),
      'CDP-COMMAND-FAILED',
      "Page.navigate failed: 'Page.navigate' wasn't found",
    );
    expectFailure(
      'CDP command timeout',
      await rejectionOf(session.send('Runtime.evaluate', { expression: '1' })),
      'CDP-TIMEOUT',
      `Runtime.evaluate got no answer within ${CDP_TIMEOUT_MILLISECONDS} ms`,
    );
  } finally {
    await session.close();
  }
  if (existsSync(session.profileDirectory)) failures.push('CDP close: the temporary profile directory was left behind');
  expectFailure('CDP after close', await rejectionOf(session.send('Browser.getVersion')), 'BROWSER-EXITED', 'the browser exited');
}

function rawGet(origin, path) {
  const { hostname, port } = new URL(origin);
  return new Promise((resolveResponse, rejectResponse) => {
    const outgoing = request({ hostname, port, path, method: 'GET' }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => resolveResponse({ status: response.statusCode, contentType: response.headers['content-type'], body }));
    });
    outgoing.on('error', rejectResponse);
    outgoing.end();
  });
}

async function checkLoopbackServer() {
  const documentDirectory = join(workDirectory, 'served-document');
  mkdirSync(documentDirectory);
  writeFileSync(join(documentDirectory, 'page.html'), '<p>served</p>');
  writeFileSync(join(workDirectory, 'secret.html'), '<p>secret</p>');
  const server = await startLoopbackServer([{ urlPrefix: '/document/', directory: documentDirectory }]);
  try {
    if (!server.origin.startsWith('http://127.0.0.1:')) failures.push(`loopback: listens on ${server.origin}, not on 127.0.0.1`);
    const page = await rawGet(server.origin, '/document/page.html');
    if (page.status !== 200 || page.body !== '<p>served</p>' || !page.contentType.startsWith('text/html')) {
      failures.push(`loopback: /document/page.html answered ${page.status} ${page.contentType} ${JSON.stringify(page.body)}`);
    }
    for (const foreignPath of ['/secret.html', '/document/..%2Fsecret.html', '/document/missing.html', '/document/']) {
      const foreign = await rawGet(server.origin, foreignPath);
      if (foreign.status !== 404) failures.push(`loopback: ${foreignPath} answered ${foreign.status}, expected 404`);
    }
  } finally {
    await server.close();
  }
}

function findOnCurrentPath(tool) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(directory, tool);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

function linkTools(directory, tools) {
  mkdirSync(directory, { recursive: true });
  for (const tool of tools) {
    const toolPath = findOnCurrentPath(tool);
    if (toolPath !== undefined) symlinkSync(toolPath, join(directory, tool));
  }
}

function expectCodes(caseName, problems, expectedCodes) {
  const codes = problems.map((problem) => problem.code).sort();
  if (JSON.stringify(codes) !== JSON.stringify([...expectedCodes].sort())) {
    failures.push(`preflight ${caseName}: reported ${JSON.stringify(codes)}, expected ${JSON.stringify(expectedCodes)}`);
  }
}

function expectProblemText(caseName, problems, code, expectedText) {
  const problem = problems.find((candidate) => candidate.code === code);
  if (problem === undefined || !problem.message.includes(expectedText)) {
    failures.push(`preflight ${caseName}: ${code} should name "${expectedText}", got: ${problem?.message ?? 'no such problem'}`);
  }
}

function checkPreflight() {
  const bundleWithoutPin = join(workDirectory, 'bundle-without-pin');
  mkdirSync(join(bundleWithoutPin, 'bin'), { recursive: true });
  copyFileSync(REAL_LAUNCHER, join(bundleWithoutPin, 'bin', 'launch.sh'));
  const launcherTools = join(workDirectory, 'launcher-tools');
  linkTools(launcherTools, LAUNCHER_TOOLS);
  const home = join(workDirectory, 'home');
  mkdirSync(home);
  const bareEnvironment = { PATH: launcherTools, HOME: home };
  const options = { environment: bareEnvironment, bundleRoot: bundleWithoutPin, applicationPaths: [] };

  const buildProblems = preflight('build', options);
  expectCodes('build without d2, Chromium and poppler', buildProblems, ['D2-UNAVAILABLE', 'CHROMIUM-NOT-FOUND', 'PDFTOPPM-NOT-FOUND']);
  expectProblemText('build', buildProblems, 'D2-UNAVAILABLE', 'figura-launch: error: no local d2 and no release pin');
  expectProblemText('build', buildProblems, 'CHROMIUM-NOT-FOUND', 'brew install --cask google-chrome');
  expectProblemText('build', buildProblems, 'PDFTOPPM-NOT-FOUND', 'pdftoppm is not on PATH — install poppler: brew install poppler');

  const brokenPoppler = join(workDirectory, 'broken-poppler');
  writeExecutable(join(brokenPoppler, 'pdftoppm'), '#!/bin/sh\necho "pdftoppm: broken install" >&2\nexit 3\n');
  const brokenPopplerProblems = preflight('build', {
    ...options,
    environment: { ...bareEnvironment, PATH: `${launcherTools}${delimiter}${brokenPoppler}` },
  });
  expectProblemText('build with a broken pdftoppm', brokenPopplerProblems, 'PDFTOPPM-NOT-FOUND', 'pdftoppm -v exited with status 3: pdftoppm: broken install');

  expectCodes('check', preflight('check', options), ['D2-UNAVAILABLE', 'CHROMIUM-NOT-FOUND']);
  const psqlProblems = preflight('erd', { ...options, erdSource: 'psql' });
  expectCodes('erd --source psql', psqlProblems, ['D2-UNAVAILABLE', 'PSQL-NOT-FOUND']);
  expectProblemText('erd --source psql', psqlProblems, 'PSQL-NOT-FOUND', 'apt install postgresql-client');
  expectCodes('erd --source manual', preflight('erd', { ...options, erdSource: 'manual' }), ['D2-UNAVAILABLE']);
}

const CHECKS = [
  ['Chromium search', checkChromiumSearch],
  ['CDP client', checkCdpClient],
  ['loopback server', checkLoopbackServer],
  ['preflight', checkPreflight],
];

try {
  for (const [checkName, check] of CHECKS) {
    try {
      await check();
    } catch (error) {
      failures.push(`${checkName}: ${error.stack ?? error.message}`);
    }
  }
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('figura browser check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  'figura browser check passed: the Chromium search order and version floor hold, the CDP client answers, streams events, fails a command, times out and cleans up against a fake browser, the loopback server serves only its mounts, and preflight lists every missing dependency.',
);
