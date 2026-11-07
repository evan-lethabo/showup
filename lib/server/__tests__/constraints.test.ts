// Database-level rules that hold whatever code writes the rows (B3–B5 build on these).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, newId, newToken } from '../credentials';
import { createEvent } from '../events';
import { rejection, testDb, type TestDb } from './pglite';

let t: TestDb;
let ev: string;
let other: string;
beforeAll(async () => {
  t = await testDb();
  const base = { organiserName: 'Alex', timezone: 'Europe/London', durationMin: 120 };
  ev = (
    await createEvent(t.db, {
      ...base,
      title: 'A',
      days: [
        { date: '2030-03-01', start: 1080, end: 1500 },
        { date: '2030-03-02', start: 1080, end: 1380 },
      ],
    })
  ).id;
  other = (await createEvent(t.db, { ...base, title: 'B', days: [{ date: '2030-03-01', start: 1080, end: 1380 }] })).id;
});
afterAll(async () => {
  await t.close();
});

function addParticipant(eventId: string, name: string) {
  const id = newId();
  return t.db
    .query('INSERT INTO participants (id, event_id, display_name, token_hash) VALUES ($1, $2, $3, $4) RETURNING id', [
      id,
      eventId,
      name,
      hashToken(newToken()),
    ])
    .then(() => id);
}

describe('participant names', () => {
  it('refuses a second "Sam" in the same event, ignoring case and spacing', async () => {
    await addParticipant(ev, 'Sam');
    for (const dup of ['sam', ' SAM ', 'Sam\t']) {
      expect(await rejection(addParticipant(ev, dup))).toEqual({ code: '23505', constraint: 'participants_name_unique' });
    }
    await addParticipant(ev, 'Mary  Jane');
    expect(await rejection(addParticipant(ev, 'mary jane'))).toEqual({ code: '23505', constraint: 'participants_name_unique' });
  });

  it('allows the same name in different events and distinct names in one event', async () => {
    await addParticipant(other, 'Sam');
    await addParticipant(ev, 'Sami');
  });

  it('stores the normalised name the database computed', async () => {
    const id = await addParticipant(ev, '  Ana   Lee ');
    expect(await t.db.query('SELECT normalised_name FROM participants WHERE id = $1', [id])).toEqual([{ normalised_name: 'ana lee' }]);
  });

  it('gives participants a strictly increasing creation order', async () => {
    const ids = [await addParticipant(ev, 'P1'), await addParticipant(ev, 'P2'), await addParticipant(ev, 'P3')];
    const rows = await t.db.query<{ id: string }>('SELECT id FROM participants WHERE id = ANY($1::text[]) ORDER BY created_seq', [ids]);
    expect(rows.map((r) => r.id)).toEqual(ids);
  });

  it('rejects blank names and plaintext tokens', async () => {
    expect((await rejection(addParticipant(ev, '   '))).constraint).toBe('participants_display_name_length');
    expect((await rejection(addParticipant(ev, '\t\n'))).constraint).toBe('participants_display_name_length');
    const bad = t.db.query('INSERT INTO participants (id, event_id, display_name, token_hash) VALUES ($1, $2, $3, $4)', [
      newId(),
      ev,
      'Tok',
      newToken(),
    ]);
    expect((await rejection(bad)).constraint).toBe('participants_token_hash_format');
  });
});

describe('ranges, willingness and conditions', () => {
  let p: string;
  beforeAll(async () => {
    p = await addParticipant(ev, 'Cleo');
  });

  const range = (kind: string, s: number, e: number, date = '2030-03-01', eventId = ev, pid = p) =>
    t.db.query('INSERT INTO ranges (participant_id, event_id, date, kind, start_min, end_min) VALUES ($1, $2, $3, $4, $5, $6)', [
      pid,
      eventId,
      date,
      kind,
      s,
      e,
    ]);

  it('stores ranges as linear minutes, including past midnight', async () => {
    await range('available', 1320, 1500);
    await range('favourite', 1380, 1440);
    expect((await rejection(range('maybe', 1100, 1200))).constraint).toBe('ranges_kind');
    expect((await rejection(range('available', 1200, 1200))).constraint).toBe('ranges_minutes');
    expect((await rejection(range('available', 1200, 2900))).constraint).toBe('ranges_minutes');
  });

  it("only accepts ranges on the participant's own event and its candidate days", async () => {
    expect((await rejection(range('available', 1100, 1200, '2030-03-09'))).constraint).toBe('ranges_day_fk');
    expect((await rejection(range('available', 1100, 1200, '2030-03-01', other))).constraint).toBe('ranges_participant_fk');
  });

  it('keeps one willingness per participant and day', async () => {
    const will = (v: string, date = '2030-03-01') =>
      t.db.query('INSERT INTO day_willingness (participant_id, event_id, date, value) VALUES ($1, $2, $3, $4)', [p, ev, date, v]);
    await will('if');
    await will('no', '2030-03-02');
    expect((await rejection(will('yes'))).constraint).toBe('day_willingness_pkey');
    expect((await rejection(will('maybe', '2030-03-01'))).code).toMatch(/^23/);
  });

  const cond = (payload: object, source = 'llm', readback = 'You will come if Sam comes.') =>
    t.db.query(
      'INSERT INTO conditions (participant_id, event_id, date, type, payload, readback, source) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [p, ev, '2030-03-01', (payload as { type?: string }).type ?? 'requires', JSON.stringify(payload), readback, source],
    );

  it('accepts every canonical condition type, referring to people by id', async () => {
    const sam = newId();
    await cond({ type: 'requires', people: [sam] });
    await cond({ type: 'requires_any', people: [sam, newId()] }, 'fallback');
    await cond({ type: 'min_attendees', n: 7 });
    await cond({ type: 'time', latest_end: 1320 });
    await cond({ type: 'time', earliest_start: 1200, latest_end: 1500 });
    await cond({ type: 'unresolvable', summary: 'depends on the weather' });
    const stored = await t.db.query<{ payload: unknown }>('SELECT payload FROM conditions WHERE participant_id = $1 ORDER BY id', [p]);
    expect(stored[0]!.payload).toEqual({ type: 'requires', people: [sam] });
  });

  it('rejects malformed payloads, unknown types and sources, and empty read-backs', async () => {
    const shape = 'conditions_payload_shape';
    expect((await rejection(cond({ type: 'requires', people: [] }))).constraint).toBe(shape);
    expect((await rejection(cond({ type: 'requires', people: [3] }))).constraint).toBe(shape);
    expect((await rejection(cond({ type: 'requires_any', people: 'Sam' }))).constraint).toBe(shape);
    expect((await rejection(cond({ type: 'min_attendees', n: 0 }))).constraint).toBe(shape);
    expect((await rejection(cond({ type: 'min_attendees', n: 2.5 }))).constraint).toBe(shape);
    expect((await rejection(cond({ type: 'min_attendees', n: '7' }))).constraint).toBe(shape);
    expect((await rejection(cond({ type: 'time' }))).constraint).toBe(shape);
    expect((await rejection(cond({ type: 'time', latest_end: '10pm' }))).constraint).toBe(shape);
    expect((await rejection(cond({ type: 'unresolvable', summary: '  ' }))).constraint).toBe(shape);
    expect((await rejection(cond({ type: 'person', name: 'Sam' }))).code).toBe('23514');
    expect(await rejection(cond({ type: 'requires', people: ['x'] }, 'regex'))).toMatchObject({ constraint: 'conditions_source' });
    expect(await rejection(cond({ type: 'requires', people: ['x'] }, 'llm', ' '))).toMatchObject({
      constraint: 'conditions_readback_length',
    });
  });

  it('has no column for raw condition text', async () => {
    const cols = await t.db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'conditions' ORDER BY ordinal_position`,
    );
    expect(cols.map((c) => c.column_name)).toEqual(['id', 'participant_id', 'event_id', 'date', 'type', 'payload', 'readback', 'source']);
  });
});
