import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FiguraError } from './figura-error.mjs';
import { d2Classes, d2ThemeArguments } from './theme.mjs';

const BUNDLE_LAUNCHER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'launch.sh');
const D2_ERROR_PREFIX = 'err: ';

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function d2FailureLine(stderr, sourcePath, sourceLineOffset, exitStatus) {
  const lines = stderr.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  const errorLine = lines.find((line) => line.startsWith(D2_ERROR_PREFIX)) ?? lines.at(-1);
  if (errorLine === undefined) return `d2 exited with status ${exitStatus}`;
  const position = new RegExp(`${escapeRegExp(sourcePath)}:(\\d+):(\\d+):\\s*(.*)$`).exec(errorLine);
  if (position === null) return errorLine.replace(D2_ERROR_PREFIX, '');
  const [, fileLine, column, message] = position;
  return `line ${Number(fileLine) - sourceLineOffset}, column ${column}: ${message}`;
}

export function renderDiagram(diagram, theme, { workDirectory, launcherPath = BUNDLE_LAUNCHER, environment = process.env }) {
  const fileStem = `diagram-${String(diagram.ordinal).padStart(2, '0')}`;
  const sourcePath = join(workDirectory, `${fileStem}.d2`);
  const svgPath = join(workDirectory, `${fileStem}.svg`);
  const themePrefix = `${d2Classes(theme)}\n`;
  writeFileSync(sourcePath, `${themePrefix}${diagram.source}`);
  const run = spawnSync(
    '/bin/sh',
    [launcherPath, '--layout', diagram.layout, ...d2ThemeArguments(theme), sourcePath, svgPath],
    { env: environment, encoding: 'utf8' },
  );
  if (run.status !== 0) {
    const sourceLineOffset = themePrefix.split('\n').length - 1;
    const captionNote = diagram.caption === undefined ? '' : ` («${diagram.caption}»)`;
    throw new FiguraError(
      'D2-FAILED',
      `diagram ${diagram.ordinal}${captionNote}: ${d2FailureLine(run.stderr ?? '', sourcePath, sourceLineOffset, run.status)}`,
      'fix the D2 source of this diagram and build again',
    );
  }
  return { svgPath, svg: readFileSync(svgPath, 'utf8') };
}
