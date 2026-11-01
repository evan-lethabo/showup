import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { rankSlots } from '../../engine';
import { createEvent, getPublicEvent } from '../events';
import { handleGetResults } from '../http';
import { authenticateGuest, joinEvent, loadEngineResponses, saveResponse, slotIdFor } from '../responses';
import { computeResults } from '../results';
import { testDb, type TestDb } from './pglite';

let t: TestDb;
const getDb = () => t.db;
beforeAll(async () => { t = await testDb(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(async () => { vi.restoreAllMocks(); await t.close(); });

const FRI = '2030-10-25';
const SAT = '2030-10-26';
const h = (x: number) => x * 60;
type Will = 'yes' | 'if' | 'no';
type Cond = Record<string, unknown>;

async function newEvent(days = [{ date: FRI, start: h(18), end: h(23) }, { date: SAT, start: h(18), end: h(23) }], durationMin: number | null = 180) {
  return createEvent(t.db, { title: 'Demo', organiserName: 'Org', timezone: 'Australia/Sydney', durationMin, days });
}
async function join(eventId: string, name: string) {
  const j = await joinEvent(t.db, eventId, name);
  if (j.status !== 'ok') throw new Error('join ' + name + ' ' + j.status);
  return j.credential;
}
async function save(eventId: string, cred: string, days: { date: string; will: Will; s?: number; e?: number; conds?: Cond[] }[]) {
  const auth = await authenticateGuest(t.db, eventId, cred);
  if (auth.status !== 'ok') throw new Error('auth');
  const body = {
    days: days.map((d) => ({
      date: d.date, willingness: d.will,
      available: d.will === 'no' ? [] : [{ start: d.s ?? h(19), end: d.e ?? h(22) }], favourite: [],
      conditions: (d.conds ?? []).map((c) => ({ source: 'fallback', ...c })),
    })),
  };
  const r = await saveResponse(t.db, eventId, auth.participant, body);
  if (r.status !== 'ok') throw new Error('save ' + JSON.stringify(r.error));
}
const needs = (name: string): Cond => ({ type: 'requires', people: [{ name }] });
const get = (eventId: string, auth?: string) =>
  handleGetResults(eventId, new Request(`http://localhost/api/events/${eventId}/results`, { headers: auth === undefined ? {} : { authorization: auth } }), getDb);
const dto = async (eventId: string, auth?: string) => (await get(eventId, auth)).json();
const summary = (r: any) => ({
  days: r.days.map((d: any) => [d.date, d.best?.free ?? 0, d.best?.coming ?? 0]),
  best: r.best?.date ?? null,
});

describe('events with no fixed length', () => {
  it('count a guest free at the start time who is gone before a fixed-length event would end', async () => {
    const days = [{ date: FRI, start: h(18), end: h(23) }];
    const open = await newEvent(days, null);
    const fixed = await newEvent(days, 180);
    for (const { id } of [open, fixed]) await save(id, await join(id, 'Amy'), [{ date: FRI, will: 'yes', s: h(19), e: h(20) }]);
    const o = await dto(open.id);
    expect(o.best).toMatchObject({ date: FRI, startMin: h(19), free: 1, coming: 1 });
    expect((await dto(fixed.id)).best).toBeNull();
  });
});

describe('canonical demo through persistence (PRODUCT-RULES §8)', () => {
  it('pending Finn → Ella resolves on join, counts only once Ella is viable, and her edit replaces her response', async () => {
    const { id } = await newEvent();
    const plan: [string, Will, Will, { fri?: Cond[]; sat?: Cond[] }?][] = [
      ['Alex', 'yes', 'yes'], ['Ben', 'yes', 'yes'], ['Chloe', 'yes', 'yes'], ['Dan', 'yes', 'no'],
      ['Finn', 'if', 'if', { fri: [needs('Ella')], sat: [needs('Ella')] }],
      ['Grace', 'if', 'no', { fri: [{ type: 'min_attendees', n: 7 }] }],
      ['Harry', 'if', 'no', { fri: [needs('Finn')] }],
      ['Jess', 'no', 'yes'],
    ];
    for (const [name, fri, sat, conds] of plan) {
      const c = await join(id, name);
      await save(id, c, [{ date: FRI, will: fri, conds: conds?.fri }, { date: SAT, will: sat, conds: conds?.sat }]);
    }
    const finnStored = await t.db.query<{ payload: { people: string[] } }>(
      `SELECT c.payload FROM conditions c JOIN participants p ON p.id = c.participant_id WHERE p.display_name = 'Finn' AND c.event_id = $1`, [id]);
    expect(finnStored.map((r) => r.payload.people)).toEqual([['name:ella'], ['name:ella']]);

    const stage1 = await dto(id);
    expect(summary(stage1)).toEqual({ days: [[FRI, 7, 4], [SAT, 5, 4]], best: FRI });
    expect(stage1.respondedCount).toBe(8);

    // Ella joins: the pending reference now resolves to her id, but joining alone satisfies nothing.
    const ella = await join(id, 'Ella');
    const people = await loadEngineResponses(t.db, id);
    const ellaId = ella.split('.')[0];
    expect(people.find((r) => r.who === 'Finn')!.conds[slotIdFor(FRI)]).toEqual([{ type: 'requires', people: [ellaId] }]);
    expect(summary(await dto(id))).toEqual(summary(stage1));
    expect((await dto(id)).respondedCount).toBe(8);

    await save(id, ella, [{ date: FRI, will: 'yes' }, { date: SAT, will: 'yes' }]);
    const stage2 = await dto(id);
    expect(summary(stage2)).toEqual({ days: [[FRI, 8, 8], [SAT, 6, 6]], best: FRI });

    await save(id, ella, [{ date: FRI, will: 'if', conds: [needs('Jess')] }, { date: SAT, will: 'yes' }]);
    const stage3 = await dto(id);
    expect(summary(stage3)).toEqual({ days: [[FRI, 8, 4], [SAT, 6, 6]], best: SAT });
    expect(stage3.best).toEqual({ date: SAT, startMin: h(19), endMin: h(22), free: 6, coming: 6, maybe: 0 });
    // Friday still has everyone free; it loses on who would actually come.
    expect(stage3.days[0].best).toMatchObject({ startMin: h(19), endMin: h(22), free: 8, coming: 4, maybe: 0 });

    const rows = await t.db.query<{ n: number; c: number }>(
      `SELECT (SELECT count(*) FROM ranges WHERE participant_id = $1)::int AS n, (SELECT count(*) FROM conditions WHERE participant_id = $1)::int AS c`, [ellaId]);
    expect(rows[0]).toEqual({ n: 2, c: 1 });
  });
});

describe('results come from C8', () => {
  it('match rankSlots on the stored responses, ignore joined-but-unresponded people, and take each day from one slot', async () => {
    const { id } = await newEvent([{ date: FRI, start: h(17), end: h(23) }], 120);
    await save(id, await join(id, 'A'), [{ date: FRI, will: 'yes', s: h(17), e: h(23) }]);
    await save(id, await join(id, 'B'), [{ date: FRI, will: 'yes', s: h(17), e: h(19) }]);
    await save(id, await join(id, 'C'), [{ date: FRI, will: 'yes', s: h(20), e: h(23) }]);
    await save(id, await join(id, 'D'), [{ date: FRI, will: 'if', s: h(20), e: h(23), conds: [{ type: 'unresolvable', summary: 'if it is not raining' }] }]);
    await join(id, 'Lurker');
    const r = await dto(id);
    expect(r.respondedCount).toBe(4);

    const ev = (await getPublicEvent(t.db, id))!;
    const ranking = rankSlots({ slots: [{ id: slotIdFor(FRI), iso: FRI, win: { s: h(17), e: h(23) } }], win: { s: h(17), e: h(23) }, duration: 120, responses: await loadEngineResponses(t.db, id) });
    const day = ranking.days[0]!;
    expect(r.days[0].best).toMatchObject({ startMin: day.window!.s, endMin: day.window!.e, free: day.free, coming: day.go, maybe: day.tentative });
    expect(r.days[0].best).toMatchObject({ startMin: h(20), endMin: h(22), free: 3, coming: 2, maybe: 1 });
    expect(r.slots).toEqual(day.slots.map((s) => ({ date: FRI, startMin: s.s, endMin: s.e, free: s.free, coming: s.go, maybe: s.tentative })));
    const sum = r.slots.reduce((n: number, s: any) => n + s.free, 0);
    expect(sum).toBeGreaterThan(r.days[0].best.free);
    expect(r.slots.filter((s: any) => s.startMin === r.days[0].best.startMin)).toHaveLength(1);
    expect(ev.participants.map((p) => p.name)).toContain('Lurker');
  });

  it('keeps cross-midnight slots on the linear minute axis', async () => {
    const { id } = await newEvent([{ date: FRI, start: h(22), end: h(26) }], 120);
    await save(id, await join(id, 'Night'), [{ date: FRI, will: 'yes', s: h(23), e: h(26) }]);
    await save(id, await join(id, 'Early'), [{ date: FRI, will: 'yes', s: h(22), e: h(24) }]);
    const r = await dto(id);
    expect(r.slots.map((s: any) => [s.startMin, s.endMin, s.free])).toEqual([[1320, 1440, 1], [1350, 1470, 0], [1380, 1500, 1], [1410, 1530, 1], [1440, 1560, 1]]);
    expect(r.best).toEqual({ date: FRI, startMin: 1320, endMin: 1440, free: 1, coming: 1, maybe: 0 });
  });

  it('returns no recommendation when nobody would come, and no day result when nobody is free', async () => {
    const { id } = await newEvent();
    expect(await dto(id)).toEqual({ eventId: id, rev: expect.any(String), respondedCount: 0, best: null, days: [{ date: FRI, best: null }, { date: SAT, best: null }], slots: expect.any(Array), people: expect.any(Array) });
    await save(id, await join(id, 'Solo'), [{ date: FRI, will: 'if', conds: [needs('Nobody')] }, { date: SAT, will: 'no' }]);
    const r = await dto(id);
    expect(r.best).toBeNull();
    expect(r.days[0].best).toMatchObject({ startMin: h(19), endMin: h(22), free: 1, coming: 0, maybe: 0 });
    expect(r.days[1].best).toBeNull();
  });
});

describe('GET /results access and privacy', () => {
  let id: string; let token: string; let guest: string; let otherGuest: string; let otherToken: string;
  beforeAll(async () => {
    ({ id, token } = await newEvent());
    guest = await join(id, 'Zed');
    await join(id, 'Quiet');
    await save(id, guest, [{ date: FRI, will: 'if', conds: [needs('Yara')] }, { date: SAT, will: 'yes' }]);
    await save(id, await join(id, 'Amy'), [{ date: FRI, will: 'if', conds: [{ type: 'unresolvable', summary: 'secret plan B' }] }, { date: SAT, will: 'yes' }]);
    const other = await newEvent();
    otherToken = other.token;
    otherGuest = await join(other.id, 'Elsewhere');
  });

  const AGG = ['eventId', 'rev', 'respondedCount', 'best', 'days', 'slots', 'people'];
  const COUNTS = ['startMin', 'endMin', 'free', 'coming', 'maybe'];
  function assertAggregateOnly(body: any) {
    expect(body.best === null || Object.keys(body.best).sort()).toEqual(body.best === null ? true : ['date', ...COUNTS].sort());
    for (const d of body.days) {
      expect(Object.keys(d).sort()).toEqual(['best', 'date']);
      if (d.best) expect(Object.keys(d.best).sort()).toEqual([...COUNTS, 'names'].sort());
    }
    for (const s of body.slots) expect(Object.keys(s).sort()).toEqual(['date', ...COUNTS].sort());
    const text = JSON.stringify(body);
    for (const leak of [ 'Yara', 'name:', 'secret plan', guest.split('.')[0], guest.split('.')[1], token, 'readback', 'viable', 'tentative', 'group', 'rounds']) {
      expect(text).not.toContain(leak);
    }
  }

  it('anonymous: 200, exactly the aggregate keys, no-store', async () => {
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([...AGG].sort());
    expect(body.respondedCount).toBe(2);
    assertAggregateOnly(body);
    // Who joined and whether they responded (names only, join order); never answers or conditions.
    expect(body.people).toEqual([{ name: 'Zed', responded: true }, { name: 'Quiet', responded: false }, { name: 'Amy', responded: true }]);
    // Names appear only as hover labels on a day's chosen window, one per free person, never on slots or elsewhere.
    for (const d of body.days) if (d.best) expect(d.best.names).toHaveLength(d.best.free);
    expect(body.slots.every((s: any) => !('names' in s))).toBe(true);
  });

  it('valid guest: the same payload as anonymous', async () => {
    const res = await get(id, `Bearer ${guest}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([...AGG].sort());
    assertAggregateOnly(body);
    expect(body).toEqual(await dto(id));
  });

  it('organiser: the same public payload (names are not an organiser privilege any more)', async () => {
    const res = await get(id, `Bearer ${token}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([...AGG].sort());
    assertAggregateOnly(body);
    expect(body).toEqual(await dto(id));
  });

  it.each([
    ['garbage bearer', 'Bearer nope'],
    ['malformed scheme', 'Basic abc'],
    ['empty bearer', 'Bearer '],
    ['tampered guest', 'Bearer GUEST_TAMPERED'],
    ['wrong-event guest', 'Bearer OTHER_GUEST'],
    ['wrong-event organiser', 'Bearer OTHER_TOKEN'],
  ])('%s: 403 forbidden', async (_label, auth) => {
    const header = auth.replace('GUEST_TAMPERED', guest.slice(0, -1) + (guest.endsWith('x') ? 'y' : 'x')).replace('OTHER_GUEST', otherGuest).replace('OTHER_TOKEN', otherToken);
    const res = await get(id, header);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('unknown event: 404 not_found, even with a credential', async () => {
    for (const auth of [undefined, `Bearer ${token}`]) {
      const res = await get('AAAAAAAAAAAAAAAA', auth);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
  });

  it('computeResults returns only aggregates plus the public people list', async () => {
    const ev = (await getPublicEvent(t.db, id))!;
    const results = await computeResults(t.db, ev);
    expect(results.people.map((p) => p.name)).toEqual(['Zed', 'Quiet', 'Amy']);
    assertAggregateOnly(results);
  });
});
