import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../credentials';
import { createEvent } from '../events';
import {
  authenticateGuest,
  joinEvent,
  loadEngineResponses,
  loadOwnResponse,
  pendingRef,
  resolveRefs,
  saveResponse,
  toEngineResponses,
  type ParticipantRow,
} from '../responses';
import { testDb, type TestDb } from './pglite';

const eventInput = {
  title: 'Dinner',
  organiserName: 'Alex',
  timezone: 'Australia/Sydney',
  durationMin: 120,
  days: [
    { date: '2030-06-01', start: 1080, end: 1380 },
    { date: '2030-06-02', start: 1080, end: 1380 },
  ],
};

let t: TestDb;
let eventId: string;

beforeAll(async () => {
  t = await testDb();
  eventId = (await createEvent(t.db, eventInput)).id;
});
afterAll(async () => {
  await t.close();
});

describe('guest join', () => {
  it('creates a participant and returns a credential once', async () => {
    const j = await joinEvent(t.db, eventId, 'Jess');
    expect(j.status).toBe('ok');
    if (j.status !== 'ok') return;
    expect(j.credential).toMatch(/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/);
    const row = await t.db.query<{ token_hash: string }>('SELECT token_hash FROM participants WHERE id = $1', [j.participant.id]);
    const secret = j.credential.split('.')[1]!;
    expect(row[0]!.token_hash).toBe(hashToken(secret));
    expect(row[0]!.token_hash).not.toBe(secret);
  });

  it('rejects duplicate names', async () => {
    await joinEvent(t.db, eventId, 'Sam');
    expect((await joinEvent(t.db, eventId, ' sam ')).status).toBe('name_taken');
  });

  it('rejects invalid tokens for reads and writes', async () => {
    const j = await joinEvent(t.db, eventId, 'Pat');
    if (j.status !== 'ok') throw new Error('join failed');
    expect((await authenticateGuest(t.db, eventId, 'bad')).status).toBe('unauthorised');
    expect((await authenticateGuest(t.db, eventId, j.credential.slice(0, -1) + 'x')).status).toBe('unauthorised');
  });
});

describe('saving responses', () => {
  it('persists availability, favourites, willingness and fallback conditions', async () => {
    const finn = await joinEvent(t.db, eventId, 'Finn');
    if (finn.status !== 'ok') throw new Error('join');
    const auth = await authenticateGuest(t.db, eventId, finn.credential);
    if (auth.status !== 'ok') throw new Error('auth');
    const me = auth.participant;
    const body = {
      days: [
        {
          date: '2030-06-01',
          willingness: 'if',
          available: [{ start: 1140, end: 1320 }],
          favourite: [{ start: 1140, end: 1320 }],
          conditions: [{ type: 'requires', source: 'fallback', people: [{ name: 'Ella' }] }],
        },
      ],
    };
    const saved = await saveResponse(t.db, eventId, me, body);
    expect(saved.status).toBe('ok');
    const own = await loadOwnResponse(t.db, eventId, me);
    expect(own.days[0]).toMatchObject({ willingness: 'if', available: [{ start: 1140, end: 1320 }] });
    expect(own.days[0]!.conditions[0]?.readback).toContain('Ella');
    const stored = await t.db.query<{ payload: { people: string[] } }>('SELECT payload FROM conditions WHERE participant_id = $1', [me.id]);
    expect(stored[0]!.payload.people).toEqual([pendingRef('ella')]);
  });

  it('rejects If… without a confirmed condition', async () => {
    const j = await joinEvent(t.db, eventId, 'Grace');
    if (j.status !== 'ok') throw new Error('join');
    const auth = await authenticateGuest(t.db, eventId, j.credential);
    if (auth.status !== 'ok') throw new Error('auth');
    const me = auth.participant;
    expect(
      (
        await saveResponse(t.db, eventId, me, {
          days: [{ date: '2030-06-01', willingness: 'if', available: [{ start: 1140, end: 1320 }], favourite: [], conditions: [] }],
        })
      ).status,
    ).toBe('invalid');
  });

  it('replaces a previous response without duplicate rows', async () => {
    const j = await joinEvent(t.db, eventId, 'Harry');
    if (j.status !== 'ok') throw new Error('join');
    const auth = await authenticateGuest(t.db, eventId, j.credential);
    if (auth.status !== 'ok') throw new Error('auth');
    const me = auth.participant;
    await saveResponse(t.db, eventId, me, {
      days: [{ date: '2030-06-01', willingness: 'yes', available: [{ start: 1140, end: 1320 }], favourite: [], conditions: [] }],
    });
    await saveResponse(t.db, eventId, me, {
      days: [{ date: '2030-06-02', willingness: 'no', available: [], favourite: [], conditions: [] }],
    });
    expect(await t.db.query('SELECT count(*)::int AS n FROM day_willingness WHERE participant_id = $1', [me.id])).toEqual([{ n: 1 }]);
    expect(await t.db.query('SELECT count(*)::int AS n FROM ranges WHERE participant_id = $1', [me.id])).toEqual([{ n: 0 }]);
  });

  it('rejects ranges outside the day window', async () => {
    const j = await joinEvent(t.db, eventId, 'Ivy');
    if (j.status !== 'ok') throw new Error('join');
    const auth = await authenticateGuest(t.db, eventId, j.credential);
    if (auth.status !== 'ok') throw new Error('auth');
    const me = auth.participant;
    const bad = {
      days: [{ date: '2030-06-01', willingness: 'yes', available: [{ start: 900, end: 1100 }], favourite: [], conditions: [] }],
    };
    expect((await saveResponse(t.db, eventId, me, bad)).status).toBe('invalid');
  });
});

describe('pending names and engine resolution', () => {
  it('resolves a pending name when Ella joins', async () => {
    const people: ParticipantRow[] = [{ id: 'AAAAAAAAAAAAAAAA', displayName: 'Finn', normalisedName: 'finn' }];
    expect(resolveRefs([pendingRef('ella')], people)).toEqual([pendingRef('ella')]);
    people.push({ id: 'BBBBBBBBBBBBBBBB', displayName: 'Ella', normalisedName: 'ella' });
    expect(resolveRefs([pendingRef('ella')], people)).toEqual(['BBBBBBBBBBBBBBBB']);
  });

  it('feeds the engine stable ids only', async () => {
    const engine = await loadEngineResponses(t.db, eventId);
    expect(engine.every((r) => r.id.length === 16)).toBe(true);
    const withPending = toEngineResponses([{ id: 'AAAAAAAAAAAAAAAA', displayName: 'Finn', normalisedName: 'finn' }], {
      will: [{ participant_id: 'AAAAAAAAAAAAAAAA', date: '2030-06-01', value: 'if' }],
      ranges: [{ participant_id: 'AAAAAAAAAAAAAAAA', date: '2030-06-01', kind: 'available', start_min: 1140, end_min: 1320 }],
      conds: [
        {
          participant_id: 'AAAAAAAAAAAAAAAA',
          date: '2030-06-01',
          type: 'requires',
          payload: { type: 'requires', people: [pendingRef('ella')] },
          readback: 'x',
          source: 'fallback',
        },
      ],
    });
    expect(withPending[0]!.conds.d20300601![0]).toEqual({ type: 'requires', people: [pendingRef('ella')] });
  });
});
