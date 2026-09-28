import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateChromium } from './browser-locate.mjs';
import { FiguraError } from './figura-error.mjs';

const BUNDLE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POPPLER_RECIPE = 'install poppler: brew install poppler (macOS) or apt install poppler-utils (Debian/Ubuntu)';
const PSQL_RECIPE =
  'install the PostgreSQL client: brew install libpq && brew link --force libpq (macOS) or apt install postgresql-client (Debian/Ubuntu)';
const PREREQUISITES_BY_COMMAND = new Map([
  ['check', ['d2', 'chromium']],
  ['build', ['d2', 'chromium', 'pdftoppm']],
  ['erd', ['d2']],
]);

function lastLine(text) {
  return text.trim().split('\n').at(-1) ?? '';
}

function d2Problem({ environment, bundleRoot }) {
  const launcher = join(bundleRoot, 'bin', 'launch.sh');
  const warm = spawnSync('/bin/sh', [launcher, '--warm'], { env: environment, encoding: 'utf8' });
  if (warm.status === 0) return undefined;
  const launcherLine = lastLine(warm.stderr ?? '');
  return new FiguraError(
    'D2-UNAVAILABLE',
    `${launcher} --warm could not provide d2`,
    launcherLine === '' ? `the launcher exited with status ${warm.status}` : launcherLine,
  );
}

function chromiumProblem({ environment, applicationPaths }) {
  try {
    locateChromium({ environment, applicationPaths });
    return undefined;
  } catch (error) {
    if (error instanceof FiguraError) return error;
    throw error;
  }
}

function toolProblem(code, command, versionArguments, recipe, { environment }) {
  const query = spawnSync(command, versionArguments, { env: environment, encoding: 'utf8' });
  if (query.error?.code === 'ENOENT') return new FiguraError(code, `${command} is not on PATH`, recipe);
  if (query.error !== undefined) return new FiguraError(code, `${command} could not run: ${query.error.message}`, recipe);
  if (query.status !== 0) {
    const detail = lastLine(`${query.stdout ?? ''}${query.stderr ?? ''}`);
    return new FiguraError(code, `${command} ${versionArguments.join(' ')} exited with status ${query.status}${detail === '' ? '' : `: ${detail}`}`, recipe);
  }
  return undefined;
}

const PROBES = new Map([
  ['d2', d2Problem],
  ['chromium', chromiumProblem],
  ['pdftoppm', (options) => toolProblem('PDFTOPPM-NOT-FOUND', 'pdftoppm', ['-v'], POPPLER_RECIPE, options)],
  ['psql', (options) => toolProblem('PSQL-NOT-FOUND', 'psql', ['--version'], PSQL_RECIPE, options)],
]);

export function prerequisitesFor(command, { erdSource } = {}) {
  const prerequisites = PREREQUISITES_BY_COMMAND.get(command);
  if (prerequisites === undefined) throw new Error(`preflight: unknown command "${command}"`);
  return command === 'erd' && erdSource === 'psql' ? [...prerequisites, 'psql'] : prerequisites;
}

export function preflight(command, { erdSource, environment = process.env, bundleRoot = BUNDLE_ROOT, applicationPaths } = {}) {
  const options = { environment, bundleRoot, applicationPaths };
  return prerequisitesFor(command, { erdSource })
    .map((prerequisite) => PROBES.get(prerequisite)(options))
    .filter((problem) => problem !== undefined);
}
