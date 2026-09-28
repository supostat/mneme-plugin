const XML_DECLARATION = /^\s*<\?xml[^>]*\?>\s*/;
const ROOT_SVG_TAG = /<svg\b[^>]*>/;
const VIEW_BOX_SIZE = /\bviewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/;

function svgAtNaturalSize(svgDocument) {
  const svg = svgDocument.replace(XML_DECLARATION, '');
  const rootTag = ROOT_SVG_TAG.exec(svg)[0];
  if (/\swidth=/.test(rootTag)) return svg;
  const [, width, height] = VIEW_BOX_SIZE.exec(rootTag);
  return svg.replace(rootTag, rootTag.replace('<svg', `<svg width="${width}" height="${height}"`));
}

export function inlineDiagrams(html, renderedDiagrams) {
  return [...renderedDiagrams]
    .sort((first, second) => second.span.start - first.span.start)
    .reduce(
      (document, diagram) =>
        `${document.slice(0, diagram.span.start)}${svgAtNaturalSize(diagram.svg)}${document.slice(diagram.span.end)}`,
      html,
    );
}
