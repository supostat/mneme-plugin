import { spawnSync } from 'node:child_process';
import { foreignKeyCardinality } from './erd-model.mjs';
import { postgresTypeName } from './erd-postgres-type.mjs';
import { FiguraError } from './figura-error.mjs';

const CATALOG_QUERY = `
with schema_tables as (
  select c.oid, c.relname
  from pg_catalog.pg_class c
  where c.relnamespace = pg_catalog.to_regnamespace(pg_catalog.current_schema())
    and c.relkind in ('r', 'p')
    and not c.relispartition
)
select pg_catalog.json_build_object(
  'tables', coalesce((
    select pg_catalog.json_agg(pg_catalog.json_build_object(
      'name', t.relname,
      'columns', coalesce((
        select pg_catalog.json_agg(pg_catalog.json_build_object(
          'name', a.attname,
          'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
          'notNull', a.attnotnull,
          'primaryKey', exists (
            select 1 from pg_catalog.pg_constraint pk
            where pk.conrelid = t.oid and pk.contype = 'p' and a.attnum = any (pk.conkey)
          ),
          'unique', exists (
            select 1 from pg_catalog.pg_index i
            where i.indrelid = t.oid and i.indisunique and not i.indisprimary
              and i.indnatts = 1 and i.indkey[0] = a.attnum
              and i.indpred is null and i.indexprs is null
          )
        ) order by a.attnum)
        from pg_catalog.pg_attribute a
        where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
      ), '[]'::json)
    ) order by t.relname)
    from schema_tables t
  ), '[]'::json),
  'foreignKeys', coalesce((
    select pg_catalog.json_agg(pg_catalog.json_build_object(
      'table', source.relname,
      'column', source_column.attname,
      'referencedTable', target.relname,
      'referencedColumn', target_column.attname
    ) order by source.relname, fk.conname, pair.position)
    from pg_catalog.pg_constraint fk
    join schema_tables source on source.oid = fk.conrelid
    join schema_tables target on target.oid = fk.confrelid
    cross join lateral unnest(fk.conkey, fk.confkey) with ordinality as pair(source_number, target_number, position)
    join pg_catalog.pg_attribute source_column on source_column.attrelid = fk.conrelid and source_column.attnum = pair.source_number
    join pg_catalog.pg_attribute target_column on target_column.attrelid = fk.confrelid and target_column.attnum = pair.target_number
    where fk.contype = 'f'
  ), '[]'::json)
)`;
const PSQL_ARGUMENTS = ['-X', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1'];
const POSTGRES_URL = /^(postgres(?:ql)?:\/\/)(?:([^@/]*)@)?(.*)$/;
const PASSWORD_PARAMETER = 'password=';
const REDACTED = '[redacted]';
const CATALOG_OUTPUT_LIMIT = 256 * 1024 * 1024;
const QUERY_REMEDY = 'check that the database in the address is reachable and that the credentials are right';

function decodedPassword(encoded) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

export function postgresConnection(address) {
  const match = POSTGRES_URL.exec(address);
  if (match === null) return undefined;
  const [, scheme, userInfo, rest] = match;
  const separator = userInfo?.indexOf(':') ?? -1;
  const user = separator === -1 ? userInfo : userInfo.slice(0, separator);
  const encodedPasswords = separator === -1 ? [] : [userInfo.slice(separator + 1)];
  const queryStart = rest.indexOf('?');
  const location = queryStart === -1 ? rest : rest.slice(0, queryStart);
  const parameters = queryStart === -1 ? [] : rest.slice(queryStart + 1).split('&');
  encodedPasswords.push(...parameters.filter((parameter) => parameter.startsWith(PASSWORD_PARAMETER)).map((parameter) => parameter.slice(PASSWORD_PARAMETER.length)));
  const keptParameters = parameters.filter((parameter) => !parameter.startsWith(PASSWORD_PARAMETER));
  const passwords = encodedPasswords.map(decodedPassword);
  if (passwords.includes(undefined)) return undefined;
  const addressWithoutPassword = `${scheme}${user ? `${user}@` : ''}${location}${keptParameters.length === 0 ? '' : `?${keptParameters.join('&')}`}`;
  const secrets = [address, addressWithoutPassword, ...encodedPasswords, ...passwords].filter((secret) => secret !== '');
  return {
    address: addressWithoutPassword,
    password: passwords.at(-1),
    secrets: [...new Set(secrets)].sort((first, second) => second.length - first.length),
  };
}

function redacted(text, secrets) {
  return secrets.reduce((result, secret) => result.replaceAll(secret, REDACTED), text);
}

function catalogSchema(catalog) {
  const tables = catalog.tables.map((table) => ({
    name: table.name,
    columns: table.columns.map((column) => ({
      name: column.name,
      type: postgresTypeName(column.type),
      primaryKey: column.primaryKey,
      unique: column.unique,
      nullable: !column.notNull,
    })),
  }));
  const columnsOfTable = new Map(tables.map((table) => [table.name, table.columns]));
  const relations = catalog.foreignKeys.map((foreignKey) => ({
    from: { table: foreignKey.table, column: foreignKey.column },
    to: { table: foreignKey.referencedTable, column: foreignKey.referencedColumn },
    cardinality: foreignKeyCardinality(columnsOfTable.get(foreignKey.table), foreignKey.column),
  }));
  return { tables, relations };
}

function parsedCatalog(output) {
  try {
    const catalog = JSON.parse(output);
    return Array.isArray(catalog?.tables) && Array.isArray(catalog?.foreignKeys) ? catalog : undefined;
  } catch {
    return undefined;
  }
}

export function readPostgresSchema(connection, { environment = process.env } = {}) {
  const passwordEnvironment = connection.password === undefined || connection.password === '' ? {} : { PGPASSWORD: connection.password };
  const query = spawnSync('psql', [...PSQL_ARGUMENTS, '-d', connection.address, '-c', CATALOG_QUERY], {
    env: { ...environment, ...passwordEnvironment },
    encoding: 'utf8',
    maxBuffer: CATALOG_OUTPUT_LIMIT,
  });
  if (query.error !== undefined) {
    throw new FiguraError('PSQL-FAILED', `psql could not run: ${redacted(query.error.message, connection.secrets)}`, QUERY_REMEDY);
  }
  if (query.status !== 0) {
    const detail = redacted(query.stderr.trim().split('\n').map((line) => line.trim()).join(' '), connection.secrets);
    throw new FiguraError('PSQL-FAILED', `psql exited with status ${query.status}${detail === '' ? '' : `: ${detail}`}`, QUERY_REMEDY);
  }
  const catalog = parsedCatalog(query.stdout);
  if (catalog === undefined) {
    throw new FiguraError('PSQL-FAILED', 'psql did not print the catalog as JSON', 'point the address at a PostgreSQL 12 or newer database');
  }
  return { schema: catalogSchema(catalog), warnings: [] };
}
