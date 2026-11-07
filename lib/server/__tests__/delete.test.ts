import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEvent } from '../events';
import { handleDeleteEvent, handleGetResults, handleLeaveEvent } from '../http';
import { authenticateGuest, joinEvent, saveResponse } from '../responses';
import { testDb, type TestDb } from './pglite';

const day = { date: '2030-08-01', start: 1080, end: 1380 };
const base = { title: 'Del', organiserName: 'Org', timezone: 'Australia/Sydney', durationMin: 120, days: [day] };
const answer = { days: [{ date: day.date, willingness: 'yes', available: [{ start: 1140, end: 1320 }], favourite: [], conditions: [] }] };

let t: TestDb;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

const req = (cred?: string) => new Request('http://x/api', { method: 'DELETE', headers: cred ? { Authorization: `Bearer ${cred}` } : {} });
const count = async (table: string, eventId: string) =>
  Number((await t.db.query<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE event_id = $1`, [eventId]))[0]!.n);

async function guest(eventId: string, name: string) {
  const j = await joinEvent(t.db, eventId, name);
  if (j.status !== 'ok') throw new Error('join');
  const a = await authenticateGuest(t.db, eventId, j.credential);
  if (a.status !== 'ok') throw new Error('auth');
  await saveResponse(t.db, eventId, a.participant, answer);
  return j.credential;
}

describe('cancel event (organiser)', () => {
  it('deletes the event and everything under it', async () => {
    const { id, token } = await createEvent(t.db, base);
    await guest(id, 'Alpha');
    await guest(id, 'Beta');
    const res = await handleDeleteEvent(id, req(token), () => t.db);
    expect(res.status).toBe(200);
    expect(await count('events', id).catch(() => 0)).toBe(0);
    expect(await count('participants', id)).toBe(0);
    expect(await count('event_days', id)).toBe(0);
    expect((await handleGetResults(id, new Request('http://x'), () => t.db)).status).toBe(404);
  });

  it('refuses a guest credential, a wrong token and no token, and keeps the event', async () => {
    const { id } = await createEvent(t.db, base);
    const cred = await guest(id, 'Alpha');
    for (const c of [cred, 'nope', undefined]) {
      expect((await handleDeleteEvent(id, req(c), () => t.db)).status).toBe(403);
    }
    expect(await count('participants', id)).toBe(1);
  });

  it('404s for an unknown event', async () => {
    expect((await handleDeleteEvent('missing', req('x'), () => t.db)).status).toBe(404);
  });
});

describe('leave event (guest)', () => {
  it('removes only the leaver and their response; their credential then stops working', async () => {
    const { id } = await createEvent(t.db, base);
    const a = await guest(id, 'Alpha');
    await guest(id, 'Beta');
    expect((await handleLeaveEvent(id, req(a), () => t.db)).status).toBe(200);
    expect(await count('participants', id)).toBe(1);
    expect(await count('ranges', id)).toBe(1);
    expect((await handleLeaveEvent(id, req(a), () => t.db)).status).toBe(401);
  });

  it("rejects no credential and another event's credential", async () => {
    const e1 = (await createEvent(t.db, base)).id;
    const e2 = (await createEvent(t.db, base)).id;
    const c1 = await guest(e1, 'Alpha');
    expect((await handleLeaveEvent(e1, req(), () => t.db)).status).toBe(401);
    expect((await handleLeaveEvent(e2, req(c1), () => t.db)).status).toBe(401);
    expect(await count('participants', e1)).toBe(1);
  });
});
