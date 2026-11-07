import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEvent } from '../events';
import { handleGetOwnResponse, handleSaveResponse } from '../http';
import { logDbError } from '../db';
import { authenticateGuest, joinEvent, loadOwnResponse, saveResponse } from '../responses';
import { testDb, type TestDb } from './pglite';

const day = { date: '2030-08-01', start: 1080, end: 1380 };
const base = { title: 'Sec', organiserName: 'Org', timezone: 'Australia/Sydney', durationMin: 120, days: [day] };

let t: TestDb;
let eventId: string;
let eventB: string;

beforeAll(async () => {
  t = await testDb();
  eventId = (await createEvent(t.db, base)).id;
  eventB = (await createEvent(t.db, { ...base, title: 'Sec B' })).id;
});
afterAll(async () => {
  await t.close();
});

function bearer(cred: string) {
  return { Authorization: `Bearer ${cred}` };
}

describe('guest credential isolation', () => {
  it("participant A's credential cannot read or overwrite participant B's response", async () => {
    const a = await joinEvent(t.db, eventId, 'Alpha');
    const b = await joinEvent(t.db, eventId, 'Beta');
    if (a.status !== 'ok' || b.status !== 'ok') throw new Error('join');
    const authB = await authenticateGuest(t.db, eventId, b.credential);
    if (authB.status !== 'ok') throw new Error('auth');
    await saveResponse(t.db, eventId, authB.participant, {
      days: [
        {
          date: day.date,
          willingness: 'if',
          available: [{ start: 1140, end: 1320 }],
          favourite: [],
          conditions: [{ type: 'requires', source: 'fallback', people: [{ name: 'Gamma' }] }],
        },
      ],
    });
    const secret = 'B_PRIVATE_READBACK_MARKER_X7';
    await t.db.query('UPDATE conditions SET readback = $1 WHERE participant_id = $2', [secret, authB.participant.id]);

    const authA = await authenticateGuest(t.db, eventId, a.credential);
    if (authA.status !== 'ok') throw new Error('auth');
    const ownA = await loadOwnResponse(t.db, eventId, authA.participant);
    expect(JSON.stringify(ownA)).not.toContain(secret);

    const getRes = await handleGetOwnResponse(eventId, new Request('http://x/response', { headers: bearer(a.credential) }), () => t.db);
    expect(getRes.status).toBe(200);
    expect(await getRes.text()).not.toContain(secret);

    await handleSaveResponse(
      eventId,
      new Request('http://x/response', {
        method: 'PUT',
        headers: { ...bearer(a.credential), 'content-type': 'application/json' },
        body: JSON.stringify({
          days: [{ date: day.date, willingness: 'yes', available: [{ start: 1140, end: 1320 }], favourite: [], conditions: [] }],
        }),
      }),
      () => t.db,
    );

    const stillB = await loadOwnResponse(t.db, eventId, authB.participant);
    expect(stillB.days[0]?.willingness).toBe('if');
    expect(stillB.days[0]?.conditions[0]?.readback).toBe(secret);
  });

  it('a credential for event A cannot authorise event B', async () => {
    const j = await joinEvent(t.db, eventId, 'Cross');
    if (j.status !== 'ok') throw new Error('join');
    expect((await authenticateGuest(t.db, eventB, j.credential)).status).toBe('unauthorised');
    expect((await handleGetOwnResponse(eventB, new Request('http://x', { headers: bearer(j.credential) }), () => t.db)).status).toBe(401);
  });
});

describe('self-reference on save', () => {
  it('rejects resolved participant id self-reference, including one-character names', async () => {
    const j = await joinEvent(t.db, eventId, 'A');
    if (j.status !== 'ok') throw new Error('join');
    const auth = await authenticateGuest(t.db, eventId, j.credential);
    if (auth.status !== 'ok') throw new Error('auth');
    const me = auth.participant;
    const byId = await saveResponse(t.db, eventId, me, {
      days: [
        {
          date: day.date,
          willingness: 'if',
          available: [{ start: 1140, end: 1320 }],
          favourite: [],
          conditions: [{ type: 'requires', source: 'fallback', people: [{ id: me.id }] }],
        },
      ],
    });
    expect(byId.status).toBe('invalid');
    const byName = await saveResponse(t.db, eventId, me, {
      days: [
        {
          date: day.date,
          willingness: 'if',
          available: [{ start: 1140, end: 1320 }],
          favourite: [],
          conditions: [{ type: 'requires', source: 'fallback', people: [{ name: 'A' }] }],
        },
      ],
    });
    expect(byName.status).toBe('invalid');
  });
});

describe('public event privacy', () => {
  it('GET /api/events/{id} exposes no private response fields after guests save', async () => {
    const { getPublicEvent } = await import('../events');
    const j = await joinEvent(t.db, eventId, 'Priv');
    if (j.status !== 'ok') throw new Error('join');
    const auth = await authenticateGuest(t.db, eventId, j.credential);
    if (auth.status !== 'ok') throw new Error('auth');
    await saveResponse(t.db, eventId, auth.participant, {
      days: [
        {
          date: day.date,
          willingness: 'if',
          available: [{ start: 1140, end: 1320 }],
          favourite: [{ start: 1140, end: 1320 }],
          conditions: [{ type: 'requires', source: 'fallback', people: [{ name: 'Zed' }] }],
        },
      ],
    });
    const pub = JSON.stringify(await getPublicEvent(t.db, eventId));
    expect(pub).not.toMatch(/1140|1320|"if"|requires|readback|token_hash|available|willingness/i);
    expect(pub).not.toContain(j.credential.split('.')[1]);
  });
});

describe('condition persistence hygiene', () => {
  it('never stores client-supplied read-back or raw condition text', async () => {
    const j = await joinEvent(t.db, eventId, 'Raw');
    if (j.status !== 'ok') throw new Error('join');
    const auth = await authenticateGuest(t.db, eventId, j.credential);
    if (auth.status !== 'ok') throw new Error('auth');
    await saveResponse(t.db, eventId, auth.participant, {
      days: [
        {
          date: day.date,
          willingness: 'if',
          available: [{ start: 1140, end: 1320 }],
          favourite: [],
          conditions: [
            {
              type: 'requires',
              source: 'fallback',
              people: [{ name: 'Sam' }],
              readback: 'INJECTED_RAW_TEXT_SHOULD_NOT_PERSIST',
              rawText: 'only if Sam goes and weather is fine',
            },
          ],
        },
      ],
    });
    const rows = await t.db.query<{ readback: string; payload: string }>(
      'SELECT readback, payload::text AS payload FROM conditions WHERE participant_id = $1',
      [auth.participant.id],
    );
    expect(rows[0]!.readback).not.toContain('INJECTED_RAW');
    expect(rows[0]!.payload).not.toContain('weather');
    expect(rows[0]!.payload).not.toContain('INJECTED');
  });

  it('logDbError does not log request bodies', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logDbError('save-response', Object.assign(new Error('body: {"raw":"secret condition text"}'), { code: 'XX000' }));
    expect(spy.mock.calls[0]?.[1]).toEqual({ name: 'Error', code: 'XX000' });
    spy.mockRestore();
  });
});
