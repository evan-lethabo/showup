import { afterEach, describe, expect, it } from 'vitest';
import { createEvent } from '../events';
import { SchemaDriftError, schemaProblems, setupSchema } from '../schema';
import { testDb, type TestDb } from './pglite';

const input = { title: 'Dinner', organiserName: 'Alex', timezone: 'Australia/Sydney', durationMin: 120, days: [{ date: '2030-01-04', start: 1080, end: 1380 }] };

let t: TestDb | null = null;
afterEach(async () => { await t?.close(); t = null; });

describe('schema setup', () => {
  it('creates every table on an empty database and reports none missing', async () => {
    t = await testDb(false);
    const res = await setupSchema(t.db);
    expect(res.created.sort()).toEqual(['conditions', 'day_willingness', 'event_days', 'events', 'participants', 'proposal_votes', 'proposals', 'ranges', 'schema_migrations']);
    expect(res.version).toBe(2);
    expect(await schemaProblems(t.db, true)).toEqual([]);
  }, 15000);

  it('is repeatable and keeps existing rows', async () => {
    t = await testDb();
    const { id } = await createEvent(t.db, input);
    const again = await setupSchema(t.db);
    expect(again.created).toEqual([]);
    expect(await t.db.query('SELECT id FROM events')).toEqual([{ id }]);
    expect((await t.db.query('SELECT count(*)::int AS n FROM event_days'))[0]).toEqual({ n: 1 });
    expect((await t.db.query('SELECT count(*)::int AS n FROM schema_migrations'))[0]).toEqual({ n: 1 });
  });

  it('relaxes a version-1 events table so the event length can be empty, keeping its rows', async () => {
    t = await testDb();
    const { id } = await createEvent(t.db, input);
    await t.pg.exec(`UPDATE events SET duration_min = 120; ALTER TABLE events ALTER COLUMN duration_min SET NOT NULL;
      ALTER TABLE events DROP CONSTRAINT events_duration_range;
      ALTER TABLE events ADD CONSTRAINT events_duration_range CHECK (duration_min BETWEEN 15 AND 1440)`);
    await setupSchema(t.db);
    expect(await schemaProblems(t.db, true)).toEqual([]);
    await t.db.query('UPDATE events SET duration_min = NULL WHERE id = $1', [id]);
    expect(await t.db.query('SELECT duration_min FROM events WHERE id = $1', [id])).toEqual([{ duration_min: null }]);
    await expect(t.db.query('UPDATE events SET duration_min = 5 WHERE id = $1', [id])).rejects.toMatchObject({ constraint: 'events_duration_range' });
  });

  it('refuses to run over an incompatible existing table and changes nothing', async () => {
    t = await testDb(false);
    await t.pg.exec(`CREATE TABLE events (id integer PRIMARY KEY, title text)`);
    await t.pg.exec(`INSERT INTO events VALUES (1, 'kept')`);
    const err = await setupSchema(t.db).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SchemaDriftError);
    expect((err as SchemaDriftError).changed).toBe(false);
    expect((err as SchemaDriftError).problems).toContain('events.id is integer, expected text');
    expect((err as SchemaDriftError).problems).toContain('events.organiser_token_hash is missing');
    const tables = await t.db.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    expect(tables.map((r) => r.table_name)).toEqual(['events']);
    expect(await t.db.query('SELECT * FROM events')).toEqual([{ id: 1, title: 'kept' }]);
  });

  it('reports a missing constraint on an otherwise matching table', async () => {
    t = await testDb();
    await t.pg.exec('ALTER TABLE participants DROP CONSTRAINT participants_name_unique');
    const err = await setupSchema(t.db).catch((e: unknown) => e);
    expect((err as SchemaDriftError).problems).toEqual(['participants constraint participants_name_unique is missing']);
  });
});
