import { FiguraError } from './figura-error.mjs';

const DEFAULT_LAYOUT = 'elk';
const LAYOUTS = ['elk', 'dagre'];
const PRE_ELEMENT = /<pre\b([^>]*)>([\s\S]*?)<\/pre\s*>/gi;
const FIGURE_ELEMENT = /<figure\b[^>]*>[\s\S]*?<\/figure\s*>/gi;
const FIGCAPTION_ELEMENT = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption\s*>/i;
const ATTRIBUTE = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const CHARACTER_REFERENCE = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
const NAMED_CHARACTERS = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
]);
const LARGEST_CODE_POINT = 0x10ffff;

function decodeHtmlText(text) {
  return text.replace(CHARACTER_REFERENCE, (reference, body) => {
    if (!body.startsWith('#')) return NAMED_CHARACTERS.get(body.toLowerCase()) ?? reference;
    const codePoint = /^#x/i.test(body) ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    return codePoint <= LARGEST_CODE_POINT ? String.fromCodePoint(codePoint) : reference;
  });
}

function parseAttributes(attributeText) {
  const attributes = new Map();
  for (const [, name, doubleQuoted, singleQuoted, unquoted] of attributeText.matchAll(ATTRIBUTE)) {
    attributes.set(name.toLowerCase(), decodeHtmlText(doubleQuoted ?? singleQuoted ?? unquoted ?? ''));
  }
  return attributes;
}

function hasClass(attributes, className) {
  return (attributes.get('class') ?? '').split(/\s+/).includes(className);
}

function captionOf(figureHtml) {
  const figcaption = FIGCAPTION_ELEMENT.exec(figureHtml);
  if (figcaption === null) return undefined;
  return decodeHtmlText(figcaption[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

export function extractDiagrams(html) {
  const figures = [...html.matchAll(FIGURE_ELEMENT)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    html: match[0],
  }));
  const diagrams = [];
  for (const match of html.matchAll(PRE_ELEMENT)) {
    const attributes = parseAttributes(match[1]);
    if (!hasClass(attributes, 'd2')) continue;
    const ordinal = diagrams.length + 1;
    const layout = attributes.get('data-layout') ?? DEFAULT_LAYOUT;
    if (!LAYOUTS.includes(layout)) {
      throw new FiguraError(
        'D2-FAILED',
        `diagram ${ordinal}: data-layout "${layout}" is neither ${LAYOUTS.join(' nor ')}`,
        `set data-layout to ${LAYOUTS.join(' or ')}, or drop it for ${DEFAULT_LAYOUT}`,
      );
    }
    const span = { start: match.index, end: match.index + match[0].length };
    const figure = figures.find((candidate) => candidate.start <= span.start && span.end <= candidate.end);
    diagrams.push({
      ordinal,
      source: decodeHtmlText(match[2]).replace(/^\r?\n/, ''),
      layout,
      caption: figure === undefined ? undefined : captionOf(figure.html),
      span,
    });
  }
  return diagrams;
}
