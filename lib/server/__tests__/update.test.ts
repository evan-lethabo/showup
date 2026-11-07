import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEvent, getPublicEvent } from '../events';
import { handleGetResults, handleUpdateEvent } from '../http';
import { authenticateGuest, joinEvent, saveResponse } from '../responses';
import { testDb, type TestDb } from './pglite';

const NOW = new Date('2030-01-01T00:00:00Z');
const d1 = { date: '2030-08-01', start: 1080, end: 1380 };
const d2 = { date: '2030-08-02', start: 1080, end: 1380 };
const base = { title: 'Plans', organiserName: 'Org', timezone: 'Australia/Sydney', durationMin: 120, days: [d1, d2] };
const answer = {
  days: [d1, d2].map((d) => ({ date: d.date, willingness: 'yes', available: [{ start: 1140, end: 1320 }], favourite: [], conditions: [] })),
};

let t: TestDb;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

const patch = (id: string, body: unknown, cred?: string) =>
  handleUpdateEvent(
    id,
    new Request('http://x/api', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(cred ? { Authorization: `Bearer ${cred}` } : {}) },
      body: JSON.stringify(body),
    }),
    () => t.db,
    NOW,
  );

async function withGuest() {
  const { id, token } = await createEvent(t.db, base);
  const j = await joinEvent(t.db, id, 'Sam');
  if (j.status !== 'ok') throw new Error('join');
  const a = await authenticateGuest(t.db, id, j.credential);
  if (a.status !== 'ok') throw new Error('auth');
  await saveResponse(t.db, id, a.participant, answer);
  return { id, token };
}
const responded = async (id: string) => (await getPublicEvent(t.db, id))!.participants[0]!.responded;

describe('edit event (organiser)', () => {
  it('refuses anyone but the organiser', async () => {
    const { id } = await withGuest();
    expect((await patch(id, base)).status).toBe(403);
    expect((await patch(id, base, 'wrong')).status).toBe(403);
    expect((await patch('AAAAAAAAAAAAAAAA', base, 'x')).status).toBe(404);
  });

  it("a new title or name keeps everyone's answers", async () => {
    const { id, token } = await withGuest();
    const res = await patch(id, { ...base, title: 'Renamed', organiserName: 'Boss' }, token);
    expect(await res.json()).toEqual({ ok: true, scheduleChanged: false });
    expect(await getPublicEvent(t.db, id)).toMatchObject({ title: 'Renamed', organiserName: 'Boss' });
    expect(await responded(id)).toBe(true);
  });

  it('new days or times clear answers but keep guests joined, and change the results rev', async () => {
    const { id, token } = await withGuest();
    const revOf = async () => (await (await handleGetResults(id, new Request('http://x'), () => t.db)).json()).rev;
    const before = await revOf();
    const res = await patch(id, { ...base, days: [d1, { date: '2030-08-09', start: 600, end: 900 }] }, token);
    expect(await res.json()).toEqual({ ok: true, scheduleChanged: true });
    const ev = (await getPublicEvent(t.db, id))!;
    expect(ev.days.map((d) => d.date)).toEqual(['2030-08-01', '2030-08-09']);
    expect(ev.participants).toEqual([{ name: 'Sam', responded: false }]);
    expect(await revOf()).not.toBe(before);
  });

  it('lets the organiser set or remove the event length; either counts as a schedule change', async () => {
    const { id, token } = await withGuest();
    expect(await (await patch(id, { ...base, durationMin: null }, token)).json()).toEqual({ ok: true, scheduleChanged: true });
    expect((await getPublicEvent(t.db, id))!.durationMin).toBeNull();
    expect(await responded(id)).toBe(false);
    expect(await (await patch(id, { ...base, durationMin: null }, token)).json()).toEqual({ ok: true, scheduleChanged: false });
    expect(await (await patch(id, { ...base, durationMin: 90 }, token)).json()).toEqual({ ok: true, scheduleChanged: true });
    expect((await getPublicEvent(t.db, id))!.durationMin).toBe(90);
  });

  it('validates like create, but keeps the timezone and lets existing past days stay', async () => {
    const { id, token } = await withGuest();
    expect((await patch(id, { ...base, days: [] }, token)).status).toBe(400);
    expect((await patch(id, { ...base, days: [{ date: '2029-12-01', start: 600, end: 900 }] }, token)).status).toBe(400);
    expect((await patch(id, { ...base, title: ' ' }, token)).status).toBe(400);
    const late = new Date('2030-08-01T12:00:00Z');
    const res = await handleUpdateEvent(
      id,
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...base, timezone: 'UTC', title: 'Later' }),
      }),
      () => t.db,
      late,
    );
    expect(res.status).toBe(200);
    expect(await getPublicEvent(t.db, id)).toMatchObject({ title: 'Later', timezone: 'Australia/Sydney' });
  });
});
