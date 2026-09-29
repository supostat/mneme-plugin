import { foreignKeyCardinality } from './erd-model.mjs';
import { postgresTypeName } from './erd-postgres-type.mjs';
import { readSourceFiles } from './erd-source-files.mjs';
import { FiguraError } from './figura-error.mjs';

const RAILS_TYPES = new Map([
  ['string', 'varchar'],
  ['text', 'text'],
  ['integer', 'integer'],
  ['bigint', 'bigint'],
  ['float', 'double precision'],
  ['decimal', 'numeric'],
  ['numeric', 'numeric'],
  ['datetime', 'timestamp'],
  ['timestamp', 'timestamp'],
  ['timestamptz', 'timestamptz'],
  ['time', 'time'],
  ['date', 'date'],
  ['binary', 'bytea'],
  ['boolean', 'boolean'],
  ['serial', 'integer'],
  ['bigserial', 'bigint'],
  ['bit_varying', 'varbit'],
]);
const TYPES_WITH_LENGTH_LIMIT = new Set(['varchar', 'bit', 'varbit']);
const DEFAULT_PRIMARY_KEY_TYPE = 'bigint';
const TABLE_METHODS_WITHOUT_COLUMNS = new Set(['index', 'unique_constraint', 'check_constraint', 'exclusion_constraint']);
const UNCOUNTABLE_WORDS = ['equipment', 'information', 'rice', 'money', 'species', 'series', 'fish', 'sheep', 'jeans', 'police'];
const IRREGULAR_WORDS = [
  ['person', 'people'],
  ['man', 'men'],
  ['child', 'children'],
  ['sex', 'sexes'],
  ['move', 'moves'],
  ['zombie', 'zombies'],
];
const SINGULAR_RULES_IN_DEFINITION_ORDER = [
  [/s$/i, ''],
  [/(ss)$/i, '$1'],
  [/(n)ews$/i, '$1ews'],
  [/([ti])a$/i, '$1um'],
  [/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)(sis|ses)$/i, '$1sis'],
  [/(^analy)(sis|ses)$/i, '$1sis'],
  [/([^f])ves$/i, '$1fe'],
  [/(hive)s$/i, '$1'],
  [/(tive)s$/i, '$1'],
  [/([lr])ves$/i, '$1f'],
  [/([^aeiouy]|qu)ies$/i, '$1y'],
  [/(s)eries$/i, '$1eries'],
  [/(m)ovies$/i, '$1ovie'],
  [/(x|ch|ss|sh)es$/i, '$1'],
  [/^(m|l)ice$/i, '$1ouse'],
  [/(bus)(es)?$/i, '$1'],
  [/(o)es$/i, '$1'],
  [/(shoe)s$/i, '$1'],
  [/(cris|test)(is|es)$/i, '$1is'],
  [/^(a)x[ie]s$/i, '$1xis'],
  [/(octop|vir)(us|i)$/i, '$1us'],
  [/(alias|status)(es)?$/i, '$1'],
  [/^(ox)en/i, '$1'],
  [/(vert|ind)ices$/i, '$1ex'],
  [/(matr)ices$/i, '$1ix'],
  [/(quiz)zes$/i, '$1'],
  [/(database)s$/i, '$1'],
  ...IRREGULAR_WORDS.flatMap(([singular, plural]) => [
    [new RegExp(`(${singular[0]})${singular.slice(1)}$`, 'i'), `$1${singular.slice(1)}`],
    [new RegExp(`(${plural[0]})${plural.slice(1)}$`, 'i'), `$1${singular.slice(1)}`],
  ]),
];
const SINGULAR_RULES_BY_PRECEDENCE = SINGULAR_RULES_IN_DEFINITION_ORDER.toReversed();
const TOKEN = /\s*(?:(#.*)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|:"((?:[^"\\]|\\.)*)"|:(\w+[?!]?)|(\w+):(?!:)|(-?\d[\d_]*(?:\.\d+)?)|(\w+[?!]?)|(->|=>|::|[[\]{}(),.|]))/y;

function singularized(word) {
  if (UNCOUNTABLE_WORDS.some((uncountable) => new RegExp(`\\b${uncountable}$`, 'i').test(word))) return word;
  const rule = SINGULAR_RULES_BY_PRECEDENCE.find(([pattern]) => pattern.test(word));
  return rule === undefined ? word : word.replace(rule[0], rule[1]);
}

function lineTokens(line) {
  const tokens = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < line.length) {
    const match = TOKEN.exec(line);
    if (match === null || match[1] !== undefined) break;
    const [, , doubleQuoted, singleQuoted, quotedSymbol, symbol, label, number, identifier, punctuation] = match;
    const quoted = doubleQuoted ?? singleQuoted;
    if (quoted !== undefined) tokens.push({ kind: 'value', value: quoted.slice(1, -1).replace(/\\(.)/g, '$1') });
    else if (quotedSymbol !== undefined) tokens.push({ kind: 'value', value: quotedSymbol });
    else if (symbol !== undefined) tokens.push({ kind: 'value', value: symbol });
    else if (label !== undefined) tokens.push({ kind: 'label', value: label });
    else if (number !== undefined) tokens.push({ kind: 'value', value: Number(number.replaceAll('_', '')) });
    else if (identifier !== undefined) tokens.push({ kind: 'identifier', value: identifier });
    else tokens.push({ kind: 'punctuation', value: punctuation });
  }
  return tokens;
}

function tokenValue(tokens) {
  if (tokens.length === 1 && tokens[0].kind === 'value') return tokens[0].value;
  if (tokens.length === 1 && tokens[0].kind === 'identifier') {
    const literals = new Map([
      ['true', true],
      ['false', false],
      ['nil', null],
    ]);
    return literals.has(tokens[0].value) ? literals.get(tokens[0].value) : undefined;
  }
  if (tokens[0]?.value === '[' && tokens.at(-1)?.value === ']') return topLevelParts(tokens.slice(1, -1)).map(tokenValue);
  return undefined;
}

function topLevelParts(tokens) {
  const parts = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === 'punctuation' && '[{('.includes(token.value)) depth += 1;
    if (token.kind === 'punctuation' && ']})'.includes(token.value)) depth -= 1;
    if (token.kind === 'punctuation' && token.value === ',' && depth === 0) parts.push([]);
    else parts.at(-1).push(token);
  }
  return parts.filter((part) => part.length > 0);
}

function callArguments(tokens) {
  const positional = [];
  const options = {};
  for (const part of topLevelParts(tokens)) {
    if (part[0].kind === 'label') options[part[0].value] = tokenValue(part.slice(1));
    else positional.push(tokenValue(part));
  }
  return { positional, options };
}

function railsBaseType(method, options) {
  if (method === 'enum') return options.enum_type ?? method;
  if (method === 'integer' && options.limit !== undefined) return options.limit <= 2 ? 'smallint' : options.limit <= 4 ? 'integer' : 'bigint';
  return RAILS_TYPES.get(method) ?? method;
}

function railsColumnType(method, options) {
  if (method === 'virtual' && options.type !== undefined) return railsColumnType(options.type, { ...options, type: undefined });
  const base = railsBaseType(method, options);
  const lengthModifiers = TYPES_WITH_LENGTH_LIMIT.has(base) && options.limit !== undefined ? [options.limit] : [];
  const precisionModifiers = options.precision === undefined ? [] : [options.precision, ...(options.scale === undefined ? [] : [options.scale])];
  const modifiers = [...lengthModifiers, ...precisionModifiers];
  return postgresTypeName(`${base}${modifiers.length === 0 ? '' : `(${modifiers.join(',')})`}${options.array === true ? '[]' : ''}`);
}

function createdTable(tableArguments) {
  const [name] = tableArguments.positional;
  const { id, primary_key: primaryKey } = tableArguments.options;
  const table = { name, columns: [], compositeKey: Array.isArray(primaryKey) ? primaryKey : [], uniqueColumns: new Set() };
  if (id === false && typeof primaryKey === 'string') table.compositeKey = [primaryKey];
  if (id !== false && !Array.isArray(primaryKey)) {
    table.columns.push({
      name: primaryKey ?? 'id',
      type: railsColumnType(id ?? DEFAULT_PRIMARY_KEY_TYPE, {}),
      primaryKey: true,
      unique: false,
      nullable: false,
    });
  }
  return table;
}

function applyTableMethod(table, method, { positional, options }) {
  const [columnSet] = positional;
  const isSingleColumnSet = Array.isArray(columnSet) && columnSet.length === 1;
  if (method === 'index' && options.unique === true && options.where === undefined && isSingleColumnSet) table.uniqueColumns.add(columnSet[0]);
  if (method === 'unique_constraint' && isSingleColumnSet) table.uniqueColumns.add(columnSet[0]);
  if (TABLE_METHODS_WITHOUT_COLUMNS.has(method)) return;
  for (const columnName of positional.filter((value) => typeof value === 'string')) {
    table.columns.push({
      name: columnName,
      type: railsColumnType(method, options),
      primaryKey: options.primary_key === true,
      unique: false,
      nullable: options.null !== false,
    });
  }
}

export function readRailsSchema(schemaPath) {
  const files = readSourceFiles(schemaPath, '.rb');
  if (files.length !== 1) throw new FiguraError('ERD-INVALID', `${schemaPath} holds ${files.length} Ruby files`, 'pass the db/schema.rb file itself');
  const [file] = files;
  const tables = [];
  const foreignKeys = [];
  let openTable;
  for (const line of file.text.split('\n')) {
    const tokens = lineTokens(line);
    const [first, second, third] = tokens;
    if (first === undefined) continue;
    if (openTable !== undefined && first.value === 'end') {
      tables.push(openTable);
      openTable = undefined;
    } else if (openTable !== undefined && first.value === 't' && second?.value === '.' && third?.kind === 'identifier') {
      applyTableMethod(openTable, third.value, callArguments(tokens.slice(3)));
    } else if (first.value === 'create_table') {
      const doIndex = tokens.findLastIndex((token) => token.kind === 'identifier' && token.value === 'do');
      openTable = createdTable(callArguments(tokens.slice(1, doIndex === -1 ? tokens.length : doIndex)));
    } else if (first.value === 'add_foreign_key') {
      foreignKeys.push(callArguments(tokens.slice(1)));
    }
  }
  const schemaTables = tables.map((table) => ({
    name: table.name,
    columns: table.columns.map((column) => ({
      ...column,
      primaryKey: column.primaryKey || table.compositeKey.includes(column.name),
      unique: table.uniqueColumns.has(column.name),
    })),
  }));
  const columnsOfTable = new Map(schemaTables.map((table) => [table.name, table.columns]));
  const relations = foreignKeys.map(({ positional: [fromTable, toTable], options }) => {
    const column = options.column ?? `${singularized(toTable)}_id`;
    return {
      from: { table: fromTable, column },
      to: { table: toTable, column: options.primary_key ?? 'id' },
      cardinality: foreignKeyCardinality(columnsOfTable.get(fromTable) ?? [], column),
    };
  });
  return { schema: { tables: schemaTables, relations }, warnings: [] };
}
