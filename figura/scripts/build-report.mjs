import { realpathSync } from 'node:fs';
import { relative } from 'node:path';

function counted(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function failureReport(documentPath, problems) {
  return [`figura: ${documentPath} FAILED:`, ...problems.map((problem) => `  - ${problem.message}`)].join('\n');
}

function pathFromWorkingDirectory(existingPath) {
  return relative(process.cwd(), realpathSync(existingPath));
}

export function buildSuccessLine({ pdfPath, pageCount, diagramCount, warnings, previewPaths }) {
  const previews = previewPaths.map(pathFromWorkingDirectory).join(', ');
  return `figura: built ${pathFromWorkingDirectory(pdfPath)} — ${counted(pageCount, 'page', 'pages')}, ${counted(diagramCount, 'diagram', 'diagrams')}, ${counted(warnings.length, 'warning', 'warnings')}; previews: ${previews}`;
}
