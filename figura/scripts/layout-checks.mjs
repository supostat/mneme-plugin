import { FiguraError } from './figura-error.mjs';
import { captionReservePoints, minimumLabelPoints, pageGeometry } from './theme.mjs';

export const POINTS_PER_PIXEL = 0.75;
const TOUCH_TOLERANCE_PIXELS = 0.5;
const SHRINK_REMEDY = 'change direction (for example direction: down) or split the diagram; figura never shrinks a diagram silently';
const TALL_REMEDY = 'change direction (for example direction: right) or split the diagram; a diagram taller than the page would be cut';
const OVERLAP_REMEDY = 'shorten or move the label, or switch the layout (data-layout="dagre") or the direction';
const OVERFLOW_REMEDY = 'shorten the label, break it into lines, or drop the fixed width or height of its shape';

export function layoutLimits(theme) {
  const geometry = pageGeometry(theme);
  return {
    columnWidthPoints: geometry.columnWidthPoints,
    diagramHeightPoints: geometry.columnHeightPoints - captionReservePoints(theme),
    minimumLabelPoints: minimumLabelPoints(theme),
  };
}

function rounded(value) {
  return Math.round(value * 10) / 10;
}

function overlapping(first, second) {
  return (
    first.x < second.x + second.width - TOUCH_TOLERANCE_PIXELS &&
    second.x < first.x + first.width - TOUCH_TOLERANCE_PIXELS &&
    first.y < second.y + second.height - TOUCH_TOLERANCE_PIXELS &&
    second.y < first.y + first.height - TOUCH_TOLERANCE_PIXELS
  );
}

function contains(outer, inner) {
  return (
    inner.x >= outer.x - TOUCH_TOLERANCE_PIXELS &&
    inner.y >= outer.y - TOUCH_TOLERANCE_PIXELS &&
    inner.x + inner.width <= outer.x + outer.width + TOUCH_TOLERANCE_PIXELS &&
    inner.y + inner.height <= outer.y + outer.height + TOUCH_TOLERANCE_PIXELS
  );
}

function containerScope(objectId) {
  const scopeEnd = objectId.lastIndexOf('.', objectId.includes('(') ? objectId.indexOf('(') : objectId.length);
  return scopeEnd === -1 ? '' : objectId.slice(0, scopeEnd);
}

function isAncestor(candidateId, objectId) {
  const scope = containerScope(objectId);
  return scope === candidateId || scope.startsWith(`${candidateId}.`);
}

function subject(diagram) {
  return diagram.caption === undefined ? `diagram ${diagram.ordinal}` : `diagram ${diagram.ordinal} («${diagram.caption}»)`;
}

export function diagramScale(measurement, limits) {
  return Math.min(1, limits.columnWidthPoints / (measurement.widthPixels * POINTS_PER_PIXEL));
}

function sizeProblems(diagram, measurement, limits) {
  const problems = [];
  const scale = diagramScale(measurement, limits);
  const widthPoints = measurement.widthPixels * POINTS_PER_PIXEL;
  const fontSizes = measurement.objects.flatMap((object) => object.labels.map((label) => label.fontPixels));
  if (fontSizes.length > 0) {
    const effectiveLabelPoints = Math.min(...fontSizes) * POINTS_PER_PIXEL * scale;
    if (effectiveLabelPoints < limits.minimumLabelPoints) {
      problems.push(
        new FiguraError(
          'DIAGRAM-TOO-WIDE',
          `${subject(diagram)} is ${rounded(widthPoints)} pt wide against a ${rounded(limits.columnWidthPoints)} pt column; scaled to ${Math.round(scale * 100)}% its smallest label prints at ${rounded(effectiveLabelPoints)} pt, under the ${limits.minimumLabelPoints} pt floor`,
          SHRINK_REMEDY,
        ),
      );
    }
  }
  const printedHeightPoints = measurement.heightPixels * POINTS_PER_PIXEL * scale;
  if (printedHeightPoints > limits.diagramHeightPoints) {
    problems.push(
      new FiguraError(
        'DIAGRAM-TOO-TALL',
        `${subject(diagram)} prints ${rounded(printedHeightPoints)} pt tall at ${Math.round(scale * 100)}% scale, over the ${rounded(limits.diagramHeightPoints)} pt a page leaves above its caption`,
        TALL_REMEDY,
      ),
    );
  }
  return problems;
}

function geometryProblems(diagram, measurement) {
  const problems = [];
  const labels = measurement.objects.flatMap((owner) => owner.labels.map((label) => ({ owner, label })));
  for (const [index, { owner, label }] of labels.entries()) {
    for (const other of measurement.objects) {
      if (other === owner || other.box === null || isAncestor(other.id, owner.id)) continue;
      if (overlapping(label.box, other.box)) {
        problems.push(
          new FiguraError('LABEL-OVERLAP', `${subject(diagram)}: label "${label.text}" of ${owner.id} crosses the shape ${other.id}`, OVERLAP_REMEDY),
        );
      }
    }
    for (const { owner: otherOwner, label: otherLabel } of labels.slice(index + 1)) {
      if (otherOwner === owner) continue;
      if (overlapping(label.box, otherLabel.box)) {
        problems.push(
          new FiguraError(
            'LABEL-OVERLAP',
            `${subject(diagram)}: label "${label.text}" of ${owner.id} crosses label "${otherLabel.text}" of ${otherOwner.id}`,
            OVERLAP_REMEDY,
          ),
        );
      }
    }
    const spillsOut = owner.box !== null && overlapping(label.box, owner.box) && !contains(owner.box, label.box);
    if (owner.kind === 'shape' && spillsOut) {
      problems.push(new FiguraError('TEXT-OVERFLOW', `${subject(diagram)}: label "${label.text}" spills out of ${owner.id}`, OVERFLOW_REMEDY));
    }
  }
  return problems;
}

export function layoutProblems(diagram, measurement, limits) {
  return [...sizeProblems(diagram, measurement, limits), ...geometryProblems(diagram, measurement)];
}
