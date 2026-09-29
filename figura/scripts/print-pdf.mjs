import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openCdpSession } from './cdp-session.mjs';
import { decodeHtmlText } from './extract-diagrams.mjs';
import { FiguraError } from './figura-error.mjs';
import { startLoopbackServer } from './loopback-server.mjs';
import { themeCss } from './theme.mjs';

const BUNDLE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCUMENT_URL_PREFIX = '/document/';
const BUNDLE_URL_PREFIX = '/figura/';
const PRINTABLE_FILE_NAME = 'document.html';
const KEEP_GROUP_CLASS = 'heading-keep-group';
const KEPT_BLOCK_TAGS = new Set(['figure', 'table', 'p', 'pre', 'ul', 'ol', 'div', 'blockquote']);
const HEADING_OPENING = /<(h[1-3])\b/gi;
const TITLE_ELEMENT = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i;
const HEAD_CLOSING = /<\/head\s*>/i;
const PDF_PAGE_OBJECT = /\/Type\s*\/Page(?!s)/g;
const AWAIT_FONTS = 'document.fonts.ready.then(() => document.fonts.status)';

function elementEnd(html, start, tagName) {
  const tagPattern = new RegExp(`<(/?)${tagName}\\b[^>]*>`, 'gi');
  tagPattern.lastIndex = start;
  let depth = 0;
  for (let tag = tagPattern.exec(html); tag !== null; tag = tagPattern.exec(html)) {
    depth += tag[1] === '/' ? -1 : 1;
    if (depth === 0) return tag.index + tag[0].length;
  }
  return -1;
}

function nextElementStart(html, position) {
  const whitespace = /\s*/y;
  whitespace.lastIndex = position;
  whitespace.exec(html);
  return whitespace.lastIndex;
}

function tagNameAt(html, position) {
  return /^<([a-z][a-z0-9]*)\b/i.exec(html.slice(position, position + 32))?.[1].toLowerCase();
}

export function keepHeadingsWithNextBlock(html) {
  let kept = '';
  let copiedUpTo = 0;
  HEADING_OPENING.lastIndex = 0;
  for (let heading = HEADING_OPENING.exec(html); heading !== null; heading = HEADING_OPENING.exec(html)) {
    let groupEnd = elementEnd(html, heading.index, heading[1]);
    let blockStart = nextElementStart(html, groupEnd);
    while (/^h[1-3]$/.test(tagNameAt(html, blockStart) ?? '')) {
      groupEnd = elementEnd(html, blockStart, tagNameAt(html, blockStart));
      blockStart = nextElementStart(html, groupEnd);
    }
    const blockTag = tagNameAt(html, blockStart);
    if (!KEPT_BLOCK_TAGS.has(blockTag)) {
      HEADING_OPENING.lastIndex = groupEnd;
      continue;
    }
    const blockEnd = elementEnd(html, blockStart, blockTag);
    kept += `${html.slice(copiedUpTo, heading.index)}<div class="${KEEP_GROUP_CLASS}">${html.slice(heading.index, blockEnd)}</div>`;
    copiedUpTo = blockEnd;
    HEADING_OPENING.lastIndex = blockEnd;
  }
  return `${kept}${html.slice(copiedUpTo)}`;
}

function cssString(text) {
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replace(/\s+/g, ' ')}"`;
}

export function printableDocument(html, theme) {
  if (!HEAD_CLOSING.test(html)) {
    throw new FiguraError('DOCUMENT-INVALID', 'the document has no <head> for the print styles', 'start the document from figura/template/document.html');
  }
  const title = decodeHtmlText(TITLE_ELEMENT.exec(html)?.[1] ?? '').trim();
  const printStyles = [
    `<link rel="stylesheet" href="${BUNDLE_URL_PREFIX}template/print.css" />`,
    `<style>\n${themeCss(theme)}</style>`,
    `<style>@page { @bottom-left { content: ${cssString(title)}; } }</style>`,
  ].join('\n');
  return keepHeadingsWithNextBlock(html.replace(HEAD_CLOSING, (closing) => `${printStyles}\n${closing}`));
}

export async function printPdf(printableHtml, { executablePath, pdfPath }) {
  const buildDirectory = mkdtempSync(join(tmpdir(), 'figura-print-'));
  writeFileSync(join(buildDirectory, PRINTABLE_FILE_NAME), printableHtml);
  const server = await startLoopbackServer([
    { urlPrefix: DOCUMENT_URL_PREFIX, directory: buildDirectory },
    { urlPrefix: BUNDLE_URL_PREFIX, directory: BUNDLE_ROOT },
  ]);
  const session = openCdpSession({ executablePath });
  try {
    const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
    await session.send('Page.enable', {}, sessionId);
    const url = `${server.origin}${DOCUMENT_URL_PREFIX}${PRINTABLE_FILE_NAME}`;
    const [navigation] = await Promise.all([
      session.send('Page.navigate', { url }, sessionId),
      session.waitForEvent('Page.loadEventFired', { sessionId }),
    ]);
    if (navigation.errorText !== undefined) {
      throw new FiguraError('PRINT-FAILED', `Chromium could not open ${url}: ${navigation.errorText}`, 'run the build again');
    }
    await session.send('Runtime.evaluate', { expression: AWAIT_FONTS, awaitPromise: true, returnByValue: true }, sessionId);
    const { data } = await session.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true }, sessionId);
    const pdf = Buffer.from(data, 'base64');
    writeFileSync(pdfPath, pdf);
    return { pageCount: (pdf.toString('latin1').match(PDF_PAGE_OBJECT) ?? []).length };
  } finally {
    await session.close();
    await server.close();
    rmSync(buildDirectory, { recursive: true, force: true });
  }
}
