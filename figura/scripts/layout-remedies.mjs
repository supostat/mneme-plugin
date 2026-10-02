const SEQUENCE_DIAGRAM = /^shape:\s*sequence_diagram\s*$/m;
const SQL_TABLE = /\bshape:\s*sql_table\b/;
const TOP_LEVEL_DIRECTION = /^direction:\s*(down|right|up|left)\s*$/m;
const DEFAULT_DIRECTION = 'down';
const SHRINK_CONSEQUENCE = 'figura never shrinks a diagram silently';
const CUT_CONSEQUENCE = 'a diagram taller than the page would be cut';
const OVERFLOW_REMEDY = 'shorten the label, break it into lines, or drop the fixed width or height of its shape';
const INTO_CONTAINER_REMEDY =
  'the label sits inside the container its edge leads into and reads as a link within it; shorten or drop it, or name the link in the caption';

export function diagramTraits(diagram) {
  const kind = SEQUENCE_DIAGRAM.test(diagram.source) ? 'sequence' : SQL_TABLE.test(diagram.source) ? 'erd' : 'graph';
  return { layout: diagram.layout, kind, direction: TOP_LEVEL_DIRECTION.exec(diagram.source)?.[1] ?? DEFAULT_DIRECTION };
}

function alternatives(offers) {
  return offers.length === 1 ? offers[0] : `${offers.slice(0, -1).join(', ')}, or ${offers.at(-1)}`;
}

function otherLayout(layout) {
  return layout === 'elk' ? 'try data-layout="dagre"' : 'try ELK (drop data-layout="dagre")';
}

function directionOffer(traits, direction) {
  return traits.direction === direction ? [] : [`change direction to ${direction} (direction: ${direction})`];
}

function tooWideRemedy(traits, { scaleSetBy }) {
  if (scaleSetBy !== undefined) return `the ERD diagrams of a document print at one scale, set by the widest; split diagram ${scaleSetBy} into narrower parts`;
  if (traits.kind === 'sequence') return 'keep it to five participants or fewer and shorten the participant and message labels, or split it';
  if (traits.kind === 'erd' && traits.layout === 'elk') return 'draw it with dagre (data-layout="dagre"), the layout figura erd measures ERD parts with, or split it';
  const layoutOffer = traits.kind === 'graph' ? [otherLayout(traits.layout)] : [];
  return `${alternatives([...directionOffer(traits, 'down'), ...layoutOffer, 'split the diagram'])}; ${SHRINK_CONSEQUENCE}`;
}

function tooTallRemedy(traits) {
  if (traits.kind === 'sequence') return `split the sequence into two diagrams or drop messages; ${CUT_CONSEQUENCE}`;
  const graphOffers = traits.kind === 'graph' ? [otherLayout(traits.layout), 'regroup a long chain into layers'] : [];
  return `${alternatives([...directionOffer(traits, 'right'), ...graphOffers, 'split the diagram'])}; ${CUT_CONSEQUENCE}`;
}

function labelOverlapRemedy(traits, { intoContainer }) {
  if (intoContainer) return INTO_CONTAINER_REMEDY;
  if (traits.kind === 'sequence') return 'shorten the message or note label';
  return alternatives(['shorten or move the label', otherLayout(traits.layout)]);
}

export function layoutRemedy(problemCode, traits, cause = {}) {
  switch (problemCode) {
    case 'DIAGRAM-TOO-WIDE':
      return tooWideRemedy(traits, cause);
    case 'DIAGRAM-TOO-TALL':
      return tooTallRemedy(traits);
    case 'LABEL-OVERLAP':
      return labelOverlapRemedy(traits, cause);
    case 'TEXT-OVERFLOW':
      return OVERFLOW_REMEDY;
  }
  throw new Error(`no layout remedy for ${problemCode}`);
}
