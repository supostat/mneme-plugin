import { erdD2 } from './erd-d2.mjs';
import { FiguraError } from './figura-error.mjs';
import { diagramSizeProblems, layoutLimits } from './layout-checks.mjs';
import { renderDiagram } from './render-diagram.mjs';

const BFS_PART_LIMIT = 12;
const PLACEHOLDER_DIAGRAM_NUMBER = 99;
const ROOT_VIEW_BOX = /<svg\b[^>]*\bviewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/;
const FONT_SIZE = /font-size:\s*([\d.]+)px/g;
const SINGLE_TABLE_REMEDY = 'hide the service columns with --hide-service-columns, or leave the table out with --tables';

export function svgSizeMeasurement(svg) {
  const [, widthPixels, heightPixels] = ROOT_VIEW_BOX.exec(svg);
  return {
    widthPixels: Number(widthPixels),
    heightPixels: Number(heightPixels),
    objects: [{ labels: [...svg.matchAll(FONT_SIZE)].map(([, size]) => ({ fontPixels: Number(size) })) }],
  };
}

function adjacencyOf(model) {
  const adjacency = new Map(model.tables.map((table) => [table.name, new Set()]));
  for (const relation of model.relations) {
    adjacency.get(relation.from.table).add(relation.to.table);
    adjacency.get(relation.to.table).add(relation.from.table);
  }
  return new Map([...adjacency].map(([name, neighbours]) => [name, [...neighbours].sort()]));
}

function breadthFirstOrder(tableNames, adjacency) {
  const unvisited = new Set(tableNames);
  const order = [];
  for (const start of [...tableNames].sort()) {
    if (!unvisited.has(start)) continue;
    unvisited.delete(start);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift();
      order.push(current);
      for (const neighbour of adjacency.get(current)) {
        if (!unvisited.has(neighbour)) continue;
        unvisited.delete(neighbour);
        queue.push(neighbour);
      }
    }
  }
  return order;
}

function connectedComponents(model, adjacency) {
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
      for (const neighbour of adjacency.get(current)) {
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

export function splitIntoParts(model, sizeProblemsOfPart) {
  const adjacency = adjacencyOf(model);
  const parts = [];
  const problems = [];
  const checked = new Map();
  const placeIfItFits = (tableNames) => {
    const key = tableNames.join('\n');
    if (!checked.has(key)) checked.set(key, sizeProblemsOfPart(tableNames));
    const found = checked.get(key);
    if (found.length === 0) parts.push(tableNames);
    return found;
  };
  const halveUntilItFits = (tableNames) => {
    const found = placeIfItFits(tableNames);
    if (found.length === 0) return;
    if (tableNames.length === 1) {
      problems.push(...found.map((problem) => new FiguraError(problem.code, `table ${tableNames[0]} alone: ${problem.what}`, SINGLE_TABLE_REMEDY)));
      return;
    }
    const middle = Math.ceil(tableNames.length / 2);
    halveUntilItFits(tableNames.slice(0, middle));
    halveUntilItFits(tableNames.slice(middle));
  };
  const splitBreadthFirst = (tableNames) => {
    const order = breadthFirstOrder(tableNames, adjacency);
    for (let start = 0; start < order.length; start += BFS_PART_LIMIT) halveUntilItFits(order.slice(start, start + BFS_PART_LIMIT));
  };
  for (const component of connectedComponents(model, adjacency)) {
    if (placeIfItFits(component).length === 0) continue;
    const groups = domainGroups(component, model);
    if (groups.length === 1) {
      splitBreadthFirst(component);
      continue;
    }
    for (const group of groups) {
      if (placeIfItFits(group).length !== 0) splitBreadthFirst(group);
    }
  }
  return { parts, problems };
}

export function planErdDiagrams(model, { theme, hideServiceColumns = false, workDirectory, launcherPath }) {
  const limits = layoutLimits(theme);
  const placeholderNumbers = new Map(model.tables.map((table) => [table.name, PLACEHOLDER_DIAGRAM_NUMBER]));
  const sizeProblemsOfPart = (tableNames) => {
    const caption = tableNames.length === 1 ? `table ${tableNames[0]}` : `${tableNames.length} tables`;
    const source = erdD2(model, tableNames, { hideServiceColumns, diagramNumberOfTable: placeholderNumbers });
    const { svg } = renderDiagram({ ordinal: 1, caption, layout: 'elk', source }, theme, { workDirectory, launcherPath });
    return diagramSizeProblems({ ordinal: 1, caption }, svgSizeMeasurement(svg), limits);
  };
  const { parts, problems } = splitIntoParts(model, sizeProblemsOfPart);
  const diagramNumberOfTable = new Map(parts.flatMap((tableNames, index) => tableNames.map((tableName) => [tableName, index + 1])));
  const diagrams = parts.map((tableNames, index) => ({
    number: index + 1,
    tables: tableNames,
    source: erdD2(model, tableNames, { hideServiceColumns, diagramNumberOfTable }),
  }));
  return { diagrams, problems };
}
