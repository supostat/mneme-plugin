import { FiguraError } from './figura-error.mjs';
import { diagramTraits, layoutRemedy } from './layout-remedies.mjs';
import { captionReservePoints, minimumLabelPoints, pageGeometry } from './theme.mjs';

export const POINTS_PER_PIXEL = 0.75;
const TOUCH_TOLERANCE_PIXELS = 0.5;
const CONNECTION_ID = /^(?:(.*)\.)?\((.*?) (?:<->|->|<-|--) (.*)\)\[\d+\]$/;

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

function isFrameOf(shape, connection) {
  return connection.kind === 'connection' && shape.kind === 'shape' && contains(shape.box, connection.pathBox);
}

function connectionEnds(connectionId) {
  const [, scope, from, to] = CONNECTION_ID.exec(connectionId);
  return [from, to].map((end) => (scope === undefined ? end : `${scope}.${end}`));
}

function leadsInto(connection, container) {
  if (connection.kind !== 'connection') return false;
  return connectionEnds(connection.id).filter((end) => isAncestor(container.id, end)).length === 1;
}

function diagramProblem(diagram, code, what, remedy, highlights) {
  const problem = new FiguraError(code, what, remedy);
  problem.diagramOrdinal = diagram.ordinal;
  problem.highlights = highlights;
  return problem;
}

function subject(diagram) {
  return diagram.caption === undefined ? `diagram ${diagram.ordinal}` : `diagram ${diagram.ordinal} («${diagram.caption}»)`;
}

export function diagramScale(measurement, limits) {
  return Math.min(1, limits.columnWidthPoints / (measurement.widthPixels * POINTS_PER_PIXEL));
}

export function diagramSizeProblems(diagram, measurement, limits) {
  const traits = diagramTraits(diagram);
  const problems = [];
  const scale = diagramScale(measurement, limits);
  const widthPoints = measurement.widthPixels * POINTS_PER_PIXEL;
  const fontSizes = measurement.objects.flatMap((object) => object.labels.map((label) => label.fontPixels));
  if (fontSizes.length > 0) {
    const effectiveLabelPoints = Math.min(...fontSizes) * POINTS_PER_PIXEL * scale;
    if (effectiveLabelPoints < limits.minimumLabelPoints) {
      problems.push(
        diagramProblem(
          diagram,
          'DIAGRAM-TOO-WIDE',
          `${subject(diagram)} is ${rounded(widthPoints)} pt wide against a ${rounded(limits.columnWidthPoints)} pt column; scaled to ${Math.round(scale * 100)}% its smallest label prints at ${rounded(effectiveLabelPoints)} pt, under the ${limits.minimumLabelPoints} pt floor`,
          layoutRemedy('DIAGRAM-TOO-WIDE', traits),
          [],
        ),
      );
    }
  }
  const printedHeightPoints = measurement.heightPixels * POINTS_PER_PIXEL * scale;
  if (printedHeightPoints > limits.diagramHeightPoints) {
    problems.push(
      diagramProblem(
        diagram,
        'DIAGRAM-TOO-TALL',
        `${subject(diagram)} prints ${rounded(printedHeightPoints)} pt tall at ${Math.round(scale * 100)}% scale, over the ${rounded(limits.diagramHeightPoints)} pt a page leaves above its caption`,
        layoutRemedy('DIAGRAM-TOO-TALL', traits),
        [],
      ),
    );
  }
  return problems;
}

function geometryProblems(diagram, measurement) {
  const traits = diagramTraits(diagram);
  const problems = [];
  const labels = measurement.objects.flatMap((owner) => owner.labels.map((label) => ({ owner, label })));
  for (const [index, { owner, label }] of labels.entries()) {
    for (const other of measurement.objects) {
      if (other === owner || other.box === null || isAncestor(other.id, owner.id) || isFrameOf(other, owner)) continue;
      if (overlapping(label.box, other.box)) {
        problems.push(
          diagramProblem(
            diagram,
            'LABEL-OVERLAP',
            `${subject(diagram)}: label "${label.text}" of ${owner.id} crosses the shape ${other.id}`,
            layoutRemedy('LABEL-OVERLAP', traits, { intoContainer: leadsInto(owner, other) }),
            [label.box, other.box],
          ),
        );
      }
    }
    for (const { owner: otherOwner, label: otherLabel } of labels.slice(index + 1)) {
      if (otherOwner === owner) continue;
      if (overlapping(label.box, otherLabel.box)) {
        problems.push(
          diagramProblem(
            diagram,
            'LABEL-OVERLAP',
            `${subject(diagram)}: label "${label.text}" of ${owner.id} crosses label "${otherLabel.text}" of ${otherOwner.id}`,
            layoutRemedy('LABEL-OVERLAP', traits, { intoContainer: false }),
            [label.box, otherLabel.box],
          ),
        );
      }
    }
    const spillsOut = owner.box !== null && overlapping(label.box, owner.box) && !contains(owner.box, label.box);
    if (owner.kind === 'shape' && spillsOut) {
      problems.push(
        diagramProblem(diagram, 'TEXT-OVERFLOW', `${subject(diagram)}: label "${label.text}" spills out of ${owner.id}`, layoutRemedy('TEXT-OVERFLOW', traits), [
          label.box,
          owner.box,
        ]),
      );
    }
  }
  return problems;
}

export function layoutProblems(diagram, measurement, limits) {
  return [...diagramSizeProblems(diagram, measurement, limits), ...geometryProblems(diagram, measurement)];
}
