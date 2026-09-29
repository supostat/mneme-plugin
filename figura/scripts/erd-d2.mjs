import { isServiceColumn } from './erd-model.mjs';

const TABLE_CLASS = 'core';
const STUB_CLASS = 'neutral';
const ARROWHEADS = new Map([
  ['many-to-one', ['cf-many', 'cf-one']],
  ['one-to-one', ['cf-one', 'cf-one']],
]);

function quoted(name) {
  return JSON.stringify(name);
}

function byName(first, second) {
  return first.name < second.name ? -1 : first.name > second.name ? 1 : 0;
}

function relationSortKey(relation) {
  return `${relation.from.table}.${relation.from.column}>${relation.to.table}.${relation.to.column}`;
}

function tableKey(table) {
  return table.domain === undefined ? quoted(table.name) : `${quoted(table.domain)}.${quoted(table.name)}`;
}

function columnConstraints(table, column, foreignKeyColumns) {
  const constraints = [];
  if (column.primaryKey) constraints.push('primary_key');
  if (foreignKeyColumns.has(`${table.name}.${column.name}`)) constraints.push('foreign_key');
  if (column.unique) constraints.push('unique');
  if (constraints.length === 0) return '';
  return constraints.length === 1 ? ` {constraint: ${constraints[0]}}` : ` {constraint: [${constraints.join('; ')}]}`;
}

function tableLines(table, indent, { foreignKeyColumns, referencedColumns, hideServiceColumns }) {
  const columns = table.columns.filter(
    (column) => !(hideServiceColumns && isServiceColumn(column.name) && !referencedColumns.has(`${table.name}.${column.name}`)),
  );
  return [
    `${indent}${quoted(table.name)}: {`,
    `${indent}  shape: sql_table`,
    `${indent}  class: ${TABLE_CLASS}`,
    ...columns.map((column) => `${indent}  ${quoted(column.name)}: ${quoted(column.type)}${columnConstraints(table, column, foreignKeyColumns)}`),
    `${indent}}`,
  ];
}

function stubKey(tableName, diagramNumber) {
  return quoted(`${tableName} → diagram ${diagramNumber}`);
}

export function erdD2(model, partTableNames, { hideServiceColumns = false, diagramNumberOfTable = new Map() } = {}) {
  const inPart = new Set(partTableNames);
  const tableByName = new Map(model.tables.map((table) => [table.name, table]));
  const tables = model.tables.filter((table) => inPart.has(table.name)).sort(byName);
  const foreignKeyColumns = new Set(model.relations.map((relation) => `${relation.from.table}.${relation.from.column}`));
  const referencedColumns = new Set(model.relations.flatMap((relation) => [`${relation.from.table}.${relation.from.column}`, `${relation.to.table}.${relation.to.column}`]));
  const lineOptions = { foreignKeyColumns, referencedColumns, hideServiceColumns };
  const lines = [];
  const domains = [...new Set(tables.map((table) => table.domain).filter((domain) => domain !== undefined))].sort();
  for (const domain of domains) {
    lines.push(`${quoted(domain)}: {`);
    for (const table of tables.filter((candidate) => candidate.domain === domain)) lines.push(...tableLines(table, '  ', lineOptions));
    lines.push('}');
  }
  for (const table of tables.filter((candidate) => candidate.domain === undefined)) lines.push(...tableLines(table, '', lineOptions));
  const stubs = new Set();
  const relations = [...model.relations].sort((first, second) => (relationSortKey(first) < relationSortKey(second) ? -1 : 1));
  for (const relation of relations) {
    const [sourceArrowhead, targetArrowhead] = ARROWHEADS.get(relation.cardinality);
    const style = `{source-arrowhead.shape: ${sourceArrowhead}; target-arrowhead.shape: ${targetArrowhead}}`;
    const fromInside = inPart.has(relation.from.table);
    const toInside = inPart.has(relation.to.table);
    if (fromInside && toInside) {
      lines.push(`${tableKey(tableByName.get(relation.from.table))}.${quoted(relation.from.column)} -> ${tableKey(tableByName.get(relation.to.table))}.${quoted(relation.to.column)}: ${style}`);
      continue;
    }
    if (fromInside === toInside) continue;
    const foreignTable = fromInside ? relation.to.table : relation.from.table;
    const foreignNumber = diagramNumberOfTable.get(foreignTable);
    if (foreignNumber === undefined) continue;
    const stub = stubKey(foreignTable, foreignNumber);
    if (!stubs.has(stub)) {
      stubs.add(stub);
      lines.push(`${stub}: {class: ${STUB_CLASS}}`);
    }
    const inside = fromInside
      ? `${tableKey(tableByName.get(relation.from.table))}.${quoted(relation.from.column)}`
      : `${tableKey(tableByName.get(relation.to.table))}.${quoted(relation.to.column)}`;
    lines.push(fromInside ? `${inside} -> ${stub}: ${style}` : `${stub} -> ${inside}: ${style}`);
  }
  return `${lines.join('\n')}\n`;
}
