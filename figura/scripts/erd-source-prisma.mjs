import { foreignKeyCardinality } from './erd-model.mjs';
import { postgresTypeName } from './erd-postgres-type.mjs';
import { readSourceFiles } from './erd-source-files.mjs';
import { FiguraError } from './figura-error.mjs';

const SCALAR_TYPES = new Map([
  ['String', 'text'],
  ['Boolean', 'boolean'],
  ['Int', 'integer'],
  ['BigInt', 'bigint'],
  ['Float', 'double precision'],
  ['Decimal', 'decimal(65,30)'],
  ['DateTime', 'timestamp(3)'],
  ['Json', 'jsonb'],
  ['Bytes', 'bytea'],
]);
const NATIVE_TYPES = new Map([
  ['Text', 'text'],
  ['VarChar', 'varchar'],
  ['Char', 'char'],
  ['Uuid', 'uuid'],
  ['Xml', 'xml'],
  ['Inet', 'inet'],
  ['Citext', 'citext'],
  ['Bit', 'bit'],
  ['VarBit', 'varbit'],
  ['Boolean', 'boolean'],
  ['Integer', 'integer'],
  ['SmallInt', 'smallint'],
  ['Oid', 'oid'],
  ['BigInt', 'bigint'],
  ['DoublePrecision', 'double precision'],
  ['Real', 'real'],
  ['Decimal', 'numeric'],
  ['Money', 'money'],
  ['Timestamp', 'timestamp'],
  ['Timestamptz', 'timestamptz'],
  ['Date', 'date'],
  ['Time', 'time'],
  ['Timetz', 'timetz'],
  ['Json', 'json'],
  ['JsonB', 'jsonb'],
  ['ByteA', 'bytea'],
]);
const BLOCK_START = /^[ \t]*(model|enum|view|type|datasource|generator)\s+(\w+)\s*\{/gm;
const FIELD = /^(\w+)\s+(Unsupported\("(?:[^"\\]|\\.)*"\)|\w+)(\[\])?(\?)?(.*)$/;
const UNSUPPORTED_TYPE = /^Unsupported\((".*")\)$/;
const NAMED_ARGUMENT = /^(\w+)\s*:\s*/;
const OPENING_BRACKETS = '([{';
const CLOSING_BRACKETS = ')]}';
const SCHEMA_REMEDY = 'fix the Prisma schema so that prisma validate accepts it';

function stringEnd(text, quoteIndex) {
  for (let index = quoteIndex + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === '"') return index;
  }
  return text.length;
}

function withoutComments(text) {
  let result = '';
  let index = 0;
  while (index < text.length) {
    if (text[index] === '"') {
      const end = stringEnd(text, index);
      result += text.slice(index, end + 1);
      index = end + 1;
    } else if (text.startsWith('//', index)) {
      const lineEnd = text.indexOf('\n', index);
      index = lineEnd === -1 ? text.length : lineEnd;
    } else {
      result += text[index];
      index += 1;
    }
  }
  return result;
}

function matchingBracket(text, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === '"') index = stringEnd(text, index);
    else if (OPENING_BRACKETS.includes(text[index])) depth += 1;
    else if (CLOSING_BRACKETS.includes(text[index])) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function topLevelParts(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '"') index = stringEnd(text, index);
    else if (OPENING_BRACKETS.includes(text[index])) depth += 1;
    else if (CLOSING_BRACKETS.includes(text[index])) depth -= 1;
    else if (text[index] === ',' && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter((part) => part !== '');
}

function stringValue(literal) {
  try {
    return JSON.parse(literal);
  } catch {
    return literal.slice(1, -1);
  }
}

function argumentValue(text) {
  if (text.startsWith('"')) return stringValue(text);
  if (text.startsWith('[')) return topLevelParts(text.slice(1, -1)).map((item) => argumentValue(item.replace(/\(.*\)$/s, '').trim()));
  return text;
}

function argumentList(text) {
  const positional = [];
  const named = new Map();
  for (const part of topLevelParts(text ?? '')) {
    const name = NAMED_ARGUMENT.exec(part);
    if (name === null) positional.push(argumentValue(part));
    else named.set(name[1], argumentValue(part.slice(name[0].length)));
  }
  return { positional, named, text: text ?? '' };
}

function attributeList(text, prefix) {
  const attributes = [];
  let index = text.indexOf(prefix);
  while (index !== -1) {
    const name = /^[\w.]+/.exec(text.slice(index + prefix.length))?.[0] ?? '';
    let end = index + prefix.length + name.length;
    let argumentsText;
    if (text[end] === '(') {
      const close = matchingBracket(text, end);
      argumentsText = text.slice(end + 1, close === -1 ? text.length : close);
      end = close === -1 ? text.length : close + 1;
    }
    attributes.push({ name, arguments: argumentList(argumentsText) });
    index = text.indexOf(prefix, end);
  }
  return attributes;
}

function schemaBlocks(file) {
  const text = withoutComments(file.text);
  return [...text.matchAll(BLOCK_START)].map((match) => {
    const open = match.index + match[0].length - 1;
    const close = matchingBracket(text, open);
    if (close === -1) throw new FiguraError('ERD-INVALID', `cannot parse ${file.path}: the ${match[1]} ${match[2]} never closes`, SCHEMA_REMEDY);
    const lines = text.slice(open + 1, close).split('\n').map((line) => line.trim()).filter((line) => line !== '');
    return { keyword: match[1], name: match[2], lines, path: file.path };
  });
}

function blockAttribute(block, name) {
  return block.lines.filter((line) => line.startsWith('@@')).flatMap((line) => attributeList(line, '@@')).filter((attribute) => attribute.name === name);
}

function mappedName(attributes, fallback) {
  const map = attributes.find((attribute) => attribute.name === 'map');
  return map?.arguments.positional[0] ?? map?.arguments.named.get('name') ?? fallback;
}

function fieldSet(attribute) {
  return attribute.arguments.positional[0] ?? attribute.arguments.named.get('fields') ?? [];
}

function parsedModel(block) {
  const fields = block.lines
    .filter((line) => !line.startsWith('@@'))
    .map((line) => {
      const field = FIELD.exec(line);
      if (field === null) throw new FiguraError('ERD-INVALID', `cannot parse ${block.path}: model ${block.name} has the line ${JSON.stringify(line)}`, SCHEMA_REMEDY);
      return { name: field[1], type: field[2], isList: field[3] !== undefined, isOptional: field[4] !== undefined, attributes: attributeList(field[5], '@') };
    });
  return {
    name: block.name,
    tableName: mappedName(blockAttribute(block, 'map'), block.name),
    fields,
    primaryKeyFields: blockAttribute(block, 'id').flatMap(fieldSet),
    uniqueFieldSets: blockAttribute(block, 'unique').map(fieldSet),
  };
}

function fieldAttribute(field, name) {
  return field.attributes.find((attribute) => attribute.name === name);
}

function nativeSpelling(attribute) {
  const nativeName = attribute.name.slice('db.'.length);
  const base = NATIVE_TYPES.get(nativeName) ?? nativeName.toLowerCase();
  return attribute.arguments.text.trim() === '' ? base : `${base}(${attribute.arguments.text})`;
}

function columnType(model, field, enumTypeNames) {
  const native = field.attributes.find((attribute) => attribute.name.startsWith('db.'));
  const unsupported = UNSUPPORTED_TYPE.exec(field.type);
  let spelling;
  if (native !== undefined) spelling = nativeSpelling(native);
  else if (SCALAR_TYPES.has(field.type)) spelling = SCALAR_TYPES.get(field.type);
  else if (enumTypeNames.has(field.type)) spelling = enumTypeNames.get(field.type);
  else if (unsupported !== null) spelling = stringValue(unsupported[1]);
  else throw new FiguraError('ERD-INVALID', `model ${model.name} field ${field.name} has the unknown type ${field.type}`, SCHEMA_REMEDY);
  return postgresTypeName(`${spelling}${field.isList ? '[]' : ''}`);
}

function relationArguments(field) {
  return fieldAttribute(field, 'relation')?.arguments;
}

function relationName(field) {
  const relation = relationArguments(field);
  return relation?.positional[0] ?? relation?.named.get('name');
}

function isImplicitRelationSide(field, modelNames) {
  return modelNames.has(field.type) && field.isList && relationArguments(field)?.named.get('fields') === undefined;
}

export function readPrismaSchema(schemaPath) {
  const blocks = readSourceFiles(schemaPath, '.prisma').flatMap(schemaBlocks);
  const enumTypeNames = new Map(blocks.filter((block) => block.keyword === 'enum').map((block) => [block.name, mappedName(blockAttribute(block, 'map'), block.name)]));
  const compositeTypeNames = new Set(blocks.filter((block) => block.keyword === 'type').map((block) => block.name));
  const models = blocks.filter((block) => block.keyword === 'model').map(parsedModel);
  const modelByName = new Map(models.map((model) => [model.name, model]));
  const modelNames = new Set(modelByName.keys());
  const columnNameOf = (model, fieldName) => {
    const field = model.fields.find((candidate) => candidate.name === fieldName);
    return field === undefined ? fieldName : mappedName(field.attributes, field.name);
  };

  const tables = models.map((model) => ({
    name: model.tableName,
    columns: model.fields
      .filter((field) => !modelNames.has(field.type) && !compositeTypeNames.has(field.type))
      .map((field) => ({
        name: mappedName(field.attributes, field.name),
        type: columnType(model, field, enumTypeNames),
        primaryKey: fieldAttribute(field, 'id') !== undefined || model.primaryKeyFields.includes(field.name),
        unique: fieldAttribute(field, 'unique') !== undefined || model.uniqueFieldSets.some((fields) => fields.length === 1 && fields[0] === field.name),
        nullable: field.isOptional,
      })),
  }));
  const columnsOfTable = new Map(tables.map((table) => [table.name, table.columns]));

  const relations = models.flatMap((model) =>
    model.fields.flatMap((field) => {
      const relation = relationArguments(field);
      const fromFields = relation?.named.get('fields');
      const toFields = relation?.named.get('references');
      if (!modelNames.has(field.type) || fromFields === undefined || toFields === undefined) return [];
      const target = modelByName.get(field.type);
      return fromFields.map((fromField, index) => {
        const column = columnNameOf(model, fromField);
        return {
          from: { table: model.tableName, column },
          to: { table: target.tableName, column: columnNameOf(target, toFields[index]) },
          cardinality: foreignKeyCardinality(columnsOfTable.get(model.tableName), column),
        };
      });
    }),
  );

  const joinTableNames = new Set();
  for (const model of models) {
    for (const field of model.fields.filter((candidate) => isImplicitRelationSide(candidate, modelNames))) {
      const target = modelByName.get(field.type);
      const name = relationName(field);
      const opposite = target.fields.find(
        (candidate) => candidate !== field && candidate.type === model.name && isImplicitRelationSide(candidate, modelNames) && relationName(candidate) === name,
      );
      if (opposite === undefined) continue;
      const [first, second] = [model, target].sort((one, other) => (one.name < other.name ? -1 : one.name > other.name ? 1 : 0));
      const tableName = `_${name ?? `${first.name}To${second.name}`}`;
      if (joinTableNames.has(tableName)) continue;
      joinTableNames.add(tableName);
      const ends = [
        ['A', first],
        ['B', second],
      ].map(([column, end]) => {
        const key = columnsOfTable.get(end.tableName).filter((candidate) => candidate.primaryKey);
        if (key.length !== 1) {
          throw new FiguraError('ERD-INVALID', `the implicit many-to-many ${tableName} needs a single @id on model ${end.name}`, SCHEMA_REMEDY);
        }
        return { column, table: end.tableName, key: key[0] };
      });
      const columns = ends.map((end) => ({ name: end.column, type: end.key.type, primaryKey: true, unique: false, nullable: false }));
      tables.push({ name: tableName, columns });
      for (const end of ends) {
        relations.push({
          from: { table: tableName, column: end.column },
          to: { table: end.table, column: end.key.name },
          cardinality: foreignKeyCardinality(columns, end.column),
        });
      }
    }
  }
  return { schema: { tables, relations }, warnings: [] };
}
