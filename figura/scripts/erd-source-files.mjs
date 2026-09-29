import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FiguraError } from './figura-error.mjs';

const SKIPPED_DIRECTORIES = new Set(['node_modules']);

function unreadable(path, cause) {
  return new FiguraError('ERD-INVALID', `cannot read ${path}: ${cause.message}`, 'pass an existing schema file or directory');
}

function filesUnder(directory, extension) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return filesUnder(path, extension);
      return entry.isFile() && entry.name.endsWith(extension) ? [path] : [];
    });
}

export function readSourceFiles(path, extension) {
  let paths;
  try {
    paths = statSync(path).isDirectory() ? filesUnder(path, extension).sort() : [path];
  } catch (cause) {
    throw unreadable(path, cause);
  }
  if (paths.length === 0) {
    throw new FiguraError('ERD-INVALID', `${path} holds no ${extension} files`, `pass a ${extension} file or a directory that holds them`);
  }
  return paths.map((filePath) => {
    try {
      return { path: filePath, text: readFileSync(filePath, 'utf8') };
    } catch (cause) {
      throw unreadable(filePath, cause);
    }
  });
}
