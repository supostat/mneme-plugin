import { foreignKeyCardinality } from './erd-model.mjs';
import { postgresTypeName } from './erd-postgres-type.mjs';
import { readSourceFiles } from './erd-source-files.mjs';
import { FiguraError } from './figura-error.mjs';

const COLUMN_DECORATORS = new Set(['PrimaryGeneratedColumn', 'PrimaryColumn', 'Column', 'CreateDateColumn', 'UpdateDateColumn', 'DeleteDateColumn']);
const DATE_COLUMN_DECORATORS = new Set(['CreateDateColumn', 'UpdateDateColumn', 'DeleteDateColumn']);
const RELATION_DECORATORS = new Set(['ManyToOne', 'OneToOne', 'ManyToMany']);
const UNSUPPORTED_MEMBER_DECORATORS = new Set(['VersionColumn', 'ViewColumn', 'ObjectIdColumn', 'TreeParent', 'TreeChildren', 'TreeLevelColumn']);
const UNSUPPORTED_CLASS_DECORATORS = new Set(['TableInheritance', 'ChildEntity', 'Tree']);
const TYPESCRIPT_TYPES = new Map([
  ['string', 'varchar'],
  ['number', 'integer'],
  ['boolean', 'boolean'],
  ['Date', 'timestamp'],
  ['Buffer', 'bytea'],
]);
const CONSTRUCTOR_TYPES = new Map([
  ['String', 'varchar'],
  ['Number', 'integer'],
  ['Boolean', 'boolean'],
  ['Date', 'timestamp'],
  ['Buffer', 'bytea'],
]);
const SIMPLE_TYPES = new Map([
  ['simple-array', 'text'],
  ['simple-json', 'text'],
]);
const LITERALS = new Map([
  ['true', true],
  ['false', false],
  ['null', null],
  ['undefined', undefined],
]);
const DATE_COLUMN_TYPE = 'timestamp';
const GENERATED_KEY_TYPE = 'integer';
const ACTIVE_RECORD_BASE = 'BaseEntity';
const CLASS_PREFIXES = new Set(['export', 'default', 'abstract', 'declare']);
const MEMBER_MODIFIERS = new Set(['public', 'private', 'protected', 'readonly', 'static', 'declare', 'abstract', 'override', 'accessor', 'async', 'get', 'set']);
const LINE_CONTINUING_ENDS = new Set(['|', '&', '=>', '=', ':', ',', '.', '?', '(', '[', '{', '<', '+', '-', '*', '/', 'extends', 'keyof', 'typeof', 'new', 'in', 'is', 'as']);
const LINE_CONTINUING_STARTS = new Set(['|', '&', '.', '?.', '=>', '?', '=', '+', '*', '/']);
const REGEX_ALLOWED_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', 'return', 'typeof', 'case']);
const MULTI_CHARACTER_PUNCTUATION = ['=>', '...', '?.'];
const OPENERS = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]);
const CLOSERS = new Set(OPENERS.values());
const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[\w$]/;
const SOURCE_REMEDY = 'fix the entity source so that tsc compiles it';
const UNSUPPORTED_REMEDY = 'read the live database with --source psql to draw every column and relation';

function unterminated(path, what, text, index) {
  const line = text.slice(0, index).split('\n').length;
  return new FiguraError('ERD-INVALID', `cannot parse ${path}: ${what} at line ${line} never ends`, SOURCE_REMEDY);
}

function quotedEnd(text, start, path) {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === text[start]) return index + 1;
    else if (text[index] === '\n' && text[start] !== '`') break;
  }
  throw unterminated(path, 'a string', text, start);
}

function regexEnd(text, start, path) {
  let inClass = false;
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === '[') inClass = true;
    else if (text[index] === ']') inClass = false;
    else if (text[index] === '/' && !inClass) return index + 1 + /^[a-z]*/.exec(text.slice(index + 1))[0].length;
    else if (text[index] === '\n') break;
  }
  throw unterminated(path, 'a regular expression', text, start);
}

function isRegexStart(previous) {
  return previous === undefined || REGEX_ALLOWED_AFTER.has(previous.value);
}

function sourceTokens(text, path) {
  const tokens = [];
  let index = 0;
  let newlineBefore = false;
  while (index < text.length) {
    const character = text[index];
    if (character === '\n') {
      newlineBefore = true;
      index += 1;
      continue;
    }
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (text.startsWith('//', index)) {
      const lineEnd = text.indexOf('\n', index);
      index = lineEnd === -1 ? text.length : lineEnd;
      continue;
    }
    if (text.startsWith('/*', index)) {
      const commentEnd = text.indexOf('*/', index + 2);
      if (commentEnd === -1) throw unterminated(path, 'a comment', text, index);
      newlineBefore ||= text.slice(index, commentEnd).includes('\n');
      index = commentEnd + 2;
      continue;
    }
    const start = index;
    let kind = 'punctuation';
    if (character === '"' || character === "'" || character === '`') {
      kind = character === '`' ? 'template' : 'string';
      index = quotedEnd(text, index, path);
    } else if (IDENTIFIER_START.test(character)) {
      kind = 'identifier';
      while (index < text.length && IDENTIFIER_PART.test(text[index])) index += 1;
    } else if (/\d/.test(character)) {
      kind = 'number';
      while (index < text.length && /[\w.]/.test(text[index])) index += 1;
    } else if (character === '/' && isRegexStart(tokens.at(-1))) {
      kind = 'regex';
      index = regexEnd(text, index, path);
    } else {
      index += MULTI_CHARACTER_PUNCTUATION.find((punctuation) => text.startsWith(punctuation, index))?.length ?? 1;
    }
    const raw = text.slice(start, index);
    const value = kind === 'string' ? raw.slice(1, -1).replace(/\\(.)/g, '$1') : raw;
    tokens.push({ kind, value, newlineBefore });
    newlineBefore = false;
  }
  return tokens;
}

function isPunctuation(token, value) {
  return token?.kind === 'punctuation' && token.value === value;
}

function closingIndex(tokens, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].kind !== 'punctuation') continue;
    if (OPENERS.has(tokens[index].value)) depth += 1;
    else if (CLOSERS.has(tokens[index].value)) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return tokens.length;
}

function topLevelSlices(tokens) {
  const slices = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === 'punctuation' && OPENERS.has(token.value)) depth += 1;
    if (token.kind === 'punctuation' && CLOSERS.has(token.value)) depth -= 1;
    if (isPunctuation(token, ',') && depth === 0) slices.push([]);
    else slices.at(-1).push(token);
  }
  return slices.filter((slice) => slice.length > 0);
}

function topLevelIndex(tokens, value) {
  let depth = 0;
  for (const [index, token] of tokens.entries()) {
    if (token.kind === 'punctuation' && OPENERS.has(token.value)) depth += 1;
    if (token.kind === 'punctuation' && CLOSERS.has(token.value)) depth -= 1;
    if (isPunctuation(token, value) && depth === 0) return index;
  }
  return -1;
}

function objectValue(tokens) {
  const entries = new Map();
  for (const entry of topLevelSlices(tokens)) {
    const [key, separator] = entry;
    if (['identifier', 'string', 'number'].includes(key.kind) && isPunctuation(separator, ':')) entries.set(key.value, tokenValue(entry.slice(2)));
    else if (entry.length === 1 && key.kind === 'identifier') entries.set(key.value, { kind: 'identifier', name: key.value });
  }
  return { kind: 'object', entries };
}

function tokenValue(tokens) {
  const arrowIndex = topLevelIndex(tokens, '=>');
  if (arrowIndex !== -1) return { kind: 'arrow', body: tokens.slice(arrowIndex + 1) };
  const [first] = tokens;
  if (tokens.length === 1 && first.kind === 'string') return first.value;
  if (tokens.length === 1 && first.kind === 'number') return Number(first.value);
  if (tokens.length === 1 && first.kind === 'identifier') return LITERALS.has(first.value) ? LITERALS.get(first.value) : { kind: 'identifier', name: first.value };
  if (tokens.length === 2 && isPunctuation(first, '-') && tokens[1].kind === 'number') return -Number(tokens[1].value);
  const isEnclosed = (opener) => isPunctuation(first, opener) && closingIndex(tokens, 0) === tokens.length - 1;
  if (isEnclosed('{')) return objectValue(tokens.slice(1, -1));
  if (isEnclosed('[')) return topLevelSlices(tokens.slice(1, -1)).map(tokenValue);
  return { kind: 'expression' };
}

function parsedDecorator(tokens, atIndex) {
  let index = atIndex + 1;
  let name = tokens[index]?.value;
  index += 1;
  while (isPunctuation(tokens[index], '.') && tokens[index + 1]?.kind === 'identifier') {
    name = tokens[index + 1].value;
    index += 2;
  }
  if (!isPunctuation(tokens[index], '(')) return { name, arguments: [], next: index };
  const close = closingIndex(tokens, index);
  return { name, arguments: topLevelSlices(tokens.slice(index + 1, close)).map(tokenValue), next: close + 1 };
}

function isLineBoundary(tokens, index) {
  const token = tokens[index];
  return token.newlineBefore && !LINE_CONTINUING_ENDS.has(tokens[index - 1].value) && !LINE_CONTINUING_STARTS.has(token.value);
}

function expressionEnd(tokens, start, limit, { isType }) {
  let depth = 0;
  for (let index = start; index < limit; index += 1) {
    const token = tokens[index];
    const opens = token.kind === 'punctuation' && (OPENERS.has(token.value) || (isType && token.value === '<'));
    const closes = token.kind === 'punctuation' && (CLOSERS.has(token.value) || (isType && token.value === '>'));
    if (depth === 0 && index > start) {
      if (isPunctuation(token, ';') || isPunctuation(token, '@') || (isType && isPunctuation(token, '='))) return index;
      if (isLineBoundary(tokens, index)) return index;
    }
    if (opens) depth += 1;
    if (closes) depth -= 1;
  }
  return limit;
}

function angleClosingIndex(tokens, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (isPunctuation(tokens[index], '<')) depth += 1;
    if (isPunctuation(tokens[index], '>')) depth -= 1;
    if (depth === 0) return index;
  }
  return tokens.length;
}

function skippedMethod(tokens, index, limit) {
  let cursor = isPunctuation(tokens[index], '<') ? angleClosingIndex(tokens, index) + 1 : index;
  cursor = closingIndex(tokens, cursor) + 1;
  while (cursor < limit && !isPunctuation(tokens[cursor], '{') && !isPunctuation(tokens[cursor], ';') && !isLineBoundary(tokens, cursor)) cursor += 1;
  return isPunctuation(tokens[cursor], '{') ? closingIndex(tokens, cursor) + 1 : cursor;
}

function isMemberNameStart(token) {
  return ['identifier', 'string', 'number'].includes(token?.kind) || isPunctuation(token, '[') || isPunctuation(token, '#') || isPunctuation(token, '*');
}

function parsedMembers(tokens, start, end, className) {
  const members = [];
  let decorators = [];
  let index = start;
  while (index < end) {
    const token = tokens[index];
    if (isPunctuation(token, ';')) {
      index += 1;
      continue;
    }
    if (isPunctuation(token, '@')) {
      const decorator = parsedDecorator(tokens, index);
      decorators.push(decorator);
      index = decorator.next;
      continue;
    }
    if (isPunctuation(token, '{')) {
      index = closingIndex(tokens, index) + 1;
      decorators = [];
      continue;
    }
    while (tokens[index].kind === 'identifier' && MEMBER_MODIFIERS.has(tokens[index].value) && isMemberNameStart(tokens[index + 1]) && !tokens[index + 1].newlineBefore) index += 1;
    let name;
    if (isPunctuation(tokens[index], '[')) index = closingIndex(tokens, index) + 1;
    else {
      if (isPunctuation(tokens[index], '#') || isPunctuation(tokens[index], '*')) index += 1;
      name = tokens[index].value;
      index += 1;
    }
    if (isPunctuation(tokens[index], '?') || isPunctuation(tokens[index], '!')) index += 1;
    if (isPunctuation(tokens[index], '(') || isPunctuation(tokens[index], '<')) {
      index = skippedMethod(tokens, index, end);
      decorators = [];
      continue;
    }
    let typeTokens = [];
    if (isPunctuation(tokens[index], ':')) {
      const typeEnd = expressionEnd(tokens, index + 1, end, { isType: true });
      typeTokens = tokens.slice(index + 1, typeEnd);
      index = typeEnd;
    }
    if (isPunctuation(tokens[index], '=')) index = expressionEnd(tokens, index + 1, end, { isType: false });
    if (name !== undefined) members.push({ name, className, decorators, typeTokens });
    decorators = [];
  }
  return members;
}

function parsedClass(tokens, classIndex, decorators) {
  const name = tokens[classIndex + 1].value;
  let index = classIndex + 2;
  let parent;
  let depth = 0;
  while (index < tokens.length && !(depth === 0 && isPunctuation(tokens[index], '{'))) {
    if (isPunctuation(tokens[index], '<') || isPunctuation(tokens[index], '(')) depth += 1;
    if (isPunctuation(tokens[index], '>') || isPunctuation(tokens[index], ')')) depth -= 1;
    if (depth === 0 && tokens[index].kind === 'identifier' && tokens[index].value === 'extends') {
      let cursor = index + 1;
      parent = tokens[cursor]?.value;
      while (isPunctuation(tokens[cursor + 1], '.') && tokens[cursor + 2]?.kind === 'identifier') {
        cursor += 2;
        parent = tokens[cursor].value;
      }
    }
    index += 1;
  }
  const close = closingIndex(tokens, index);
  return { declaration: { name, parent, decorators, members: parsedMembers(tokens, index + 1, close, name) }, next: close + 1 };
}

function parsedClasses(file) {
  const tokens = sourceTokens(file.text, file.path);
  const classes = [];
  let decorators = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (isPunctuation(token, '@')) {
      const decorator = parsedDecorator(tokens, index);
      decorators.push(decorator);
      index = decorator.next;
    } else if (token.kind === 'identifier' && token.value === 'class' && tokens[index + 1]?.kind === 'identifier' && !isPunctuation(tokens[index - 1], '.')) {
      const parsed = parsedClass(tokens, index, decorators);
      classes.push(parsed.declaration);
      decorators = [];
      index = parsed.next;
    } else {
      if (!(token.kind === 'identifier' && CLASS_PREFIXES.has(token.value))) decorators = [];
      index += 1;
    }
  }
  return classes;
}

function option(options, key) {
  return options?.entries.get(key);
}

function objectArgument(values) {
  return values.find((value) => value?.kind === 'object');
}

function decoratorNamed(decorators, name) {
  return decorators.find((decorator) => decorator.name === name);
}

function typeormSnakeCase(text) {
  return text
    .replace(/([A-Z])([A-Z])([a-z])/g, '$1_$2$3')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function typeormCamelCase(text) {
  return text.replace(/^([A-Z])|[\s\-_](\w)/g, (match, first, next) => (next === undefined ? first.toLowerCase() : next.toUpperCase()));
}

function typescriptTypeName(typeTokens) {
  const meaningful = typeTokens.filter((token) => !['null', 'undefined', '|'].includes(token.value));
  return meaningful.length === 1 && meaningful[0].kind === 'identifier' ? meaningful[0].value : undefined;
}

function columnBaseType(tableName, columnName, declared, options, member, defaultBase) {
  const isEnum = declared === 'enum' || (declared === undefined && option(options, 'enum') !== undefined);
  if (isEnum) return { base: option(options, 'enumName') ?? `${tableName}_${columnName.toLowerCase()}_enum`, isEnum };
  if (typeof declared === 'string') return { base: SIMPLE_TYPES.get(declared) ?? declared, isEnum };
  if (declared?.kind === 'identifier') return { base: CONSTRUCTOR_TYPES.get(declared.name), isEnum };
  if (defaultBase !== undefined) return { base: defaultBase, isEnum };
  if (option(options, 'length') !== undefined) return { base: 'varchar', isEnum };
  return { base: TYPESCRIPT_TYPES.get(typescriptTypeName(member.typeTokens)), isEnum };
}

function columnType(tableName, columnName, declared, options, member, defaultBase) {
  const { base, isEnum } = columnBaseType(tableName, columnName, declared, options, member, defaultBase);
  if (base === undefined) return undefined;
  const length = option(options, 'length');
  const precision = option(options, 'precision');
  const scale = option(options, 'scale');
  const precisionModifiers = precision === undefined ? [] : [precision, ...(scale === undefined ? [] : [scale])];
  const modifiers = isEnum ? [] : length === undefined ? precisionModifiers : [length];
  const suffix = option(options, 'array') === true ? '[]' : '';
  return postgresTypeName(`${base}${modifiers.length === 0 ? '' : `(${modifiers.join(',')})`}${suffix}`);
}

function memberColumn(tableName, member, decorator) {
  const [first] = decorator.arguments;
  const options = objectArgument(decorator.arguments);
  const columnName = option(options, 'name') ?? member.name;
  if (first?.kind === 'arrow') return { skippedBecause: `@${decorator.name} embedding ${first.body.find((token) => token.kind === 'identifier')?.value}` };
  const column = { propertyName: member.name, name: columnName, primaryKey: false, unique: option(options, 'unique') === true, nullable: option(options, 'nullable') === true };
  if (decorator.name === 'PrimaryGeneratedColumn') {
    const strategy = typeof first === 'string' ? first : 'increment';
    return { ...column, type: postgresTypeName(strategy === 'uuid' ? 'uuid' : (option(options, 'type') ?? GENERATED_KEY_TYPE)), primaryKey: true, nullable: false };
  }
  const declared = typeof first === 'string' || first?.kind === 'identifier' ? first : option(options, 'type');
  const defaultBase = DATE_COLUMN_DECORATORS.has(decorator.name) ? DATE_COLUMN_TYPE : undefined;
  const type = columnType(tableName, columnName, declared, options, member, defaultBase);
  if (type === undefined) return { skippedBecause: `@${decorator.name} without a type the parser can tell` };
  if (decorator.name === 'PrimaryColumn') return { ...column, type, primaryKey: true, nullable: false };
  if (decorator.name === 'DeleteDateColumn') return { ...column, type, nullable: true };
  return { ...column, type, primaryKey: option(options, 'primary') === true };
}

function relationTargetName(value) {
  if (typeof value === 'string') return value;
  return value?.kind === 'arrow' ? value.body.find((token) => token.kind === 'identifier')?.value : undefined;
}

function joinSpecifications(value) {
  if (Array.isArray(value)) return value.filter((specification) => specification?.kind === 'object');
  return value?.kind === 'object' ? [value] : [];
}

function referencedColumns(entity, specifications) {
  const byProperty = specifications.map((specification) => option(specification, 'referencedColumnName'));
  if (specifications.length > 0 && byProperty.every((propertyName) => propertyName !== undefined)) {
    return byProperty.map((propertyName) => entity.columns.find((column) => column.propertyName === propertyName));
  }
  return entity.columns.filter((column) => column.primaryKey);
}

function lineage(classDeclaration, classByName, skipped) {
  const parentName = classDeclaration.parent;
  if (parentName === undefined || parentName === ACTIVE_RECORD_BASE) return [classDeclaration];
  const parent = classByName.get(parentName);
  if (parent === undefined) {
    skipped.add(`${classDeclaration.name} (extends ${parentName}, which the parser did not find)`);
    return [classDeclaration];
  }
  return [...lineage(parent, classByName, skipped), classDeclaration];
}

function mergedMembers(ancestry) {
  return ancestry.reduce((members, declaration) => {
    const overridden = new Set(declaration.members.map((member) => member.name));
    return [...members.filter((member) => !overridden.has(member.name)), ...declaration.members];
  }, []);
}

function entityTableName(classDeclaration) {
  const [first] = decoratorNamed(classDeclaration.decorators, 'Entity').arguments;
  if (typeof first === 'string') return first;
  return option(first, 'name') ?? typeormSnakeCase(classDeclaration.name);
}

function indexedFieldNames(values) {
  for (const value of values) {
    if (Array.isArray(value)) return value.filter((field) => typeof field === 'string');
    if (value?.kind === 'arrow') return value.body.filter((token, index) => token.kind === 'identifier' && isPunctuation(value.body[index - 1], '.')).map((token) => token.value);
  }
  return undefined;
}

function isUniqueIndex(decorator) {
  if (decorator.name === 'Unique') return true;
  const options = objectArgument(decorator.arguments);
  return decorator.name === 'Index' && option(options, 'unique') === true && option(options, 'where') === undefined;
}

function entityWithColumns(classDeclaration, classByName, skipped) {
  const ancestry = lineage(classDeclaration, classByName, skipped);
  const tableName = entityTableName(classDeclaration);
  const entity = {
    className: classDeclaration.name,
    tableName,
    columns: [],
    implicitColumns: [],
    relationMembers: [],
    joinColumnsOfProperty: new Map(),
    classDecorators: ancestry.flatMap((declaration) => declaration.decorators),
    members: mergedMembers(ancestry),
  };
  for (const member of entity.members) {
    const unsupported = member.decorators.find((decorator) => UNSUPPORTED_MEMBER_DECORATORS.has(decorator.name));
    const columnDecorator = member.decorators.find((decorator) => COLUMN_DECORATORS.has(decorator.name));
    const relationDecorator = member.decorators.find((decorator) => RELATION_DECORATORS.has(decorator.name));
    if (unsupported !== undefined) {
      skipped.add(`${member.className}.${member.name} (@${unsupported.name})`);
    } else if (columnDecorator !== undefined) {
      const column = memberColumn(tableName, member, columnDecorator);
      if (column.skippedBecause === undefined) entity.columns.push(column);
      else skipped.add(`${member.className}.${member.name} (${column.skippedBecause})`);
    } else if (relationDecorator !== undefined) {
      entity.relationMembers.push({ member, decorator: relationDecorator });
    }
  }
  return entity;
}

function addJoinColumns(entity, member, decorator, target, relations, skipped) {
  const specifications = joinSpecifications(decoratorNamed(member.decorators, 'JoinColumn')?.arguments[0]);
  const referenced = referencedColumns(target, specifications);
  if (referenced.length === 0 || referenced.includes(undefined)) {
    skipped.add(`${member.className}.${member.name} (@${decorator.name} to a column of ${target.className} the parser did not find)`);
    return;
  }
  const options = objectArgument(decorator.arguments.slice(1));
  const names = referenced.map((column, index) => option(specifications[index], 'name') ?? typeormCamelCase(`${member.name}_${column.propertyName}`));
  referenced.forEach((column, index) => {
    let joinColumn = [...entity.columns, ...entity.implicitColumns].find((candidate) => candidate.name === names[index]);
    if (joinColumn === undefined) {
      joinColumn = { name: names[index], type: column.type, primaryKey: false, unique: false, nullable: option(options, 'nullable') !== false };
      entity.implicitColumns.push(joinColumn);
    }
    if (decorator.name === 'OneToOne') joinColumn.unique = true;
    relations.push({ from: { table: entity.tableName, column: names[index] }, to: { table: target.tableName, column: column.name } });
  });
  entity.joinColumnsOfProperty.set(member.name, names);
}

function junctionTable(entity, member, target, relations, skipped) {
  const joinTable = objectArgument(decoratorNamed(member.decorators, 'JoinTable').arguments);
  const ends = [
    [entity, joinSpecifications(option(joinTable, 'joinColumns') ?? option(joinTable, 'joinColumn'))],
    [target, joinSpecifications(option(joinTable, 'inverseJoinColumns') ?? option(joinTable, 'inverseJoinColumn'))],
  ].map(([end, specifications]) => ({ end, specifications, referenced: referencedColumns(end, specifications) }));
  if (ends.some(({ referenced }) => referenced.length === 0 || referenced.includes(undefined))) {
    skipped.add(`${member.className}.${member.name} (@ManyToMany to a column the parser did not find)`);
    return undefined;
  }
  const tableName = option(joinTable, 'name') ?? typeormSnakeCase(`${entity.tableName}_${member.name}_${target.tableName}`);
  const columns = ends.flatMap(({ end, specifications, referenced }) =>
    referenced.map((column, index) => {
      const name = option(specifications[index], 'name') ?? typeormCamelCase(`${end.tableName}_${column.name}`);
      relations.push({ from: { table: tableName, column: name }, to: { table: end.tableName, column: column.name } });
      return { name, type: column.type, primaryKey: true, unique: false, nullable: false };
    }),
  );
  return { name: tableName, columns };
}

function markUniqueColumns(entity) {
  const allColumns = [...entity.columns, ...entity.implicitColumns];
  const columnsOfProperty = (propertyName) =>
    entity.joinColumnsOfProperty.get(propertyName) ?? entity.columns.filter((column) => column.propertyName === propertyName).map((column) => column.name);
  const markSingle = (propertyNames) => {
    const columnNames = propertyNames.flatMap(columnsOfProperty);
    if (columnNames.length !== 1) return;
    const column = allColumns.find((candidate) => candidate.name === columnNames[0]);
    if (column !== undefined) column.unique = true;
  };
  for (const member of entity.members) {
    if (member.decorators.some((decorator) => decorator.name === 'Index' && isUniqueIndex(decorator))) markSingle([member.name]);
  }
  for (const decorator of entity.classDecorators.filter(isUniqueIndex)) {
    const fields = indexedFieldNames(decorator.arguments);
    if (fields?.length === 1) markSingle(fields);
  }
}

export function readTypeormSchema(sourcePath) {
  const classes = readSourceFiles(sourcePath, '.ts').flatMap(parsedClasses);
  const classByName = new Map();
  for (const declaration of classes) if (!classByName.has(declaration.name)) classByName.set(declaration.name, declaration);
  const skipped = new Set();
  for (const declaration of classes) {
    const unsupported = declaration.decorators.find((decorator) => UNSUPPORTED_CLASS_DECORATORS.has(decorator.name));
    if (unsupported !== undefined) skipped.add(`${declaration.name} (@${unsupported.name})`);
  }
  const entities = classes.filter((declaration) => decoratorNamed(declaration.decorators, 'Entity') !== undefined).map((declaration) => entityWithColumns(declaration, classByName, skipped));
  const entityByName = new Map(entities.flatMap((entity) => [[entity.tableName, entity], [entity.className, entity]]));
  const relations = [];
  const junctionTables = [];
  for (const entity of entities) {
    for (const { member, decorator } of entity.relationMembers) {
      const targetName = relationTargetName(decorator.arguments[0]);
      const target = entityByName.get(targetName);
      const hasJoinTable = decoratorNamed(member.decorators, 'JoinTable') !== undefined;
      const hasJoinColumn = decoratorNamed(member.decorators, 'JoinColumn') !== undefined;
      const isOwner = decorator.name === 'ManyToOne' || (decorator.name === 'OneToOne' && hasJoinColumn) || (decorator.name === 'ManyToMany' && hasJoinTable);
      if (!isOwner) continue;
      if (target === undefined) {
        skipped.add(`${member.className}.${member.name} (@${decorator.name} to ${targetName}, which the parser did not find)`);
      } else if (decorator.name === 'ManyToMany') {
        const table = junctionTable(entity, member, target, relations, skipped);
        if (table !== undefined) junctionTables.push(table);
      } else {
        addJoinColumns(entity, member, decorator, target, relations, skipped);
      }
    }
  }
  for (const entity of entities) markUniqueColumns(entity);
  const tables = [
    ...entities.map((entity) => ({
      name: entity.tableName,
      columns: [...entity.columns, ...entity.implicitColumns].map(({ name, type, primaryKey, unique, nullable }) => ({ name, type, primaryKey, unique, nullable })),
    })),
    ...junctionTables,
  ];
  const columnsOfTable = new Map(tables.map((table) => [table.name, table.columns]));
  const schema = {
    tables,
    relations: relations.map((relation) => ({ ...relation, cardinality: foreignKeyCardinality(columnsOfTable.get(relation.from.table), relation.from.column) })),
  };
  const warnings =
    skipped.size === 0
      ? []
      : [new FiguraError('TYPEORM-UNSUPPORTED', `the parser left out ${skipped.size} ${skipped.size === 1 ? 'declaration' : 'declarations'} it does not model: ${[...skipped].join(', ')}`, UNSUPPORTED_REMEDY)];
  return { schema, warnings };
}
