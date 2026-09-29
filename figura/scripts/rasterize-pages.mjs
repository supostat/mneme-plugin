import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { FiguraError } from './figura-error.mjs';

const PREVIEW_ROOT_NAME = '.figura';
const PREVIEW_RESOLUTION_DPI = '120';
const PDFTOPPM_PAGE_FILE = /^page-(\d+)\.png$/;

export function previewDirectoryFor(documentPath) {
  return join(dirname(documentPath), PREVIEW_ROOT_NAME, basename(documentPath, extname(documentPath)));
}

export function clearPreviews(documentPath) {
  rmSync(previewDirectoryFor(documentPath), { recursive: true, force: true });
}

function ensurePreviewRoot(documentPath) {
  const previewRoot = join(dirname(documentPath), PREVIEW_ROOT_NAME);
  if (existsSync(previewRoot)) return;
  mkdirSync(previewRoot);
  writeFileSync(join(previewRoot, '.gitignore'), '*\n');
}

export function rasterizePages(pdfPath, documentPath, { environment = process.env } = {}) {
  ensurePreviewRoot(documentPath);
  const previewDirectory = previewDirectoryFor(documentPath);
  rmSync(previewDirectory, { recursive: true, force: true });
  mkdirSync(previewDirectory);
  const run = spawnSync('pdftoppm', ['-png', '-r', PREVIEW_RESOLUTION_DPI, pdfPath, join(previewDirectory, 'page')], {
    env: environment,
    encoding: 'utf8',
  });
  if (run.error !== undefined || run.status !== 0) {
    const detail = run.error?.message ?? (run.stderr ?? '').trim().split('\n').at(-1);
    throw new FiguraError('PREVIEW-FAILED', `pdftoppm could not rasterize ${pdfPath}: ${detail}`, 'run the build again; if it repeats, open the PDF itself');
  }
  return readdirSync(previewDirectory)
    .map((fileName) => ({ fileName, pageNumber: Number(PDFTOPPM_PAGE_FILE.exec(fileName)?.[1]) }))
    .filter(({ pageNumber }) => Number.isInteger(pageNumber))
    .sort((first, second) => first.pageNumber - second.pageNumber)
    .map(({ fileName, pageNumber }) => {
      const previewPath = join(previewDirectory, `page-${String(pageNumber).padStart(2, '0')}.png`);
      if (fileName !== basename(previewPath)) renameSync(join(previewDirectory, fileName), previewPath);
      return previewPath;
    });
}
