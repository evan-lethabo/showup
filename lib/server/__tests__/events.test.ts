import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../credentials';
import { authoriseOrganiser, createEvent, getPublicEvent, guestPath, organiserPath } from '../events';
import type { CreateEventInput } from '../validate';
import { testDb, type TestDb } from './pglite';

const input: CreateEventInput = {
  title: 'Weekend plans',
  organiserName: 'Alex',
  timezone: 'Australia/Sydney',
  durationMin: 120,
  days: [
    { date: '2030-01-04', start: 1080, end: 1380 },
    { date: '2030-01-05', start: 1320, end: 1500 },
    { date: '2030-01-11', start: 600, end: 840 },
  ],
};

let t: TestDb;
beforeAll(async () => {
  t = await testDb();
});
afterAll(async () => {
  await t.close();
});

describe('creating an event', () => {
  it('persists the event and every day, in order, with cross-midnight ends above 1440', async () => {
    const { id } = await createEvent(t.db, input);
    expect(await getPublicEvent(t.db, id)).toEqual({
      id,
      title: 'Weekend plans',
      organiserName: 'Alex',
      durationMin: 120,
      timezone: 'Australia/Sydney',
      days: [
        { date: '2030-01-04', start: 1080, end: 1380 },
        { date: '2030-01-05', start: 1320, end: 1500 },
        { date: '2030-01-11', start: 600, end: 840 },
      ],
      participants: [],
    });
    const positions = await t.db.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, position FROM event_days WHERE event_id = $1 ORDER BY position`,
      [id],
    );
    expect(positions).toEqual([
      { date: '2030-01-04', position: 0 },
      { date: '2030-01-05', position: 1 },
      { date: '2030-01-11', position: 2 },
    ]);
  });

  it('stores only the SHA-256 hash of the organiser token', async () => {
    const { id, token } = await createEvent(t.db, input);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [row] = await t.db.query<{ organiser_token_hash: string }>('SELECT organiser_token_hash FROM events WHERE id = $1', [id]);
    expect(row!.organiser_token_hash).toBe(hashToken(token));
    const everything = JSON.stringify(await t.db.query('SELECT * FROM events WHERE id = $1', [id]));
    expect(everything).not.toContain(token);
  });

  it('gives every event a different unpredictable id and token', async () => {
    const a = await createEvent(t.db, input);
    const b = await createEvent(t.db, input);
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(a.id).not.toBe(b.id);
    expect(a.token).not.toBe(b.token);
  });

  it('is atomic: if any day is rejected, the event is not saved either', async () => {
    const before = await t.db.query<{ n: number }>('SELECT count(*)::int AS n FROM events');
    const bad = { ...input, days: [input.days[0]!, { date: '2030-01-05', start: 1320, end: 3000 }] };
    await expect(createEvent(t.db, bad)).rejects.toMatchObject({ code: '23514', constraint: 'event_days_window' });
    expect(await t.db.query('SELECT count(*)::int AS n FROM events')).toEqual(before);
  });

  it('builds relative links', () => {
    expect(guestPath('abcDEF123_-xyz00')).toBe('/e/abcDEF123_-xyz00');
    expect(organiserPath('abcDEF123_-xyz00', 'tok-en_1')).toBe('/e/abcDEF123_-xyz00/admin?k=tok-en_1');
  });
});

describe('reading an event', () => {
  it('returns null for unknown and malformed ids without querying with them', async () => {
    expect(await getPublicEvent(t.db, 'AAAAAAAAAAAAAAAA')).toBeNull();
    expect(await getPublicEvent(t.db, "x' OR '1'='1")).toBeNull();
    expect(await getPublicEvent(t.db, '')).toBeNull();
  });

  it('public reads expose no credential, hash or internal column', async () => {
    const { id, token } = await createEvent(t.db, input);
    const ev = await getPublicEvent(t.db, id);
    expect(Object.keys(ev!).sort()).toEqual(['days', 'durationMin', 'id', 'organiserName', 'participants', 'timezone', 'title']);
    const text = JSON.stringify(ev);
    expect(text).not.toContain(token);
    expect(text).not.toContain(hashToken(token));
    expect(text).not.toMatch(/token|hash|created/i);
  });
});

describe('organiser access', () => {
  it('accepts only the exact organiser token', async () => {
    const { id, token } = await createEvent(t.db, input);
    const ok = await authoriseOrganiser(t.db, id, token);
    expect(ok.status).toBe('ok');
    expect(JSON.stringify(ok)).not.toContain(hashToken(token));
    expect((await authoriseOrganiser(t.db, id, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).status).toBe('forbidden');
    expect((await authoriseOrganiser(t.db, id, '')).status).toBe('forbidden');
    expect((await authoriseOrganiser(t.db, id, null)).status).toBe('forbidden');
    expect((await authoriseOrganiser(t.db, id, undefined)).status).toBe('forbidden');
    expect((await authoriseOrganiser(t.db, id, ['x'])).status).toBe('forbidden');
    expect((await authoriseOrganiser(t.db, id, hashToken(token))).status).toBe('forbidden');
  });

  it("rejects another event's token and unknown events", async () => {
    const a = await createEvent(t.db, input);
    const b = await createEvent(t.db, input);
    expect((await authoriseOrganiser(t.db, a.id, b.token)).status).toBe('forbidden');
    expect((await authoriseOrganiser(t.db, 'AAAAAAAAAAAAAAAA', a.token)).status).toBe('not_found');
  });
});
