const XML_DECLARATION = /^\s*<\?xml[^>]*\?>\s*/;
const ROOT_SVG_TAG = /<svg\b[^>]*>/;
const VIEW_BOX_SIZE = /\bviewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/;

const D2_BACKGROUND = /<rect\b[^>]*\bfill="(#[0-9A-Fa-f]{6})"[^>]*\bclass=" fill-N7"/;
const LABEL_MASK = /<mask id="([^"]+)"[^>]*>([\s\S]*?)<\/mask>/g;
const MASK_CUTOUT = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="black">/g;
const MASKED_LABEL = /(<path\b[^>]*\bmask="url\(#([^)]+)\)"[^>]*\/>)(<text x="([-\d.]+)" y="([-\d.]+)"[^>]*font-size:([\d.]+)px[^>]*>)/g;

function labelCutoutsByMask(svg) {
  return new Map(
    [...svg.matchAll(LABEL_MASK)].map(([, maskId, body]) => [
      maskId,
      [...body.matchAll(MASK_CUTOUT)].map(([, x, y, width, height]) => ({ x: Number(x), y: Number(y), width: Number(width), height: Number(height) })),
    ]),
  );
}

function withOpaqueLabelBackgrounds(svg) {
  const cutoutsByMask = labelCutoutsByMask(svg);
  if (cutoutsByMask.size === 0) return svg;
  const background = D2_BACKGROUND.exec(svg)[1];
  return svg.replace(MASKED_LABEL, (match, path, maskId, text, x, y, fontSize) => {
    const labelCenterY = Number(y) - Number(fontSize) / 2;
    const cutout = (cutoutsByMask.get(maskId) ?? []).find(
      (box) => box.x <= Number(x) && Number(x) <= box.x + box.width && box.y <= labelCenterY && labelCenterY <= box.y + box.height,
    );
    if (cutout === undefined) return match;
    return `${path}<rect x="${cutout.x}" y="${cutout.y}" width="${cutout.width}" height="${cutout.height}" fill="${background}" />${text}`;
  });
}

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
        `${document.slice(0, diagram.span.start)}${svgAtNaturalSize(withOpaqueLabelBackgrounds(diagram.svg))}${document.slice(diagram.span.end)}`,
      html,
    );
}
