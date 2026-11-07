import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ModelTransport } from '../../conditions/interpreter';
import { createEvent } from '../events';
import { handleGetOwnResponse, handleGetResults, handleInterpret, handleSaveResponse } from '../http';
import { joinEvent } from '../responses';
import { testDb, type TestDb } from './pglite';

const SECRET_TEXT = "I'll go if Jess or Sam comes, but only if the weather's good";
const eventInput = {
  title: 'Drinks',
  organiserName: 'Org',
  timezone: 'Australia/Sydney',
  durationMin: 120,
  days: [
    { date: '2030-06-01', start: 1080, end: 1380 },
    { date: '2030-06-02', start: 1080, end: 1530 },
  ],
};

let t: TestDb;
let eventId: string;
let otherEvent: string;
let ella: string;
let jessId: string;
let jess: string;
let organiserToken: string;
const getDb = () => t.db;
const modelOutput = {
  clauses: [
    {
      source_text: 'if Jess or Sam comes',
      kind: 'enforceable',
      type: 'requires_any',
      people: [
        { name: 'Jess', roster_match: 'Jess' },
        { name: 'Sam', roster_match: null },
      ],
      count: null,
      includes_self: null,
      time: null,
      reason: null,
      assumption: null,
    },
    {
      source_text: "only if the weather's good",
      kind: 'unsupported',
      type: null,
      people: [],
      count: null,
      includes_self: null,
      time: null,
      reason: 'weather',
      assumption: null,
    },
  ],
};
let lastInput = '';
const transport: ModelTransport = async (req) => {
  lastInput = req.user;
  return { ok: true, text: JSON.stringify(modelOutput) };
};

const interpret = (body: unknown, cred: string | null, id = eventId, tr: ModelTransport | null = transport) =>
  handleInterpret(
    id,
    new Request('http://x/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cred ? { authorization: `Bearer ${cred}` } : {}) },
      body: JSON.stringify(body),
    }),
    getDb,
    () => tr,
  );
const put = (body: unknown, cred: string) =>
  handleSaveResponse(
    eventId,
    new Request('http://x/api', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cred}` },
      body: JSON.stringify(body),
    }),
    getDb,
  );
const get = (cred: string) =>
  handleGetOwnResponse(eventId, new Request('http://x/api', { headers: { authorization: `Bearer ${cred}` } }), getDb);

beforeAll(async () => {
  t = await testDb();
  const ev = await createEvent(t.db, eventInput);
  eventId = ev.id;
  organiserToken = ev.token;
  otherEvent = (await createEvent(t.db, eventInput)).id;
  const j = await joinEvent(t.db, eventId, 'Jess');
  if (j.status !== 'ok') throw new Error('join');
  jessId = j.participant.id;
  jess = j.credential;
  const e = await joinEvent(t.db, eventId, 'Ella');
  if (e.status !== 'ok') throw new Error('join');
  ella = e.credential;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await t.close();
});

describe('POST /api/events/{id}/interpret', () => {
  it('requires this event’s guest credential', async () => {
    expect((await interpret({ date: '2030-06-01', text: 'if Jess comes' }, null)).status).toBe(401);
    expect((await interpret({ date: '2030-06-01', text: 'if Jess comes' }, ella, otherEvent)).status).toBe(401);
    expect((await interpret({ date: '2030-06-01', text: 'if Jess comes' }, ella.slice(0, -2) + 'xx')).status).toBe(401);
  });

  it('validates the day, empty text and the 500-character limit', async () => {
    expect((await interpret({ date: '2030-06-05', text: 'if Jess comes' }, ella)).status).toBe(400);
    expect((await interpret({ date: '2030-06-01', text: '   ' }, ella)).status).toBe(400);
    const long = await interpret({ date: '2030-06-01', text: 'a'.repeat(501) }, ella);
    expect(long.status).toBe(400);
    expect(await long.json()).toEqual({ error: { code: 'invalid_input', message: 'Keep it under 500 characters.', field: 'text' } });
    expect((await interpret({ date: '2030-06-01', text: 'a'.repeat(500) }, ella)).status).toBe(200);
  });

  it('builds the context from the database (roster names, no ids, guest excluded) and returns validated conditions', async () => {
    const res = await interpret({ date: '2030-06-02', text: SECRET_TEXT, roster: ['Mallory'], self_id: 'x' }, ella);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const input = JSON.parse(lastInput);
    expect(input).toEqual({
      day: { date: '2030-06-02', weekday: 'Sunday', window_start: '18:00', window_end: '01:30', duration_minutes: 120 },
      self_name: 'Ella',
      roster: ['Jess'],
      text: SECRET_TEXT,
    });
    const body = await res.json();
    expect(body.source).toBe('llm');
    expect(body.status).toBe('ok');
    expect(body.conditions).toEqual([
      {
        type: 'requires_any',
        people: [
          { id: jessId, name: 'Jess', pending: false },
          { name: 'Sam', pending: true },
        ],
      },
      { type: 'unresolvable', summary: 'Depends on the weather' },
    ]);
  });

  it('never persists or logs: no rows written, no text in logs', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')];
    const before = await t.db.query<{ n: number }>('SELECT count(*)::int AS n FROM conditions');
    await interpret({ date: '2030-06-01', text: SECRET_TEXT }, ella);
    await interpret({ date: '2030-06-01', text: SECRET_TEXT }, ella, eventId, async () => ({ ok: false, category: 'timeout' }));
    const after = await t.db.query<{ n: number }>('SELECT count(*)::int AS n FROM conditions');
    expect(after[0]!.n).toBe(before[0]!.n);
    const logged = logs
      .flatMap((s) => s.mock.calls.flat())
      .map(String)
      .join('\n');
    expect(logged).not.toContain('Jess or Sam');
    expect(logged).not.toContain('weather');
    logs.forEach((s) => s.mockRestore());
  });

  it('falls back with the offline label when the model fails', async () => {
    const body = await (
      await interpret({ date: '2030-06-01', text: SECRET_TEXT }, ella, eventId, async () => ({ ok: false, category: 'timeout' }))
    ).json();
    expect(body.source).toBe('fallback');
    expect(body.conditions.some((c: { type: string }) => c.type === 'unresolvable')).toBe(true);
    expect(body).not.toHaveProperty('failure');
  });
});

describe('confirm → save → reload, privately', () => {
  it('saves confirmed AI conditions without raw text and restores them to the author only', async () => {
    const r = await (await interpret({ date: '2030-06-01', text: SECRET_TEXT }, ella)).json();
    const conditions = r.conditions.map((c: Record<string, unknown>) => ({
      ...c,
      source: r.source,
      ...(c.people ? { people: (c.people as { id?: string; name: string }[]).map((p) => (p.id ? { id: p.id } : { name: p.name })) } : {}),
    }));
    const saved = await put(
      { days: [{ date: '2030-06-01', willingness: 'if', available: [{ start: 1080, end: 1380 }], conditions }] },
      ella,
    );
    expect(saved.status).toBe(200);
    const rows = await t.db.query<{ payload: unknown; readback: string; source: string }>(
      'SELECT payload, readback, source FROM conditions',
    );
    expect(rows.map((x) => x.source)).toEqual(['llm', 'llm']);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("weather's good");
    expect(dump).not.toContain("I'll go");
    expect(dump).not.toContain('if Jess or Sam comes');
    const own = await (await get(ella)).json();
    expect(own.days[0].conditions.map((c: { type: string; source: string }) => [c.type, c.source])).toEqual([
      ['requires_any', 'llm'],
      ['unresolvable', 'llm'],
    ]);
    const other = await (await get(jess)).json();
    expect(JSON.stringify(other)).not.toContain('weather');
    const orgResults = await (
      await handleGetResults(eventId, new Request('http://x', { headers: { authorization: `Bearer ${organiserToken}` } }), getDb)
    ).text();
    expect(orgResults).not.toContain('weather');
    expect(orgResults).not.toContain('Sam');
  });

  it('still rejects unconfirmed sources and empty If responses', async () => {
    const bad = await put(
      {
        days: [
          {
            date: '2030-06-01',
            willingness: 'if',
            available: [{ start: 1080, end: 1380 }],
            conditions: [{ type: 'min_attendees', n: 3, source: 'model' }],
          },
        ],
      },
      ella,
    );
    expect(bad.status).toBe(400);
    const empty = await put(
      { days: [{ date: '2030-06-01', willingness: 'if', available: [{ start: 1080, end: 1380 }], conditions: [] }] },
      ella,
    );
    expect(empty.status).toBe(400);
  });
});
