import { FiguraError } from './figura-error.mjs';

const CARDINALITIES = ['many-to-one', 'one-to-one'];
const SERVICE_COLUMNS = new Set(['created_at', 'updated_at', 'deleted_at', 'createdAt', 'updatedAt', 'deletedAt']);
const SCHEMA_REMEDY = 'fix the schema source and run figura erd again';

export function isServiceColumn(columnName) {
  return SERVICE_COLUMNS.has(columnName);
}

export function isKeyColumn(column) {
  return column.primaryKey || column.unique || column.references.length > 0;
}

export function foreignKeyCardinality(tableColumns, columnName) {
  const column = tableColumns.find((candidate) => candidate.name === columnName);
  const isSolePrimaryKey = column?.primaryKey === true && tableColumns.filter((candidate) => candidate.primaryKey === true).length === 1;
  return column?.unique === true || isSolePrimaryKey ? 'one-to-one' : 'many-to-one';
}

function isName(value) {
  return typeof value === 'string' && value !== '';
}

function relationName(relation) {
  return `${relation?.from?.table}.${relation?.from?.column} -> ${relation?.to?.table}.${relation?.to?.column}`;
}

function modelTable(table, problems) {
  if (!isName(table?.name)) {
    problems.push(new FiguraError('ERD-INVALID', 'a table has no name', SCHEMA_REMEDY));
    return undefined;
  }
  const columns = (table.columns ?? []).map((column) => ({
    name: column?.name,
    type: column?.type,
    primaryKey: column?.primaryKey === true,
    unique: column?.unique === true,
    nullable: column?.nullable === true,
  }));
  for (const column of columns.filter((candidate) => !isName(candidate.name) || !isName(candidate.type))) {
    problems.push(new FiguraError('ERD-INVALID', `table "${table.name}" has a column without a name or a type (${JSON.stringify(column.name)})`, SCHEMA_REMEDY));
  }
  return { name: table.name, domain: isName(table.domain) ? table.domain : undefined, columns };
}

export function schemaModel(schema) {
  const problems = [];
  const tables = new Map();
  for (const table of schema?.tables ?? []) {
    const modelled = modelTable(table, problems);
    if (modelled === undefined) continue;
    if (tables.has(modelled.name)) {
      problems.push(new FiguraError('ERD-INVALID', `table "${modelled.name}" is declared twice`, SCHEMA_REMEDY));
      continue;
    }
    tables.set(modelled.name, modelled);
  }
  const relations = [];
  for (const relation of schema?.relations ?? []) {
    const problemsBefore = problems.length;
    for (const end of ['from', 'to']) {
      const table = tables.get(relation?.[end]?.table);
      if (table === undefined) {
        problems.push(new FiguraError('ERD-INVALID', `relation ${relationName(relation)} points at the unknown table ${relation?.[end]?.table}`, SCHEMA_REMEDY));
      } else if (!table.columns.some((column) => column.name === relation[end].column)) {
        problems.push(new FiguraError('ERD-INVALID', `relation ${relationName(relation)} names the unknown column ${table.name}.${relation[end].column}`, SCHEMA_REMEDY));
      }
    }
    if (!CARDINALITIES.includes(relation?.cardinality)) {
      problems.push(
        new FiguraError(
          'ERD-INVALID',
          `relation ${relationName(relation)} has the cardinality ${JSON.stringify(relation?.cardinality)}`,
          'use many-to-one or one-to-one, and draw many-to-many through its join table',
        ),
      );
    }
    if (problems.length === problemsBefore) {
      relations.push({
        from: { table: relation.from.table, column: relation.from.column },
        to: { table: relation.to.table, column: relation.to.column },
        cardinality: relation.cardinality,
      });
    }
  }
  return { model: { tables: withReferences([...tables.values()], relations), relations }, problems };
}

function withReferences(tables, relations) {
  const targetsOfColumn = new Map();
  for (const relation of relations) {
    const columnKey = `${relation.from.table}.${relation.from.column}`;
    targetsOfColumn.set(columnKey, new Set([...(targetsOfColumn.get(columnKey) ?? []), relation.to.table]));
  }
  return tables.map((table) => ({
    ...table,
    columns: table.columns.map((column) => ({ ...column, references: [...(targetsOfColumn.get(`${table.name}.${column.name}`) ?? [])].sort() })),
  }));
}

function matchesPattern(tableName, pattern) {
  return pattern.endsWith('*') ? tableName.startsWith(pattern.slice(0, -1)) : tableName === pattern;
}

export function withDomains(model, domainPatterns) {
  const tables = model.tables.map((table) => {
    const domain = Object.keys(domainPatterns)
      .sort()
      .find((candidate) => domainPatterns[candidate].some((pattern) => matchesPattern(table.name, pattern)));
    return domain === undefined ? table : { ...table, domain };
  });
  return { ...model, tables };
}

export function modelSubset(model, tableNames) {
  const known = new Set(model.tables.map((table) => table.name));
  const problems = tableNames
    .filter((tableName) => !known.has(tableName))
    .map((tableName) => new FiguraError('ERD-INVALID', `--tables names the unknown table ${tableName}`, 'list tables the schema declares'));
  const kept = new Set(tableNames);
  return {
    model: {
      tables: model.tables.filter((table) => kept.has(table.name)),
      relations: model.relations.filter((relation) => kept.has(relation.from.table) && kept.has(relation.to.table)),
    },
    problems,
  };
}
