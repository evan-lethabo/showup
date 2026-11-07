import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEvent, deleteEvent } from '../events';
import {
  handleCloseProposal,
  handleCreateProposal,
  handleGetProposal,
  handleLeaveEvent,
  handleVote,
  handleWithdrawProposal,
} from '../http';
import { authenticateGuest, joinEvent, saveResponse } from '../responses';
import { testDb, type TestDb } from './pglite';

let t: TestDb;
const getDb = () => t.db;
beforeAll(async () => {
  t = await testDb();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(async () => {
  vi.restoreAllMocks();
  await t.close();
});

const DAY = '2030-10-25';
const h = (x: number) => x * 60;
type Cond = Record<string, unknown>;

async function newEvent() {
  return createEvent(t.db, {
    title: 'Dinner',
    organiserName: 'Org',
    timezone: 'Australia/Sydney',
    durationMin: 120,
    days: [{ date: DAY, start: h(18), end: h(23) }],
  });
}
async function guest(eventId: string, name: string, conds: Cond[] = [], will: 'yes' | 'if' = conds.length ? 'if' : 'yes') {
  const j = await joinEvent(t.db, eventId, name);
  if (j.status !== 'ok') throw new Error('join');
  const a = await authenticateGuest(t.db, eventId, j.credential);
  if (a.status !== 'ok') throw new Error('auth');
  const r = await saveResponse(t.db, eventId, a.participant, {
    days: [
      {
        date: DAY,
        willingness: will,
        available: [{ start: h(19), end: h(22) }],
        favourite: [],
        conditions: conds.map((c) => ({ source: 'fallback', ...c })),
      },
    ],
  });
  if (r.status !== 'ok') throw new Error('save');
  return j.credential;
}
const req = (method: string, auth?: string, body?: unknown) =>
  new Request('http://x/api', {
    method,
    headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const slot = { date: DAY, startMin: h(19), endMin: h(21) };
const propose = (id: string, token: string, extra: Record<string, unknown> = {}, now?: Date) =>
  handleCreateProposal(id, req('POST', token, { ...slot, minAttendees: 3, ...extra }), getDb, now);
const vote = (id: string, cred: string, v: string, now?: Date) => handleVote(id, req('PUT', cred, { vote: v }), getDb, now);
const view = async (id: string, auth?: string, now?: Date) =>
  (await (await handleGetProposal(id, req('GET', auth), getDb, now)).json()).proposal;
const close = (id: string, token: string) => handleCloseProposal(id, req('POST', token), getDb);

describe('creating a proposal', () => {
  it('organiser creates one; a second while open, a guest credential, and bad input are refused', async () => {
    const { id, token } = await newEvent();
    const g = await guest(id, 'Amy');
    expect((await propose(id, token)).status).toBe(201);
    expect((await propose(id, token)).status).toBe(409);
    const other = await newEvent();
    expect((await propose(other.id, g)).status).toBe(403);
    expect((await propose('nope', token)).status).toBe(404);
    for (const bad of [
      { minAttendees: 1 },
      { startMin: h(19) + 15 },
      { startMin: h(22) },
      { date: '2030-01-01' },
      { startMin: h(17) },
      { deadline: '2000-01-01' },
      { deadline: '2031-01-01' },
    ]) {
      const o = await newEvent();
      expect((await propose(o.id, o.token, bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });
});

describe('no fixed length', () => {
  const eventWith = (durationMin: number | null) =>
    createEvent(t.db, {
      title: 'Drinks',
      organiserName: 'Org',
      timezone: 'Australia/Sydney',
      durationMin,
      days: [{ date: DAY, start: h(18), end: h(23) }],
    });
  async function briefGuest(eventId: string) {
    const j = await joinEvent(t.db, eventId, 'Amy');
    if (j.status !== 'ok') throw new Error('join');
    const a = await authenticateGuest(t.db, eventId, j.credential);
    if (a.status !== 'ok') throw new Error('auth');
    await saveResponse(t.db, eventId, a.participant, {
      days: [{ date: DAY, willingness: 'yes', available: [{ start: h(19), end: h(20) }], favourite: [], conditions: [] }],
    });
    return j.credential;
  }

  it('proposes a start time; someone free at the start counts even though they leave early', async () => {
    const { id, token } = await eventWith(null);
    const g = await briefGuest(id);
    expect((await propose(id, token, { minAttendees: 2 })).status).toBe(201);
    await vote(id, g, 'in');
    await close(id, token);
    const p = await view(id, g);
    expect(p).toMatchObject({ status: 'confirmed', myStatus: 'going', confirmedCount: 2 });
  });

  it('with a 2 h length the same guest, free for only one hour, does not make it (original behaviour)', async () => {
    const { id, token } = await eventWith(120);
    const g = await briefGuest(id);
    await propose(id, token, { minAttendees: 2 });
    await vote(id, g, 'in');
    await close(id, token);
    expect(await view(id, g)).toMatchObject({ status: 'failed', myStatus: 'not_going' });
  });

  it('accepts a start late in the window but not one with no room to begin', async () => {
    const { id, token } = await eventWith(null);
    expect((await propose(id, token, { startMin: h(22.5) })).status).toBe(201);
    const o = await eventWith(null);
    expect((await propose(o.id, o.token, { startMin: h(23) })).status).toBe(400);
  });
});

describe('voting and what everyone sees while open', () => {
  it('same body for all; only the caller sees their own vote; no counts; changing the vote replaces it', async () => {
    const { id, token } = await newEvent();
    const a = await guest(id, 'Amy');
    const b = await guest(id, 'Ben');
    await propose(id, token);
    expect((await vote(id, a, 'in')).status).toBe(200);
    const anon = await view(id);
    const asB = await view(id, b);
    const asA = await view(id, a);
    const org = await view(id, token);
    const { myVote: _m, ...core } = asA;
    const { tally, ...orgCore } = org;
    expect(anon).toEqual(core);
    expect(orgCore).toEqual(core);
    expect(tally).toEqual([
      { name: 'Amy', vote: 'in' },
      { name: 'Ben', vote: null },
    ]);
    for (const other of [anon, asA, asB]) expect(other.tally).toBeUndefined();
    expect(JSON.stringify([anon, asA, asB])).not.toMatch(/Ben|pending/);
    expect(asA.myVote).toBe('in');
    expect(asB.myVote).toBeNull();
    expect(anon.myVote).toBeUndefined();
    expect(JSON.stringify(anon)).not.toMatch(/confirmed|Amy|Ben/);
    await vote(id, b, 'out');
    expect((await view(id, token)).tally).toEqual([
      { name: 'Amy', vote: 'in' },
      { name: 'Ben', vote: 'out' },
    ]);
    await vote(id, a, 'out');
    expect((await view(id, a)).myVote).toBe('out');
    expect((await t.db.query('SELECT count(*)::int AS n FROM proposal_votes'))[0]!.n).toBeGreaterThanOrEqual(1);
  });

  it('refuses a bad vote, a bad credential, and a vote with no proposal', async () => {
    const { id, token } = await newEvent();
    const a = await guest(id, 'Amy');
    expect((await vote(id, a, 'in')).status).toBe(409);
    await propose(id, token);
    expect((await vote(id, a, 'maybe')).status).toBe(400);
    expect((await vote(id, 'x.y', 'in')).status).toBe(401);
    expect((await handleVote(id, req('PUT', undefined, { vote: 'in' }), getDb)).status).toBe(401);
    expect((await handleGetProposal(id, req('GET', 'garbage'), getDb)).status).toBe(403);
  });
});

describe('closing and confirming', () => {
  it('confirms when in-voters plus the organiser reach the minimum, and says who is going', async () => {
    const { id, token } = await newEvent();
    const a = await guest(id, 'Amy');
    const b = await guest(id, 'Ben');
    const c = await guest(id, 'Cat');
    await propose(id, token, { minAttendees: 3 });
    await vote(id, a, 'in');
    await vote(id, b, 'in');
    await vote(id, c, 'out');
    expect((await close(id, token)).status).toBe(200);
    const asA = await view(id, a);
    expect(asA).toMatchObject({ status: 'confirmed', confirmedCount: 3, myStatus: 'going' });
    expect((await view(id, c)).myStatus).toBe('not_going');
    expect((await view(id, token)).myStatus).toBe('going');
    expect((await vote(id, a, 'out')).status).toBe(409);
    expect((await close(id, token)).status).toBe(409);
    expect((await propose(id, token)).status).toBe(409);
  });

  it('fails when short of the minimum, and the organiser can propose again', async () => {
    const { id, token } = await newEvent();
    const a = await guest(id, 'Amy');
    await guest(id, 'Ben');
    await propose(id, token, { minAttendees: 4 });
    await vote(id, a, 'in');
    await close(id, token);
    expect(await view(id)).toMatchObject({ status: 'failed', confirmedCount: 2 });
    expect((await propose(id, token, { minAttendees: 2 })).status).toBe(201);
    expect((await view(id)).status).toBe('open');
  });

  it("re-checks conditions against the 'in' group only", async () => {
    const { id, token } = await newEvent();
    const needsCat = await guest(id, 'Amy', [{ type: 'requires', people: [{ name: 'Cat' }] }]);
    const b = await guest(id, 'Ben');
    const c = await guest(id, 'Cat');
    await propose(id, token, { minAttendees: 3 });
    await vote(id, needsCat, 'in');
    await vote(id, b, 'in');
    await vote(id, c, 'out');
    await close(id, token);
    // Amy needs Cat, Cat said no: Amy drops out. Ben + organiser = 2 < 3.
    expect(await view(id, needsCat)).toMatchObject({ status: 'failed', confirmedCount: 2 });

    const o = await newEvent();
    const x = await guest(o.id, 'Xia', [{ type: 'requires', people: [{ name: 'Yan' }] }]);
    const y = await guest(o.id, 'Yan', [{ type: 'requires', people: [{ name: 'Xia' }] }]);
    await propose(o.id, o.token, { minAttendees: 3 });
    await vote(o.id, x, 'in');
    await vote(o.id, y, 'in');
    await close(o.id, o.token);
    expect(await view(o.id, x)).toMatchObject({ status: 'confirmed', confirmedCount: 3, myStatus: 'going' });
  });

  it('an unresolvable condition does not count toward the minimum', async () => {
    const { id, token } = await newEvent();
    const a = await guest(id, 'Amy', [{ type: 'unresolvable', summary: 'Depends on the weather' }]);
    await propose(id, token, { minAttendees: 2 });
    await vote(id, a, 'in');
    await close(id, token);
    expect(await view(id, a)).toMatchObject({ status: 'failed', myStatus: 'not_going' });
  });

  it('closes lazily after the reply-by day ends in the event timezone, and only once', async () => {
    const { id, token } = await newEvent();
    const a = await guest(id, 'Amy');
    await guest(id, 'Ben');
    const day = new Date('2030-10-20T00:00:00Z');
    expect((await propose(id, token, { minAttendees: 2, deadline: '2030-10-21' }, day)).status).toBe(201);
    await vote(id, a, 'in', day);
    // 2030-10-21 12:00 UTC is already 21 Oct 23:00 in Sydney (UTC+11): still open.
    expect((await view(id, a, new Date('2030-10-21T12:00:00Z'))).status).toBe('open');
    // 2030-10-21 14:00 UTC is 22 Oct 01:00 in Sydney: the deadline day is over.
    const late = new Date('2030-10-21T14:00:00Z');
    expect(await view(id, a, late)).toMatchObject({ status: 'confirmed', confirmedCount: 2 });
    expect(await view(id, a, new Date('2030-10-23T00:00:00Z'))).toMatchObject({
      status: 'confirmed',
      confirmedCount: 2,
      myStatus: 'going',
    });
  });

  it('refuses a vote after the deadline and resolves the poll', async () => {
    const { id, token } = await newEvent();
    const a = await guest(id, 'Amy');
    const day = new Date('2030-10-20T00:00:00Z');
    await propose(id, token, { minAttendees: 2, deadline: '2030-10-21' }, day);
    expect((await vote(id, a, 'in', new Date('2030-10-25T00:00:00Z'))).status).toBe(409);
    expect((await view(id, a, new Date('2030-10-25T00:00:00Z'))).status).toBe('failed');
  });
});

describe('cancelling the proposed time', () => {
  it('organiser can reset an open or confirmed proposal, which clears the answers and lets them propose again', async () => {
    const { id, token } = await newEvent();
    const a = await guest(id, 'Amy');
    await propose(id, token, { minAttendees: 2 });
    await vote(id, a, 'in');
    await close(id, token);
    expect((await view(id, a)).status).toBe('confirmed');
    expect((await handleWithdrawProposal(id, req('DELETE', a), getDb)).status).toBe(403);
    expect((await view(id, a)).status).toBe('confirmed');
    expect((await handleWithdrawProposal(id, req('DELETE', token), getDb)).status).toBe(200);
    expect(await view(id, a)).toBeNull();
    expect((await t.db.query('SELECT count(*)::int AS n FROM proposal_votes WHERE event_id = $1', [id]))[0]!.n).toBe(0);
    expect((await propose(id, token, { minAttendees: 2 })).status).toBe(201);
    expect((await view(id, a)).myVote).toBeNull();
    expect((await handleWithdrawProposal('nope', req('DELETE', token), getDb)).status).toBe(404);
  });
});

describe('cleanup', () => {
  it('a leaving guest loses their vote; cancelling the event removes proposals and votes', async () => {
    const { id, token } = await newEvent();
    const a = await guest(id, 'Amy');
    const b = await guest(id, 'Ben');
    await propose(id, token);
    await vote(id, a, 'in');
    await vote(id, b, 'in');
    await handleLeaveEvent(id, req('DELETE', a), getDb);
    expect((await t.db.query('SELECT count(*)::int AS n FROM proposal_votes WHERE event_id = $1', [id]))[0]!.n).toBe(1);
    await deleteEvent(t.db, id);
    expect((await t.db.query('SELECT count(*)::int AS n FROM proposals WHERE event_id = $1', [id]))[0]!.n).toBe(0);
    expect((await t.db.query('SELECT count(*)::int AS n FROM proposal_votes WHERE event_id = $1', [id]))[0]!.n).toBe(0);
  });
});
