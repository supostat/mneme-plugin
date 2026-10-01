import { isKeyColumn, isServiceColumn } from './erd-model.mjs';
import { SQL_TABLE_CLASS } from './theme.mjs';

const DOMAIN_LABEL_POSITION = 'top-left';
const FOREIGN_KEY_ARROW = ' → ';
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

export function columnType(column) {
  return column.references.length === 0 ? column.type : `${column.type}${FOREIGN_KEY_ARROW}${column.references.join(', ')}`;
}

function columnConstraints(column) {
  const constraints = [];
  if (column.primaryKey) constraints.push('primary_key');
  if (column.references.length > 0) constraints.push('foreign_key');
  if (column.unique) constraints.push('unique');
  if (constraints.length === 0) return '';
  return constraints.length === 1 ? ` {constraint: ${constraints[0]}}` : ` {constraint: [${constraints.join('; ')}]}`;
}

export function relationEndColumns(model) {
  return new Set(model.relations.flatMap((relation) => [`${relation.from.table}.${relation.from.column}`, `${relation.to.table}.${relation.to.column}`]));
}

export function visibleColumns(table, relationEnds, { hideServiceColumns = false, keyColumns = false } = {}) {
  return table.columns.filter((column) => {
    if (relationEnds.has(`${table.name}.${column.name}`)) return true;
    if (keyColumns && !isKeyColumn(column)) return false;
    return !(hideServiceColumns && isServiceColumn(column.name));
  });
}

function tableLines(table, indent, relationEnds, columnOptions) {
  return [
    `${indent}${quoted(table.name)}: {`,
    `${indent}  shape: sql_table`,
    `${indent}  class: ${SQL_TABLE_CLASS}`,
    ...visibleColumns(table, relationEnds, columnOptions).map(
      (column) => `${indent}  ${quoted(column.name)}: ${quoted(columnType(column))}${columnConstraints(column)}`,
    ),
    `${indent}}`,
  ];
}

export function erdD2(model, partTableNames, columnOptions = {}) {
  const inPart = new Set(partTableNames);
  const tableByName = new Map(model.tables.map((table) => [table.name, table]));
  const tables = model.tables.filter((table) => inPart.has(table.name)).sort(byName);
  const relationEnds = relationEndColumns(model);
  const lines = [];
  const domains = [...new Set(tables.map((table) => table.domain).filter((domain) => domain !== undefined))].sort();
  for (const domain of domains) {
    lines.push(`${quoted(domain)}: {`, `  label.near: ${DOMAIN_LABEL_POSITION}`);
    for (const table of tables.filter((candidate) => candidate.domain === domain)) lines.push(...tableLines(table, '  ', relationEnds, columnOptions));
    lines.push('}');
  }
  for (const table of tables.filter((candidate) => candidate.domain === undefined)) lines.push(...tableLines(table, '', relationEnds, columnOptions));
  const relationsInPart = model.relations
    .filter((relation) => inPart.has(relation.from.table) && inPart.has(relation.to.table))
    .sort((first, second) => (relationSortKey(first) < relationSortKey(second) ? -1 : 1));
  for (const relation of relationsInPart) {
    const [sourceArrowhead, targetArrowhead] = ARROWHEADS.get(relation.cardinality);
    lines.push(
      `${tableKey(tableByName.get(relation.from.table))}.${quoted(relation.from.column)} -> ${tableKey(tableByName.get(relation.to.table))}.${quoted(relation.to.column)}: {source-arrowhead.shape: ${sourceArrowhead}; target-arrowhead.shape: ${targetArrowhead}}`,
    );
  }
  return `${lines.join('\n')}\n`;
}
