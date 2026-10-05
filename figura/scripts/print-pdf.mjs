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
const UNTOUCHED_BLOCK_OPENING = /<(pre|svg)\b/gi;
const INLINE_CODE = /(<code\b[^>]*>)([\s\S]*?)(<\/code\s*>)/gi;
const CODE_MARKUP_OR_SEPARATOR_RUN = /<[^>]*>|&[#a-z0-9]+;|(?:::|[_/.])+/gi;
const CODE_TAG = /<[^>]*>/g;
const CODE_CHARACTER_REFERENCE = /&[#a-z0-9]+;/gi;
const BREAK_OPPORTUNITY = '<wbr>';
const POINTS_PER_PIXEL = 0.75;
const TABLE_TOO_WIDE_REMEDY =
  'use fewer columns or shorter cell text, or add <wbr> inside a long identifier; figura breaks inline code only after _ / :: . and never inside a word';
const MEASURE_TABLE_OVERFLOWS = `(function measureFiguraTables() {
  const body = document.body;
  const bodyWidth = body.style.width;
  body.style.width = 'calc(var(--figura-page-width) - var(--figura-page-margin-left) - var(--figura-page-margin-right))';
  const overflows = [...document.querySelectorAll('table')].flatMap((table, index) => {
    const container = getComputedStyle(table.parentElement);
    const availablePixels = table.parentElement.clientWidth - parseFloat(container.paddingLeft) - parseFloat(container.paddingRight);
    const widthPixels = table.getBoundingClientRect().width;
    if (widthPixels <= availablePixels + 0.5) return [];
    return [{ ordinal: index + 1, header: table.querySelector('th, td')?.innerText.trim() ?? '', widthPixels, availablePixels }];
  });
  body.style.width = bodyWidth;
  return overflows;
})()`;
const HEADING_APART_REMEDY =
  'the figure fits a page alone but not under its heading; make the diagram shorter, or put a paragraph between the heading and the figure';
const MEASURE_HEADINGS_APART = `(function measureFiguraHeadings() {
  const body = document.body;
  const bodyWidth = body.style.width;
  body.style.width = 'calc(var(--figura-page-width) - var(--figura-page-margin-left) - var(--figura-page-margin-right))';
  const page = document.createElement('div');
  page.style.height = 'calc(var(--figura-page-height) - var(--figura-page-margin-top) - var(--figura-page-margin-bottom))';
  body.appendChild(page);
  const pagePixels = page.getBoundingClientRect().height;
  page.remove();
  const apart = [...document.querySelectorAll('div.${KEEP_GROUP_CLASS}')]
    .filter((group) => group.lastElementChild.tagName === 'FIGURE')
    .flatMap((group) => {
      const heightPixels = group.getBoundingClientRect().height;
      if (heightPixels <= pagePixels + 0.5) return [];
      const caption = group.lastElementChild.querySelector('figcaption')?.innerText.trim() ?? '';
      return [{ heading: group.firstElementChild.innerText.trim(), caption, heightPixels, pagePixels }];
    });
  body.style.width = bodyWidth;
  return apart;
})()`;

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

function visibleLength(codeHtml) {
  return codeHtml.replace(CODE_TAG, '').replace(CODE_CHARACTER_REFERENCE, '&').length;
}

function withBreakOpportunities(codeHtml) {
  const codeLength = visibleLength(codeHtml);
  let visibleOffset = 0;
  let scannedUpTo = 0;
  return codeHtml.replace(CODE_MARKUP_OR_SEPARATOR_RUN, (token, offset) => {
    visibleOffset += offset - scannedUpTo;
    scannedUpTo = offset + token.length;
    if (token.startsWith('<')) return token;
    if (token.startsWith('&')) {
      visibleOffset += 1;
      return token;
    }
    const runStart = visibleOffset;
    visibleOffset += token.length;
    return runStart > 0 && visibleOffset < codeLength ? `${token}${BREAK_OPPORTUNITY}` : token;
  });
}

function withInlineCodeBreaks(html) {
  return html.replace(INLINE_CODE, (element, opening, content, closing) => `${opening}${withBreakOpportunities(content)}${closing}`);
}

export function withCodeBreakOpportunities(html) {
  let broken = '';
  let copiedUpTo = 0;
  UNTOUCHED_BLOCK_OPENING.lastIndex = 0;
  for (let block = UNTOUCHED_BLOCK_OPENING.exec(html); block !== null; block = UNTOUCHED_BLOCK_OPENING.exec(html)) {
    const blockEnd = elementEnd(html, block.index, block[1]);
    if (blockEnd === -1) break;
    broken += `${withInlineCodeBreaks(html.slice(copiedUpTo, block.index))}${html.slice(block.index, blockEnd)}`;
    copiedUpTo = blockEnd;
    UNTOUCHED_BLOCK_OPENING.lastIndex = blockEnd;
  }
  return `${broken}${withInlineCodeBreaks(html.slice(copiedUpTo))}`;
}

function rounded(value) {
  return Math.round(value * 10) / 10;
}

function tableSubject({ ordinal, header }) {
  return header === '' ? `table ${ordinal}` : `table ${ordinal} («${header}»)`;
}

function tableTooWide(overflow) {
  return new FiguraError(
    'TABLE-TOO-WIDE',
    `${tableSubject(overflow)} is ${rounded(overflow.widthPixels * POINTS_PER_PIXEL)} pt wide against a ${rounded(overflow.availablePixels * POINTS_PER_PIXEL)} pt column`,
    TABLE_TOO_WIDE_REMEDY,
  );
}

function figureSubject(caption) {
  return caption === '' ? 'the figure' : `the figure «${caption}»`;
}

function headingApart({ heading, caption, heightPixels, pagePixels }) {
  return new FiguraError(
    'HEADING-APART',
    `heading «${heading}» and ${figureSubject(caption)} are ${rounded(heightPixels * POINTS_PER_PIXEL)} pt tall together against a ${rounded(pagePixels * POINTS_PER_PIXEL)} pt page`,
    HEADING_APART_REMEDY,
  );
}

async function measuredLayout(session, sessionId, expression, subject) {
  const measurement = await session.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
  const measured = measurement.result.value;
  if (!Array.isArray(measured)) {
    throw new FiguraError('PRINT-FAILED', `measuring the ${subject} of the document returned nothing`, 'run the build again');
  }
  return measured;
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
  return keepHeadingsWithNextBlock(withCodeBreakOpportunities(html).replace(HEAD_CLOSING, (closing) => `${printStyles}\n${closing}`));
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
    const overflows = await measuredLayout(session, sessionId, MEASURE_TABLE_OVERFLOWS, 'tables');
    const headingsApart = await measuredLayout(session, sessionId, MEASURE_HEADINGS_APART, 'headings');
    const layoutProblems = [...overflows.map(tableTooWide), ...headingsApart.map(headingApart)];
    if (layoutProblems.length > 0) return { pageCount: 0, layoutProblems };
    const { data } = await session.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true }, sessionId);
    const pdf = Buffer.from(data, 'base64');
    writeFileSync(pdfPath, pdf);
    return { pageCount: (pdf.toString('latin1').match(PDF_PAGE_OBJECT) ?? []).length, layoutProblems };
  } finally {
    await session.close();
    await server.close();
    rmSync(buildDirectory, { recursive: true, force: true });
  }
}
