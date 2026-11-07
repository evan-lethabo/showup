import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DbUnavailableError, type Db } from '../db';
import { hashToken } from '../credentials';
import { authoriseOrganiser } from '../events';
import { checkHealth, handleCreateEvent, handleGetEvent, handleJoinEvent, MAX_BODY_BYTES } from '../http';
import { testDb, type TestDb } from './pglite';

const now = new Date('2030-01-01T00:00:00Z');
const body = {
  title: 'Dinner',
  organiserName: 'Alex',
  timezone: 'Australia/Sydney',
  days: [
    { date: '2030-01-10', start: 1140, end: 1380 },
    { date: '2030-01-04', start: 1320, end: 120 },
  ],
};

const post = (b: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  new Request('http://localhost/api/events', { method: 'POST', headers, body: typeof b === 'string' ? b : JSON.stringify(b) });

let t: TestDb;
const getDb = () => t.db;
const down = (): Db => {
  throw new DbUnavailableError();
};
beforeAll(async () => {
  t = await testDb();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(async () => {
  vi.restoreAllMocks();
  await t.close();
});

describe('GET /api/health', () => {
  it('runs a real query against the database', async () => {
    const spy = vi.spyOn(t.db, 'query');
    const res = await checkHealth(getDb);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith('SELECT 1 AS ok');
    spy.mockRestore();
  });

  it('reports failure without details when the database is missing or failing', async () => {
    const res = await checkHealth(down);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
    const broken: Db = {
      query: () => Promise.reject(Object.assign(new Error('password authentication failed for user x at host y'), { code: '28P01' })),
      transaction: () => Promise.resolve(),
    };
    const res2 = await checkHealth(() => broken);
    expect(await res2.text()).toBe('{"ok":false}');
  });
});

describe('POST /api/events', () => {
  it('creates the event with relative links that resolve to it', async () => {
    const res = await handleCreateEvent(post(body), getDb, now);
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const out = (await res.json()) as { id: string; guestPath: string; organiserPath: string };
    expect(Object.keys(out).sort()).toEqual(['guestPath', 'id', 'organiserPath']);
    expect(out.guestPath).toBe(`/e/${out.id}`);
    const m = /^\/e\/([A-Za-z0-9_-]{16})\/admin\?k=([A-Za-z0-9_-]{43})$/.exec(out.organiserPath);
    expect(m?.[1]).toBe(out.id);

    const got = await handleGetEvent(out.id, getDb);
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual({
      id: out.id,
      title: 'Dinner',
      organiserName: 'Alex',
      durationMin: 120,
      timezone: 'Australia/Sydney',
      days: [
        { date: '2030-01-04', start: 1320, end: 1560 },
        { date: '2030-01-10', start: 1140, end: 1380 },
      ],
      participants: [],
    });
    expect((await authoriseOrganiser(t.db, out.id, m?.[2])).status).toBe('ok');
  });

  it('never returns credential hashes, and the public read never returns the token', async () => {
    const out = (await (await handleCreateEvent(post(body), getDb, now)).json()) as { id: string; organiserPath: string };
    const token = new URL(out.organiserPath, 'http://x').searchParams.get('k')!;
    const pub = await (await handleGetEvent(out.id, getDb)).text();
    expect(pub).not.toContain(token);
    expect(pub).not.toContain(hashToken(token));
    expect(JSON.stringify(out)).not.toContain(hashToken(token));
  });

  it('returns field errors for invalid input, including a window shorter than the event', async () => {
    const res = await handleCreateEvent(post({ ...body, days: [{ date: '2030-01-04', start: 1200, end: 1260 }] }), getDb, now);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'invalid_input',
        field: 'days[0].end',
        message: "Each day's window needs to be at least 2 hr, the length of the event.",
      },
    });
    const before = await t.db.query('SELECT count(*)::int AS n FROM events');
    await handleCreateEvent(post({ ...body, title: '' }), getDb, now);
    expect(await t.db.query('SELECT count(*)::int AS n FROM events')).toEqual(before);
  });

  it('rejects malformed, non-JSON and oversized requests', async () => {
    expect((await handleCreateEvent(post('{"title":'), getDb, now)).status).toBe(400);
    expect((await handleCreateEvent(post(body, { 'content-type': 'text/plain' }), getDb, now)).status).toBe(415);
    expect((await handleCreateEvent(post({ ...body, title: 'x'.repeat(MAX_BODY_BYTES) }), getDb, now)).status).toBe(413);
    expect(
      (
        await handleCreateEvent(
          post(body, { 'content-type': 'application/json', 'content-length': String(MAX_BODY_BYTES + 1) }),
          getDb,
          now,
        )
      ).status,
    ).toBe(413);
  });

  it('answers 503 without details when the database is unavailable', async () => {
    const res = await handleCreateEvent(post(body), down, now);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('unavailable');
  });

  it('answers 500, not 503, for unexpected failures', async () => {
    const buggy: Db = { query: () => Promise.resolve([]), transaction: () => Promise.reject(new TypeError('x is undefined')) };
    expect((await handleCreateEvent(post(body), () => buggy, now)).status).toBe(500);
  });
});

describe('GET /api/events/:id', () => {
  it('404s for unknown and malformed ids', async () => {
    expect((await handleGetEvent('AAAAAAAAAAAAAAAA', getDb)).status).toBe(404);
    expect((await handleGetEvent('../admin', getDb)).status).toBe(404);
  });
});

describe('POST /api/events/:id/join', () => {
  it('409s for a name already taken, ignoring case and surrounding spaces', async () => {
    const { id } = await (await handleCreateEvent(post(body), getDb, now)).json();
    const join = (name: string) =>
      handleJoinEvent(
        id,
        new Request(`http://localhost/api/events/${id}/join`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name }),
        }),
        getDb,
      );
    expect((await join('sam')).status).toBe(201);
    const dup = await join('Sam ');
    expect(dup.status).toBe(409);
    const j = await dup.json();
    expect(j.error.code).toBe('name_taken');
    expect(JSON.stringify(j)).not.toMatch(/credential/);
  });
});
