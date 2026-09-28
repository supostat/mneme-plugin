import { spawnSync } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { FiguraError } from './figura-error.mjs';

export const MINIMUM_CHROMIUM_MAJOR = 131;
export const CHROMIUM_INSTALL_RECIPE =
  'install Chromium 131 or newer: brew install --cask google-chrome (macOS) or apt install chromium (Debian/Ubuntu), or point FIGURA_CHROME at a Chromium binary';
const CHROMIUM_UPGRADE_RECIPE =
  'upgrade it: brew upgrade --cask google-chrome (macOS) or apt install --only-upgrade chromium (Debian/Ubuntu), or point FIGURA_CHROME at a Chromium 131 or newer';
const PATH_COMMANDS = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
const MACOS_APPLICATIONS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const CHROMIUM_VERSION = /(\d+)\.\d+\.\d+\.\d+/;
const VERSION_QUERY_TIMEOUT_MILLISECONDS = 10_000;

function isExecutableFile(path) {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function findOnPath(command, searchPath) {
  for (const directory of (searchPath ?? '').split(delimiter)) {
    if (directory === '') continue;
    const candidate = join(directory, command);
    if (isExecutableFile(candidate)) return candidate;
  }
  return undefined;
}

function firstCandidate(environment, applicationPaths) {
  if (environment.FIGURA_CHROME !== undefined && environment.FIGURA_CHROME !== '') {
    if (!isExecutableFile(environment.FIGURA_CHROME)) {
      throw new FiguraError(
        'CHROMIUM-NOT-FOUND',
        `FIGURA_CHROME points at ${environment.FIGURA_CHROME}, which is not an executable file`,
        CHROMIUM_INSTALL_RECIPE,
      );
    }
    return environment.FIGURA_CHROME;
  }
  for (const command of PATH_COMMANDS) {
    const onPath = findOnPath(command, environment.PATH);
    if (onPath !== undefined) return onPath;
  }
  return applicationPaths.find(isExecutableFile);
}

function chromiumMajor(executablePath, environment) {
  const query = spawnSync(executablePath, ['--version'], {
    env: environment,
    encoding: 'utf8',
    timeout: VERSION_QUERY_TIMEOUT_MILLISECONDS,
  });
  const reported = `${query.stdout ?? ''}${query.stderr ?? ''}`.trim();
  const version = CHROMIUM_VERSION.exec(reported);
  if (query.error !== undefined || version === null) {
    throw new FiguraError(
      'CHROMIUM-NOT-FOUND',
      `${executablePath} did not report a Chromium version (--version printed ${JSON.stringify(reported)})`,
      CHROMIUM_INSTALL_RECIPE,
    );
  }
  return { major: Number(version[1]), versionText: reported };
}

export function locateChromium({ environment = process.env, applicationPaths = MACOS_APPLICATIONS } = {}) {
  const executablePath = firstCandidate(environment, applicationPaths);
  if (executablePath === undefined) {
    throw new FiguraError(
      'CHROMIUM-NOT-FOUND',
      `no Chromium in FIGURA_CHROME, on PATH (${PATH_COMMANDS.join(', ')}) or in /Applications`,
      CHROMIUM_INSTALL_RECIPE,
    );
  }
  const { major, versionText } = chromiumMajor(executablePath, environment);
  if (major < MINIMUM_CHROMIUM_MAJOR) {
    throw new FiguraError(
      'CHROMIUM-TOO-OLD',
      `${executablePath} is Chromium ${major}; figura needs ${MINIMUM_CHROMIUM_MAJOR} or newer to print page margin boxes`,
      CHROMIUM_UPGRADE_RECIPE,
    );
  }
  return { executablePath, major, versionText };
}
