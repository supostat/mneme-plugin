import { columnType, erdD2, relationEndColumns, visibleColumns } from './erd-d2.mjs';
import { FiguraError } from './figura-error.mjs';
import { diagramSizeProblems, layoutLimits, printScales } from './layout-checks.mjs';
import { renderDiagram } from './render-diagram.mjs';

const MEASURED_LAYOUT = 'dagre';
const ROOT_VIEW_BOX = /<svg\b[^>]*\bviewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/;
const FONT_SIZE = /font-size:\s*([\d.]+)px/g;
const KEY_COLUMNS_REMEDY = 'show only the key columns with --key-columns';
const SERVICE_COLUMNS_REMEDY = 'hide the service columns with --hide-service-columns';
const DOCUMENT_TABLE_REMEDY = 'describe the table in a document table and leave it out with --tables';

export function svgSizeMeasurement(svg) {
  const [, widthPixels, heightPixels] = ROOT_VIEW_BOX.exec(svg);
  return {
    widthPixels: Number(widthPixels),
    heightPixels: Number(heightPixels),
    objects: [{ labels: [...svg.matchAll(FONT_SIZE)].map(([, size]) => ({ fontPixels: Number(size) })) }],
  };
}

function relationCountsOf(model) {
  const relationCounts = new Map(model.tables.map((table) => [table.name, new Map()]));
  const count = (tableName, neighbour) => relationCounts.get(tableName).set(neighbour, (relationCounts.get(tableName).get(neighbour) ?? 0) + 1);
  for (const relation of model.relations) {
    count(relation.from.table, relation.to.table);
    if (relation.from.table !== relation.to.table) count(relation.to.table, relation.from.table);
  }
  return relationCounts;
}

function connectedComponents(model, relationCounts) {
  const unvisited = new Set(model.tables.map((table) => table.name));
  const components = [];
  for (const start of [...unvisited].sort()) {
    if (!unvisited.has(start)) continue;
    const component = [];
    const queue = [start];
    unvisited.delete(start);
    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);
      for (const neighbour of [...relationCounts.get(current).keys()].sort()) {
        if (!unvisited.has(neighbour)) continue;
        unvisited.delete(neighbour);
        queue.push(neighbour);
      }
    }
    components.push(component.sort());
  }
  return components;
}

function domainGroups(tableNames, model) {
  const domainOf = new Map(model.tables.map((table) => [table.name, table.domain]));
  const groups = new Map();
  for (const tableName of tableNames) {
    const domain = domainOf.get(tableName) ?? '';
    groups.set(domain, [...(groups.get(domain) ?? []), tableName]);
  }
  return [...groups.keys()]
    .sort((first, second) => (first === '' ? 1 : second === '' ? -1 : first < second ? -1 : 1))
    .map((domain) => groups.get(domain).sort());
}

function neighbourCount(tableName, among, relationCounts) {
  return [...relationCounts.get(tableName).keys()].filter((neighbour) => among.has(neighbour)).length;
}

function relationsIntoPart(tableName, part, relationCounts) {
  return part.reduce((total, partTable) => total + (relationCounts.get(tableName).get(partTable) ?? 0), 0);
}

function mostConnectedSeed(unplaced, relationCounts) {
  return [...unplaced].sort((first, second) => neighbourCount(second, unplaced, relationCounts) - neighbourCount(first, unplaced, relationCounts) || (first < second ? -1 : 1))[0];
}

function nextCandidate(part, unplaced, relationCounts) {
  const linked = [...unplaced]
    .map((tableName) => ({ tableName, relations: relationsIntoPart(tableName, part, relationCounts) }))
    .filter((candidate) => candidate.relations > 0)
    .sort((first, second) => second.relations - first.relations || (first.tableName < second.tableName ? -1 : 1));
  return linked[0]?.tableName ?? [...unplaced].sort()[0];
}

export function splitIntoParts(model, sizeProblemsOfPart) {
  const relationCounts = relationCountsOf(model);
  const parts = [];
  const tablesTooLargeAlone = [];
  const measured = new Map();
  const sizeProblems = (tableNames) => {
    const key = tableNames.join('\n');
    if (!measured.has(key)) measured.set(key, sizeProblemsOfPart(tableNames));
    return measured.get(key);
  };
  const placedWhole = (tableNames) => {
    if (sizeProblems(tableNames).length > 0) return false;
    parts.push(tableNames);
    return true;
  };
  const growParts = (tableNames) => {
    const unplaced = new Set(tableNames);
    while (unplaced.size > 0) {
      const seed = mostConnectedSeed(unplaced, relationCounts);
      unplaced.delete(seed);
      const seedProblems = sizeProblems([seed]);
      if (seedProblems.length > 0) {
        tablesTooLargeAlone.push({ tableName: seed, problems: seedProblems });
        continue;
      }
      let part = [seed];
      while (unplaced.size > 0) {
        const candidate = nextCandidate(part, unplaced, relationCounts);
        const grown = [...part, candidate].sort();
        if (sizeProblems(grown).length > 0) break;
        part = grown;
        unplaced.delete(candidate);
      }
      parts.push(part);
    }
  };
  for (const component of connectedComponents(model, relationCounts)) {
    if (placedWhole(component)) continue;
    for (const group of domainGroups(component, model)) {
      if (!placedWhole(group)) growParts(group);
    }
  }
  return { parts, tablesTooLargeAlone };
}

function rowText(column) {
  return `${column.name}: ${columnType(column)}`;
}

export function singleTableRemedy(table, problemCode, relationEnds, columnOptions) {
  const { hideServiceColumns = false, keyColumns = false } = columnOptions;
  const shown = visibleColumns(table, relationEnds, columnOptions);
  const hiddenBy = (extraOptions) => {
    const remaining = new Set(visibleColumns(table, relationEnds, { ...columnOptions, ...extraOptions }));
    return shown.filter((column) => !remaining.has(column));
  };
  const isTooWide = problemCode === 'DIAGRAM-TOO-WIDE';
  const longestRow = shown.reduce((longest, column) => (longest === undefined || rowText(column).length > rowText(longest).length ? column : longest), undefined);
  const removesCause = (hidden) => (isTooWide ? hidden.includes(longestRow) : hidden.length > 0);
  const offers = [];
  if (!keyColumns && removesCause(hiddenBy({ keyColumns: true }))) offers.push(KEY_COLUMNS_REMEDY);
  if (!keyColumns && !hideServiceColumns && removesCause(hiddenBy({ hideServiceColumns: true }))) offers.push(SERVICE_COLUMNS_REMEDY);
  if (offers.length > 0) return offers.join(', or ');
  const cause = isTooWide ? `its longest row is "${rowText(longestRow)}"` : `it keeps ${shown.length} columns`;
  return `${cause}; ${DOCUMENT_TABLE_REMEDY}`;
}

export function planErdDiagrams(model, { theme, hideServiceColumns = false, keyColumns = false, workDirectory, launcherPath }) {
  const limits = layoutLimits(theme);
  const columnOptions = { hideServiceColumns, keyColumns };
  const sizeProblemsOfPart = (tableNames) => {
    const caption = tableNames.length === 1 ? `table ${tableNames[0]}` : `${tableNames.length} tables`;
    const diagram = { ordinal: 1, caption, layout: MEASURED_LAYOUT, source: erdD2(model, tableNames, columnOptions) };
    const measurement = svgSizeMeasurement(renderDiagram(diagram, theme, { workDirectory, launcherPath }).svg);
    return diagramSizeProblems(diagram, measurement, limits, printScales([diagram], [measurement], limits)[0]);
  };
  const { parts, tablesTooLargeAlone } = splitIntoParts(model, sizeProblemsOfPart);
  const relationEnds = relationEndColumns(model);
  const tableByName = new Map(model.tables.map((table) => [table.name, table]));
  const problems = tablesTooLargeAlone.flatMap(({ tableName, problems: tableProblems }) =>
    tableProblems.map(
      (problem) =>
        new FiguraError(problem.code, `table ${tableName} alone: ${problem.what}`, singleTableRemedy(tableByName.get(tableName), problem.code, relationEnds, columnOptions)),
    ),
  );
  const diagrams = parts.map((tableNames, index) => ({ number: index + 1, tables: tableNames, source: erdD2(model, tableNames, columnOptions) }));
  return { diagrams, problems };
}
