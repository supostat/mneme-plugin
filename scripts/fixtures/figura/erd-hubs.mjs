const HUB_DOMAIN = 'people';
const SPOKE_DOMAINS = [
  ['accessories', 'accessory'],
  ['finance', 'finance'],
  ['maintenance', 'maintenance'],
  ['quizzes', 'quiz_category'],
  ['rotas', 'rota'],
  ['security', 'security'],
];
const SPOKE_NOUNS = ['questions', 'requests', 'orders', 'refunds', 'checks', 'reports', 'reviews', 'schedules', 'assignments', 'settlements'];
const USER_COLUMNS = ['creator_user_id', 'approver_user_id', 'user_id'];
const VENUE_COLUMNS = ['venue_id', 'transfer_venue_id'];
const SPOKES_WITH_THREE_USERS = 57;
const SPOKES_WITH_TWO_VENUES = 3;
const SPOKES_WITH_STAFF = 50;

function column(name, type, constraints = {}) {
  return { name, type, ...constraints };
}

function identifier() {
  return column('id', 'bigint', { primaryKey: true });
}

function serviceColumns() {
  return [column('created_at', 'timestamp'), column('updated_at', 'timestamp')];
}

function manyToOne(fromTable, fromColumn, toTable) {
  return { from: { table: fromTable, column: fromColumn }, to: { table: toTable, column: 'id' }, cardinality: 'many-to-one' };
}

function hubTables() {
  return [
    { name: 'users', domain: HUB_DOMAIN, columns: [identifier(), column('email', 'varchar(320)', { unique: true }), column('first_name', 'varchar'), column('last_name', 'varchar'), column('role', 'varchar'), ...serviceColumns()] },
    { name: 'venues', domain: HUB_DOMAIN, columns: [identifier(), column('name', 'varchar'), column('address', 'text'), column('timezone', 'varchar'), ...serviceColumns()] },
    {
      name: 'staff_members',
      domain: HUB_DOMAIN,
      columns: [identifier(), column('user_id', 'bigint'), column('venue_id', 'bigint'), column('first_name', 'varchar'), column('last_name', 'varchar'), ...serviceColumns()],
    },
  ];
}

function hubRelations() {
  return [manyToOne('staff_members', 'user_id', 'users'), manyToOne('staff_members', 'venue_id', 'venues')];
}

function holidayTables() {
  const domain = 'holidays';
  const transitions = (name) => [identifier(), column(name, 'bigint'), column('to_state', 'varchar'), column('sort_key', 'integer'), column('created_at', 'timestamp')];
  const period = [column('holiday_type', 'varchar'), column('start_date', 'date'), column('end_date', 'date')];
  return [
    { name: 'holidays', domain, columns: [identifier(), column('staff_member_id', 'bigint'), column('creator_user_id', 'bigint'), ...period, ...serviceColumns()] },
    { name: 'holiday_transitions', domain, columns: transitions('holiday_id') },
    {
      name: 'holiday_requests',
      domain,
      columns: [identifier(), column('staff_member_id', 'bigint'), column('creator_user_id', 'bigint'), column('holiday_id', 'bigint'), ...period, ...serviceColumns()],
    },
    { name: 'holiday_request_transitions', domain, columns: transitions('holiday_request_id') },
    { name: 'public_holidays', domain, columns: [identifier(), column('venue_id', 'bigint'), column('date', 'date'), column('name', 'varchar'), column('created_at', 'timestamp')] },
  ];
}

function holidayRelations() {
  return [
    manyToOne('holidays', 'staff_member_id', 'staff_members'),
    manyToOne('holidays', 'creator_user_id', 'users'),
    manyToOne('holiday_transitions', 'holiday_id', 'holidays'),
    manyToOne('holiday_requests', 'staff_member_id', 'staff_members'),
    manyToOne('holiday_requests', 'creator_user_id', 'users'),
    manyToOne('holiday_requests', 'holiday_id', 'holidays'),
    manyToOne('holiday_request_transitions', 'holiday_request_id', 'holiday_requests'),
    manyToOne('public_holidays', 'venue_id', 'venues'),
  ];
}

function spokeHubColumns(spokeIndex) {
  const userColumns = USER_COLUMNS.slice(0, spokeIndex < SPOKES_WITH_THREE_USERS ? 3 : 2).map((name) => [name, 'users']);
  const venueColumns = VENUE_COLUMNS.slice(0, spokeIndex < SPOKES_WITH_TWO_VENUES ? 2 : 1).map((name) => [name, 'venues']);
  const staffColumns = spokeIndex < SPOKES_WITH_STAFF ? [['staff_member_id', 'staff_members']] : [];
  return [...userColumns, ...venueColumns, ...staffColumns];
}

function spokeDomain([domain, prefix], domainIndex) {
  const tables = [];
  const relations = [];
  for (const [nounIndex, noun] of SPOKE_NOUNS.entries()) {
    const name = `${prefix}_${noun}`;
    const hubColumns = spokeHubColumns(domainIndex * SPOKE_NOUNS.length + nounIndex);
    const parentColumn = noun === 'questions' ? [`parent_${prefix}_question_id`] : [];
    tables.push({
      name,
      domain,
      columns: [
        identifier(),
        ...hubColumns.map(([columnName]) => column(columnName, 'bigint')),
        ...parentColumn.map((columnName) => column(columnName, 'bigint', { nullable: true })),
        column('status', 'varchar'),
        column('processed_at', 'timestamp', { nullable: true }),
        ...serviceColumns(),
      ],
    });
    relations.push(...hubColumns.map(([columnName, hub]) => manyToOne(name, columnName, hub)));
    relations.push(...parentColumn.map((columnName) => manyToOne(name, columnName, name)));
  }
  const transitionsName = `${prefix}_request_transitions`;
  const requestColumn = `${prefix}_request_id`;
  tables.push({ name: transitionsName, domain, columns: [identifier(), column(requestColumn, 'bigint'), column('to_state', 'varchar'), column('sort_key', 'integer'), column('created_at', 'timestamp')] });
  relations.push(manyToOne(transitionsName, requestColumn, `${prefix}_requests`));
  return { tables, relations };
}

export const HUB_INCOMING_FOREIGN_KEYS = { users: 180, venues: 65, staff_members: 52 };
export const HOLIDAY_TABLES = ['holiday_request_transitions', 'holiday_requests', 'holiday_transitions', 'holidays', 'public_holidays'];

export function hubsAndSpokesSchema() {
  const spokeDomains = SPOKE_DOMAINS.map(spokeDomain);
  return {
    tables: [...hubTables(), ...holidayTables(), ...spokeDomains.flatMap((spokes) => spokes.tables)],
    relations: [...hubRelations(), ...holidayRelations(), ...spokeDomains.flatMap((spokes) => spokes.relations)],
  };
}
