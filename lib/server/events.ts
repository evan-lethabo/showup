// Event persistence. Public reads return only what any guest may see; credential hashes never leave this module.
import type { Db, Statement } from './db';
import { hashToken, ID_PATTERN, newId, newToken, tokenMatches } from './credentials';
import type { CreateEventInput } from './validate';

export interface PublicEventDay {
  date: string;
  start: number;
  end: number;
}

/** Everything a guest may see about an event. */
export interface PublicEvent {
  id: string;
  title: string;
  organiserName: string;
  /** Minutes, or null when the organiser set no fixed length. */
  durationMin: number | null;
  timezone: string;
  /** In creation order (which is date order). */
  days: PublicEventDay[];
  /** Everyone who has joined, in join order. Names are public (PRODUCT-RULES §7); responses are not. */
  participants: { name: string; responded: boolean }[];
}

export function guestPath(id: string): string {
  return `/e/${encodeURIComponent(id)}`;
}

export function organiserPath(id: string, token: string): string {
  return `/e/${encodeURIComponent(id)}/admin?k=${encodeURIComponent(token)}`;
}

/** Inserts the event and all its days atomically. The raw token is returned once and never stored. */
export async function createEvent(db: Db, input: CreateEventInput): Promise<{ id: string; token: string }> {
  const id = newId();
  const token = newToken();
  const values: string[] = [];
  const params: unknown[] = [id];
  input.days.forEach((d, i) => {
    const p = params.length;
    values.push(`($1, $${p + 1}::date, $${p + 2}, $${p + 3}, $${p + 4})`);
    params.push(d.date, i, d.start, d.end);
  });
  const statements: Statement[] = [
    {
      text: `INSERT INTO events (id, title, organiser_name, duration_min, timezone, organiser_token_hash)
             VALUES ($1, $2, $3, $4, $5, $6)`,
      params: [id, input.title, input.organiserName, input.durationMin, input.timezone, hashToken(token)],
    },
    { text: `INSERT INTO event_days (event_id, date, position, win_start, win_end) VALUES ${values.join(', ')}`, params },
  ];
  await db.transaction(statements);
  return { id, token };
}

/** Whether two events offer guests different choices: the days, any day's window, or the event length. */
function sameSchedule(
  a: { durationMin: number | null; days: PublicEventDay[] },
  b: { durationMin: number | null; days: PublicEventDay[] },
): boolean {
  return (
    a.durationMin === b.durationMin &&
    a.days.length === b.days.length &&
    a.days.every((d, i) => d.date === b.days[i]!.date && d.start === b.days[i]!.start && d.end === b.days[i]!.end)
  );
}

/**
 * Applies an organiser's edit. A new name or title leaves everyone's answers alone. If the days, windows or length change, every
 * answer (availability, willingness, conditions) and any proposal is cleared, because they no longer describe this schedule;
 * guests stay joined and simply haven't responded yet. One transaction, so guests never see a half-edited event.
 */
export async function updateEvent(db: Db, current: PublicEvent, input: CreateEventInput): Promise<{ scheduleChanged: boolean }> {
  const scheduleChanged = !sameSchedule(current, input);
  const statements: Statement[] = [
    {
      text: 'UPDATE events SET title = $2, organiser_name = $3, duration_min = $4 WHERE id = $1',
      params: [current.id, input.title, input.organiserName, input.durationMin],
    },
  ];
  if (scheduleChanged) {
    const values: string[] = [];
    const params: unknown[] = [current.id];
    input.days.forEach((d, i) => {
      const p = params.length;
      values.push(`($1, $${p + 1}::date, $${p + 2}, $${p + 3}, $${p + 4})`);
      params.push(d.date, i, d.start, d.end);
    });
    for (const table of ['proposals', 'ranges', 'day_willingness', 'conditions']) {
      statements.push({ text: `DELETE FROM ${table} WHERE event_id = $1`, params: [current.id] });
    }
    statements.push(
      { text: 'DELETE FROM event_days WHERE event_id = $1', params: [current.id] },
      { text: `INSERT INTO event_days (event_id, date, position, win_start, win_end) VALUES ${values.join(', ')}`, params },
    );
  }
  await db.transaction(statements);
  return { scheduleChanged };
}

const EVENT_SELECT = `
  SELECT e.id, e.title, e.organiser_name, e.duration_min, e.timezone, e.organiser_token_hash,
         coalesce((SELECT json_agg(json_build_object('date', to_char(d.date, 'YYYY-MM-DD'), 'start', d.win_start, 'end', d.win_end)
                                   ORDER BY d.position)
                     FROM event_days d WHERE d.event_id = e.id), '[]'::json) AS days,
         coalesce((SELECT json_agg(json_build_object('name', p.display_name,
                                   'responded', EXISTS (SELECT 1 FROM day_willingness w WHERE w.participant_id = p.id))
                                   ORDER BY p.created_seq)
                     FROM participants p WHERE p.event_id = e.id), '[]'::json) AS participants
    FROM events e WHERE e.id = $1`;

interface EventRow {
  id: string;
  title: string;
  organiser_name: string;
  duration_min: number | null;
  timezone: string;
  organiser_token_hash: string;
  days: PublicEventDay[] | string;
  participants: { name: string; responded: boolean }[] | string;
  [key: string]: unknown;
}

async function loadEvent(db: Db, id: string): Promise<{ event: PublicEvent; tokenHash: string } | null> {
  if (!ID_PATTERN.test(id)) return null;
  const rows = await db.query<EventRow>(EVENT_SELECT, [id]);
  const r = rows[0];
  if (!r) return null;
  const days = (typeof r.days === 'string' ? JSON.parse(r.days) : r.days) as PublicEventDay[];
  const people = (typeof r.participants === 'string' ? JSON.parse(r.participants) : r.participants) as PublicEvent['participants'];
  return {
    event: {
      id: r.id,
      title: r.title,
      organiserName: r.organiser_name,
      durationMin: r.duration_min === null ? null : Number(r.duration_min),
      timezone: r.timezone,
      days: days.map((d) => ({ date: d.date, start: Number(d.start), end: Number(d.end) })),
      participants: people.map((p) => ({ name: p.name, responded: p.responded === true })),
    },
    tokenHash: r.organiser_token_hash,
  };
}

export async function getPublicEvent(db: Db, id: string): Promise<PublicEvent | null> {
  return (await loadEvent(db, id))?.event ?? null;
}

export type OrganiserAccess = { status: 'ok'; event: PublicEvent } | { status: 'not_found' } | { status: 'forbidden' };

/**
 * Server-side gate for every organiser-only read or action. 'not_found' is checked first so the caller can tell a missing
 * event from a wrong token, but ids are 96 random bits, so that doesn't help anyone guess events.
 */
export async function authoriseOrganiser(db: Db, id: string, token: unknown): Promise<OrganiserAccess> {
  const found = await loadEvent(db, id);
  if (!found) return { status: 'not_found' };
  if (!tokenMatches(token, found.tokenHash)) return { status: 'forbidden' };
  return { status: 'ok', event: found.event };
}

/** Cancels an event. Days, participants and every response cascade away with it. */
export async function deleteEvent(db: Db, id: string): Promise<void> {
  await db.query('DELETE FROM events WHERE id = $1', [id]);
}
