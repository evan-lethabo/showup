// Database schema (version 1) and a non-destructive setup that refuses to run over incompatible tables.
// Version 2: events.duration_min may be NULL (no fixed event length).
// Times are linear minutes from the day's midnight; values above 1440 are after midnight.
// Conditions are stored only once confirmed; there is deliberately no column for raw condition text.
import type { Db, Statement } from './db';

export const SCHEMA_VERSION = 2;
const LOCK_KEY = 74_201_801;

const ID = `'^[A-Za-z0-9_-]{16}$'`;
const HASH = `'^[0-9a-f]{64}$'`;
const PEOPLE_OK = `CASE WHEN jsonb_typeof(payload->'people') = 'array'
      THEN jsonb_array_length(payload->'people') > 0 AND NOT jsonb_path_exists(payload, '$.people[*] ? (@.type() != "string")')
      ELSE false END`;
const MINUTES_OK = (key: string) =>
  `(NOT payload ? '${key}' OR jsonb_typeof(payload->'${key}') = 'number')`;

const TABLES: Record<string, string> = {
  schema_migrations: `CREATE TABLE IF NOT EXISTS schema_migrations (
    version integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`,
  events: `CREATE TABLE IF NOT EXISTS events (
    id text NOT NULL,
    title text NOT NULL,
    organiser_name text NOT NULL,
    duration_min integer,
    timezone text NOT NULL,
    organiser_token_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT events_pkey PRIMARY KEY (id),
    CONSTRAINT events_id_format CHECK (id ~ ${ID}),
    CONSTRAINT events_title_length CHECK (char_length(title) BETWEEN 1 AND 60),
    CONSTRAINT events_organiser_name_length CHECK (char_length(organiser_name) BETWEEN 1 AND 30),
    CONSTRAINT events_duration_range CHECK (duration_min IS NULL OR duration_min BETWEEN 15 AND 1440),
    CONSTRAINT events_timezone_length CHECK (char_length(timezone) BETWEEN 1 AND 64),
    CONSTRAINT events_token_hash_format CHECK (organiser_token_hash ~ ${HASH})
  )`,
  event_days: `CREATE TABLE IF NOT EXISTS event_days (
    event_id text NOT NULL,
    date date NOT NULL,
    position integer NOT NULL,
    win_start integer NOT NULL,
    win_end integer NOT NULL,
    CONSTRAINT event_days_pkey PRIMARY KEY (event_id, date),
    CONSTRAINT event_days_event_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
    CONSTRAINT event_days_position_unique UNIQUE (event_id, position),
    CONSTRAINT event_days_position_range CHECK (position >= 0),
    CONSTRAINT event_days_window CHECK (win_start >= 0 AND win_start < 1440 AND win_end > win_start AND win_end - win_start <= 1440)
  )`,
  participants: `CREATE TABLE IF NOT EXISTS participants (
    id text NOT NULL,
    event_id text NOT NULL,
    display_name text NOT NULL,
    normalised_name text GENERATED ALWAYS AS (lower(btrim(regexp_replace(display_name, '\\s+', ' ', 'g')))) STORED,
    token_hash text NOT NULL,
    created_seq bigint GENERATED ALWAYS AS IDENTITY,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT participants_pkey PRIMARY KEY (id),
    CONSTRAINT participants_event_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
    CONSTRAINT participants_id_event_unique UNIQUE (id, event_id),
    CONSTRAINT participants_name_unique UNIQUE (event_id, normalised_name),
    CONSTRAINT participants_created_seq_unique UNIQUE (created_seq),
    CONSTRAINT participants_id_format CHECK (id ~ ${ID}),
    CONSTRAINT participants_display_name_length CHECK (char_length(btrim(regexp_replace(display_name, '\\s+', ' ', 'g'))) BETWEEN 1 AND 30),
    CONSTRAINT participants_token_hash_format CHECK (token_hash ~ ${HASH})
  )`,
  ranges: `CREATE TABLE IF NOT EXISTS ranges (
    id bigint GENERATED ALWAYS AS IDENTITY,
    participant_id text NOT NULL,
    event_id text NOT NULL,
    date date NOT NULL,
    kind text NOT NULL,
    start_min integer NOT NULL,
    end_min integer NOT NULL,
    CONSTRAINT ranges_pkey PRIMARY KEY (id),
    CONSTRAINT ranges_participant_fk FOREIGN KEY (participant_id, event_id) REFERENCES participants (id, event_id) ON DELETE CASCADE,
    CONSTRAINT ranges_day_fk FOREIGN KEY (event_id, date) REFERENCES event_days (event_id, date) ON DELETE CASCADE,
    CONSTRAINT ranges_kind CHECK (kind IN ('available', 'favourite')),
    CONSTRAINT ranges_minutes CHECK (start_min >= 0 AND end_min > start_min AND end_min <= 2880)
  )`,
  day_willingness: `CREATE TABLE IF NOT EXISTS day_willingness (
    participant_id text NOT NULL,
    event_id text NOT NULL,
    date date NOT NULL,
    value text NOT NULL,
    CONSTRAINT day_willingness_pkey PRIMARY KEY (participant_id, date),
    CONSTRAINT day_willingness_participant_fk FOREIGN KEY (participant_id, event_id) REFERENCES participants (id, event_id) ON DELETE CASCADE,
    CONSTRAINT day_willingness_day_fk FOREIGN KEY (event_id, date) REFERENCES event_days (event_id, date) ON DELETE CASCADE,
    CONSTRAINT day_willingness_value CHECK (value IN ('yes', 'if', 'no'))
  )`,
  conditions: `CREATE TABLE IF NOT EXISTS conditions (
    id bigint GENERATED ALWAYS AS IDENTITY,
    participant_id text NOT NULL,
    event_id text NOT NULL,
    date date NOT NULL,
    type text NOT NULL,
    payload jsonb NOT NULL,
    readback text NOT NULL,
    source text NOT NULL,
    CONSTRAINT conditions_pkey PRIMARY KEY (id),
    CONSTRAINT conditions_participant_fk FOREIGN KEY (participant_id, event_id) REFERENCES participants (id, event_id) ON DELETE CASCADE,
    CONSTRAINT conditions_day_fk FOREIGN KEY (event_id, date) REFERENCES event_days (event_id, date) ON DELETE CASCADE,
    CONSTRAINT conditions_type CHECK (type IN ('requires', 'requires_any', 'min_attendees', 'time', 'unresolvable')),
    CONSTRAINT conditions_payload_type CHECK (jsonb_typeof(payload) = 'object' AND payload->>'type' = type),
    CONSTRAINT conditions_payload_shape CHECK (CASE type
      WHEN 'requires' THEN ${PEOPLE_OK}
      WHEN 'requires_any' THEN ${PEOPLE_OK}
      WHEN 'min_attendees' THEN CASE WHEN jsonb_typeof(payload->'n') = 'number'
        THEN (payload->>'n')::numeric >= 1 AND (payload->>'n')::numeric = trunc((payload->>'n')::numeric) ELSE false END
      WHEN 'time' THEN (payload ? 'earliest_start' OR payload ? 'latest_end') AND ${MINUTES_OK('earliest_start')} AND ${MINUTES_OK('latest_end')}
      WHEN 'unresolvable' THEN CASE WHEN jsonb_typeof(payload->'summary') = 'string'
        THEN char_length(btrim(payload->>'summary')) > 0 ELSE false END
      ELSE false END),
    CONSTRAINT conditions_readback_length CHECK (char_length(btrim(readback)) BETWEEN 1 AND 500),
    CONSTRAINT conditions_source CHECK (source IN ('llm', 'fallback'))
  )`,
  proposals: `CREATE TABLE IF NOT EXISTS proposals (
    id text NOT NULL,
    event_id text NOT NULL,
    date date NOT NULL,
    start_min integer NOT NULL,
    end_min integer NOT NULL,
    deadline date,
    min_attendees integer NOT NULL,
    status text NOT NULL DEFAULT 'open',
    confirmed_count integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz,
    CONSTRAINT proposals_pkey PRIMARY KEY (id),
    CONSTRAINT proposals_id_event_unique UNIQUE (id, event_id),
    CONSTRAINT proposals_event_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
    CONSTRAINT proposals_day_fk FOREIGN KEY (event_id, date) REFERENCES event_days (event_id, date) ON DELETE CASCADE,
    CONSTRAINT proposals_id_format CHECK (id ~ ${ID}),
    CONSTRAINT proposals_minutes CHECK (start_min >= 0 AND end_min > start_min AND end_min <= 2880),
    CONSTRAINT proposals_min_attendees CHECK (min_attendees >= 2),
    CONSTRAINT proposals_status CHECK (status IN ('open', 'confirmed', 'failed'))
  )`,
  proposal_votes: `CREATE TABLE IF NOT EXISTS proposal_votes (
    proposal_id text NOT NULL,
    participant_id text NOT NULL,
    event_id text NOT NULL,
    vote text NOT NULL,
    voted_at timestamptz NOT NULL DEFAULT now(),
    confirmed boolean,
    CONSTRAINT proposal_votes_pkey PRIMARY KEY (proposal_id, participant_id),
    CONSTRAINT proposal_votes_proposal_fk FOREIGN KEY (proposal_id, event_id) REFERENCES proposals (id, event_id) ON DELETE CASCADE,
    CONSTRAINT proposal_votes_participant_fk FOREIGN KEY (participant_id, event_id) REFERENCES participants (id, event_id) ON DELETE CASCADE,
    CONSTRAINT proposal_votes_vote CHECK (vote IN ('in', 'out'))
  )`,
};

const INDEXES: Record<string, { table: string; columns: string }> = {
  ranges_participant_idx: { table: 'ranges', columns: 'participant_id, event_id, date' },
  ranges_day_idx: { table: 'ranges', columns: 'event_id, date' },
  day_willingness_participant_idx: { table: 'day_willingness', columns: 'participant_id, event_id' },
  day_willingness_day_idx: { table: 'day_willingness', columns: 'event_id, date' },
  conditions_participant_idx: { table: 'conditions', columns: 'participant_id, event_id, date' },
  conditions_day_idx: { table: 'conditions', columns: 'event_id, date' },
  proposals_event_idx: { table: 'proposals', columns: 'event_id' },
  proposal_votes_participant_idx: { table: 'proposal_votes', columns: 'participant_id, event_id' },
};

/** One open proposal per event. Partial, so it sits outside the drift-checked INDEXES map. */
const ONE_OPEN_PROPOSAL = `CREATE UNIQUE INDEX IF NOT EXISTS proposals_one_open_idx ON proposals (event_id) WHERE status = 'open'`;

type Col = [type: string, nullable: boolean, extra?: 'generated' | 'identity'];

/** What setup expects to find; anything incompatible is reported, never altered. */
const EXPECTED: Record<string, { columns: Record<string, Col>; constraints: string[] }> = {
  schema_migrations: {
    columns: { version: ['integer', false], applied_at: ['timestamp with time zone', false] },
    constraints: ['schema_migrations_pkey'],
  },
  events: {
    columns: {
      id: ['text', false], title: ['text', false], organiser_name: ['text', false], duration_min: ['integer', true],
      timezone: ['text', false], organiser_token_hash: ['text', false], created_at: ['timestamp with time zone', false],
    },
    constraints: ['events_pkey', 'events_id_format', 'events_title_length', 'events_organiser_name_length',
      'events_duration_range', 'events_timezone_length', 'events_token_hash_format'],
  },
  event_days: {
    columns: { event_id: ['text', false], date: ['date', false], position: ['integer', false], win_start: ['integer', false], win_end: ['integer', false] },
    constraints: ['event_days_pkey', 'event_days_event_fk', 'event_days_position_unique', 'event_days_position_range', 'event_days_window'],
  },
  participants: {
    columns: {
      id: ['text', false], event_id: ['text', false], display_name: ['text', false], normalised_name: ['text', true, 'generated'],
      token_hash: ['text', false], created_seq: ['bigint', false, 'identity'], created_at: ['timestamp with time zone', false],
    },
    constraints: ['participants_pkey', 'participants_event_fk', 'participants_id_event_unique', 'participants_name_unique',
      'participants_created_seq_unique', 'participants_id_format', 'participants_display_name_length', 'participants_token_hash_format'],
  },
  ranges: {
    columns: {
      id: ['bigint', false, 'identity'], participant_id: ['text', false], event_id: ['text', false], date: ['date', false],
      kind: ['text', false], start_min: ['integer', false], end_min: ['integer', false],
    },
    constraints: ['ranges_pkey', 'ranges_participant_fk', 'ranges_day_fk', 'ranges_kind', 'ranges_minutes'],
  },
  day_willingness: {
    columns: { participant_id: ['text', false], event_id: ['text', false], date: ['date', false], value: ['text', false] },
    constraints: ['day_willingness_pkey', 'day_willingness_participant_fk', 'day_willingness_day_fk', 'day_willingness_value'],
  },
  conditions: {
    columns: {
      id: ['bigint', false, 'identity'], participant_id: ['text', false], event_id: ['text', false], date: ['date', false],
      type: ['text', false], payload: ['jsonb', false], readback: ['text', false], source: ['text', false],
    },
    constraints: ['conditions_pkey', 'conditions_participant_fk', 'conditions_day_fk', 'conditions_type', 'conditions_payload_type',
      'conditions_payload_shape', 'conditions_readback_length', 'conditions_source'],
  },
  proposals: {
    columns: {
      id: ['text', false], event_id: ['text', false], date: ['date', false], start_min: ['integer', false], end_min: ['integer', false],
      deadline: ['date', true], min_attendees: ['integer', false], status: ['text', false], confirmed_count: ['integer', true],
      created_at: ['timestamp with time zone', false], closed_at: ['timestamp with time zone', true],
    },
    constraints: ['proposals_pkey', 'proposals_id_event_unique', 'proposals_event_fk', 'proposals_day_fk', 'proposals_id_format',
      'proposals_minutes', 'proposals_min_attendees', 'proposals_status'],
  },
  proposal_votes: {
    columns: {
      proposal_id: ['text', false], participant_id: ['text', false], event_id: ['text', false], vote: ['text', false],
      voted_at: ['timestamp with time zone', false], confirmed: ['boolean', true],
    },
    constraints: ['proposal_votes_pkey', 'proposal_votes_proposal_fk', 'proposal_votes_participant_fk', 'proposal_votes_vote'],
  },
};

export class SchemaDriftError extends Error {
  /** `changed` is false when the drift was found before setup ran, so nothing was written. */
  constructor(readonly problems: string[], readonly changed: boolean) {
    super(`Database schema is incompatible:\n- ${problems.join('\n- ')}`);
    this.name = 'SchemaDriftError';
  }
}

async function existingTables(db: Db): Promise<Set<string>> {
  const rows = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [Object.keys(EXPECTED)],
  );
  return new Set(rows.map((r) => r.table_name));
}

/** Differences between the database and the expected schema, for the tables that exist (or all, if `requireAll`). */
export async function schemaProblems(db: Db, requireAll: boolean): Promise<string[]> {
  const present = await existingTables(db);
  const names = Object.keys(EXPECTED);
  const cols = await db.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string; is_generated: string; is_identity: string; column_default: string | null }>(
    `SELECT table_name, column_name, data_type, is_nullable, is_generated, is_identity, column_default
       FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [names],
  );
  const cons = await db.query<{ table_name: string; conname: string }>(
    `SELECT c.relname AS table_name, k.conname FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
      WHERE c.relnamespace = current_schema()::regnamespace AND c.relname = ANY($1::text[])`,
    [names],
  );
  const idx = await db.query<{ tablename: string; indexname: string; indexdef: string }>(
    `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ANY($1::text[])`,
    [Object.keys(INDEXES)],
  );

  const problems: string[] = [];
  for (const table of names) {
    if (!present.has(table)) {
      if (requireAll) problems.push(`table ${table} is missing`);
      continue;
    }
    const spec = EXPECTED[table]!;
    const actual = new Map(cols.filter((c) => c.table_name === table).map((c) => [c.column_name, c]));
    for (const [name, [type, nullable, extra]] of Object.entries(spec.columns)) {
      const c = actual.get(name);
      if (!c) { problems.push(`${table}.${name} is missing`); continue; }
      if (c.data_type !== type) problems.push(`${table}.${name} is ${c.data_type}, expected ${type}`);
      if ((c.is_nullable === 'YES') !== nullable) problems.push(`${table}.${name} nullability differs`);
      if ((extra === 'generated') !== (c.is_generated === 'ALWAYS')) problems.push(`${table}.${name} generated column differs`);
      if ((extra === 'identity') !== (c.is_identity === 'YES')) problems.push(`${table}.${name} identity column differs`);
    }
    for (const c of actual.values()) {
      if (!(c.column_name in spec.columns) && c.is_nullable === 'NO' && c.column_default === null && c.is_identity !== 'YES' && c.is_generated !== 'ALWAYS') {
        problems.push(`${table}.${c.column_name} is an unexpected required column`);
      }
    }
    const have = new Set(cons.filter((k) => k.table_name === table).map((k) => k.conname));
    for (const name of spec.constraints) if (!have.has(name)) problems.push(`${table} constraint ${name} is missing`);
  }
  for (const [name, { table, columns }] of Object.entries(INDEXES)) {
    const found = idx.find((i) => i.indexname === name);
    if (!found) {
      if (requireAll) problems.push(`index ${name} is missing`);
      continue;
    }
    if (found.tablename !== table || !found.indexdef.endsWith(`(${columns})`)) problems.push(`index ${name} has a different definition`);
  }
  return problems;
}

const DURATION_V2 = `events_duration_range CHECK (duration_min IS NULL OR duration_min BETWEEN 15 AND 1440)`;

/** Version 2 made the event length optional. An existing version-1 events table is relaxed in place; nothing else changes. */
async function upgradeDurationColumn(db: Db): Promise<void> {
  const [col] = await db.query<{ is_nullable: string }>(
    `SELECT is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'events' AND column_name = 'duration_min'`,
  );
  if (!col || col.is_nullable === 'YES') return;
  await db.transaction([
    { text: 'SELECT pg_advisory_xact_lock($1::bigint)', params: [LOCK_KEY] },
    { text: 'ALTER TABLE events ALTER COLUMN duration_min DROP NOT NULL', params: [] },
    { text: 'ALTER TABLE events DROP CONSTRAINT IF EXISTS events_duration_range', params: [] },
    { text: `ALTER TABLE events ADD CONSTRAINT ${DURATION_V2}`, params: [] },
  ]);
}

function setupStatements(): Statement[] {
  return [
    { text: 'SELECT pg_advisory_xact_lock($1::bigint)', params: [LOCK_KEY] },
    ...Object.values(TABLES).map((text) => ({ text, params: [] })),
    ...Object.entries(INDEXES).map(([name, { table, columns }]) => ({ text: `CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${columns})`, params: [] })),
    { text: ONE_OPEN_PROPOSAL, params: [] },
    { text: 'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING', params: [SCHEMA_VERSION] },
  ];
}

/**
 * Creates whatever is missing and records the schema version. Existing tables and rows are never altered or
 * dropped: if an existing table doesn't match, nothing is changed and SchemaDriftError lists the differences.
 */
export async function setupSchema(db: Db): Promise<{ created: string[]; version: number }> {
  await upgradeDurationColumn(db);
  const before = await schemaProblems(db, false);
  if (before.length) throw new SchemaDriftError(before, false);
  const had = await existingTables(db);
  await db.transaction(setupStatements());
  const after = await schemaProblems(db, true);
  if (after.length) throw new SchemaDriftError(after, true);
  const versions = await db.query<{ version: number }>('SELECT max(version) AS version FROM schema_migrations');
  return { created: Object.keys(EXPECTED).filter((t) => !had.has(t)), version: Number(versions[0]?.version ?? 0) };
}
