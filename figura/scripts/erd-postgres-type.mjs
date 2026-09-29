const CANONICAL_TYPES = new Map([
  ['int', 'integer'],
  ['int4', 'integer'],
  ['integer', 'integer'],
  ['serial', 'integer'],
  ['serial4', 'integer'],
  ['int8', 'bigint'],
  ['bigint', 'bigint'],
  ['bigserial', 'bigint'],
  ['serial8', 'bigint'],
  ['int2', 'smallint'],
  ['smallint', 'smallint'],
  ['smallserial', 'smallint'],
  ['serial2', 'smallint'],
  ['bool', 'boolean'],
  ['boolean', 'boolean'],
  ['float', 'double precision'],
  ['float8', 'double precision'],
  ['double precision', 'double precision'],
  ['float4', 'real'],
  ['real', 'real'],
  ['decimal', 'numeric'],
  ['numeric', 'numeric'],
  ['varchar', 'varchar'],
  ['character varying', 'varchar'],
  ['char', 'char'],
  ['character', 'char'],
  ['bpchar', 'char'],
  ['bit', 'bit'],
  ['varbit', 'varbit'],
  ['bit varying', 'varbit'],
  ['timestamp', 'timestamp'],
  ['timestamp without time zone', 'timestamp'],
  ['timestamptz', 'timestamptz'],
  ['timestamp with time zone', 'timestamptz'],
  ['time', 'time'],
  ['time without time zone', 'time'],
  ['timetz', 'timetz'],
  ['time with time zone', 'timetz'],
]);
const TYPES_KEEPING_MODIFIERS = new Set(['varchar', 'char', 'bit', 'varbit', 'numeric']);
const ARRAY_SUFFIX = /^(.*?)((?:\[\d*\])+)$/;
const MODIFIERS = /\(([^)]*)\)/;

export function postgresTypeName(spelling) {
  const unquoted = spelling.replaceAll('"', '').trim();
  const array = ARRAY_SUFFIX.exec(unquoted);
  if (array !== null) return `${postgresTypeName(array[1])}${'[]'.repeat(array[2].split('[').length - 1)}`;
  const modifiers = MODIFIERS.exec(unquoted)?.[1]?.split(',').map((modifier) => modifier.trim());
  const base = unquoted.replace(MODIFIERS, '').replace(/\s+/g, ' ').trim();
  const canonical = CANONICAL_TYPES.get(base.toLowerCase());
  if (canonical === undefined) return modifiers === undefined ? base : `${base}(${modifiers.join(',')})`;
  if (modifiers === undefined || !TYPES_KEEPING_MODIFIERS.has(canonical)) return canonical;
  const kept = canonical === 'numeric' && modifiers.length === 1 ? [...modifiers, '0'] : modifiers;
  return `${canonical}(${kept.join(',')})`;
}
