// Guest participation (B3) and persistent responses (B4/B5). Guests have no account: joining returns a
// credential "<participantId>.<secret>" that the browser keeps for this event; only SHA-256(secret) is stored.
import type { Response, Willingness } from '../engine/types';
import type { ConditionView } from '../conditions/fallback';
import type { Db, Statement } from './db';
import { pgCode, pgConstraint } from './db';
import { hashToken, ID_PATTERN, newId, newToken, tokenMatches } from './credentials';
import { validateName, type ValidationError } from './validate';
import { MAX_PARTICIPANTS, slotIdFor, toEngineCondition, toView, type ParticipantRow } from './participant-refs';
import { validateResponse, type DayWindow } from './response-validation';

// Re-exported so callers keep importing everything response-related from here.
export { MAX_PARTICIPANTS, isPendingRef, pendingRef, resolveRefs, slotIdFor, toEngineCondition } from './participant-refs';
export type { ParticipantRow, StoredCondition } from './participant-refs';
export { validateResponse } from './response-validation';
export type { DayWindow, ValidDay } from './response-validation';

// ---- Join and authenticate ------------------------------------------------------------------------------------

export type JoinResult =
  | { status: 'ok'; participant: { id: string; name: string }; credential: string }
  | { status: 'invalid'; error: ValidationError }
  | { status: 'name_taken' }
  | { status: 'not_found' }
  | { status: 'full' };

export async function joinEvent(db: Db, eventId: string, rawName: unknown): Promise<JoinResult> {
  if (!ID_PATTERN.test(eventId)) return { status: 'not_found' };
  const name = validateName(rawName);
  if ('error' in name) return { status: 'invalid', error: name.error };
  const [ev] = await db.query<{ n: number }>(
    'SELECT (SELECT count(*) FROM participants p WHERE p.event_id = e.id)::int AS n FROM events e WHERE e.id = $1',
    [eventId],
  );
  if (!ev) return { status: 'not_found' };
  if (ev.n >= MAX_PARTICIPANTS) return { status: 'full' };
  const id = newId();
  const secret = newToken();
  try {
    await db.query('INSERT INTO participants (id, event_id, display_name, token_hash) VALUES ($1, $2, $3, $4)', [
      id,
      eventId,
      name.value,
      hashToken(secret),
    ]);
  } catch (err) {
    if (pgCode(err) === '23505' && pgConstraint(err) === 'participants_name_unique') return { status: 'name_taken' };
    if (pgCode(err) === '23503') return { status: 'not_found' };
    throw err;
  }
  return { status: 'ok', participant: { id, name: name.value }, credential: `${id}.${secret}` };
}

export type GuestAccess = { status: 'ok'; participant: ParticipantRow } | { status: 'unauthorised' };

/** Server-side gate for every guest read and write. Unknown participant and wrong secret look the same. */
export async function authenticateGuest(db: Db, eventId: string, credential: unknown): Promise<GuestAccess> {
  if (typeof credential !== 'string' || credential.length > 300 || !ID_PATTERN.test(eventId)) return { status: 'unauthorised' };
  const dot = credential.indexOf('.');
  const id = credential.slice(0, dot);
  if (dot < 0 || !ID_PATTERN.test(id)) return { status: 'unauthorised' };
  const [row] = await db.query<{ id: string; display_name: string; normalised_name: string; token_hash: string }>(
    'SELECT id, display_name, normalised_name, token_hash FROM participants WHERE id = $1 AND event_id = $2',
    [id, eventId],
  );
  if (!row || !tokenMatches(credential.slice(dot + 1), row.token_hash)) return { status: 'unauthorised' };
  return { status: 'ok', participant: { id: row.id, displayName: row.display_name, normalisedName: row.normalised_name } };
}

// ---- Read and save ----------------------------------------------------------------------------------------------

export interface OwnDay {
  date: string;
  willingness: 'yes' | 'if' | 'no';
  available: { start: number; end: number }[];
  favourite: { start: number; end: number }[];
  conditions: (ConditionView & { readback: string; source: string })[];
}

export interface OwnResponse {
  participant: { id: string; name: string };
  responded: boolean;
  days: OwnDay[];
}

export async function eventPeople(db: Db, eventId: string): Promise<ParticipantRow[]> {
  const rows = await db.query<{ id: string; display_name: string; normalised_name: string }>(
    'SELECT id, display_name, normalised_name FROM participants WHERE event_id = $1 ORDER BY created_seq',
    [eventId],
  );
  return rows.map((r) => ({ id: r.id, displayName: r.display_name, normalisedName: r.normalised_name }));
}

export async function eventDays(db: Db, eventId: string): Promise<DayWindow[]> {
  const rows = await db.query<{ date: string; win_start: number; win_end: number }>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date, win_start, win_end FROM event_days WHERE event_id = $1 ORDER BY position`,
    [eventId],
  );
  return rows.map((r) => ({ date: r.date, start: Number(r.win_start), end: Number(r.win_end) }));
}

interface Rows {
  will: { participant_id: string; date: string; value: 'yes' | 'if' | 'no' }[];
  ranges: { participant_id: string; date: string; kind: 'available' | 'favourite'; start_min: number; end_min: number }[];
  conds: {
    participant_id: string;
    date: string;
    type: string;
    payload: Record<string, unknown> | string;
    readback: string;
    source: string;
  }[];
}

async function responseRows(db: Db, eventId: string, participantId: string | null): Promise<Rows> {
  const where = participantId ? 'event_id = $1 AND participant_id = $2' : 'event_id = $1';
  const params = participantId ? [eventId, participantId] : [eventId];
  const d = `to_char(date, 'YYYY-MM-DD') AS date`;
  const [will, rs, conds] = await Promise.all([
    db.query<Rows['will'][number]>(`SELECT participant_id, ${d}, value FROM day_willingness WHERE ${where}`, params),
    db.query<Rows['ranges'][number]>(
      `SELECT participant_id, ${d}, kind, start_min, end_min FROM ranges WHERE ${where} ORDER BY start_min`,
      params,
    ),
    db.query<Rows['conds'][number]>(
      `SELECT participant_id, ${d}, type, payload, readback, source FROM conditions WHERE ${where} ORDER BY id`,
      params,
    ),
  ]);
  return { will, ranges: rs, conds };
}

const payloadOf = (p: Record<string, unknown> | string) => (typeof p === 'string' ? (JSON.parse(p) as Record<string, unknown>) : p);

/** The participant's own response, conditions included. Only ever returned to its authenticated author. */
export async function loadOwnResponse(db: Db, eventId: string, me: ParticipantRow): Promise<OwnResponse> {
  const [people, rows] = await Promise.all([eventPeople(db, eventId), responseRows(db, eventId, me.id)]);
  const days: OwnDay[] = rows.will
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((w) => ({
      date: w.date,
      willingness: w.value,
      available: rows.ranges
        .filter((r) => r.date === w.date && r.kind === 'available')
        .map((r) => ({ start: Number(r.start_min), end: Number(r.end_min) })),
      favourite: rows.ranges
        .filter((r) => r.date === w.date && r.kind === 'favourite')
        .map((r) => ({ start: Number(r.start_min), end: Number(r.end_min) })),
      conditions: rows.conds
        .filter((c) => c.date === w.date)
        .map((c) => ({ ...toView({ type: c.type, payload: payloadOf(c.payload) }, people), readback: c.readback, source: c.source })),
    }));
  return { participant: { id: me.id, name: me.displayName }, responded: days.length > 0, days };
}

export type SaveResult = { status: 'ok'; response: OwnResponse } | { status: 'invalid'; error: ValidationError };

/** Replaces the participant's whole response in one transaction: never a partial or duplicated response. */
export async function saveResponse(db: Db, eventId: string, me: ParticipantRow, body: unknown): Promise<SaveResult> {
  const [days, people] = await Promise.all([eventDays(db, eventId), eventPeople(db, eventId)]);
  const v = validateResponse(body, days, me, people);
  if ('error' in v) return { status: 'invalid', error: v.error };
  const id = me.id;
  const statements: Statement[] = [
    // Serialises concurrent saves by the same participant, so their delete-and-insert can't interleave.
    { text: 'SELECT id FROM participants WHERE id = $1 AND event_id = $2 FOR UPDATE', params: [id, eventId] },
    { text: 'DELETE FROM conditions WHERE participant_id = $1', params: [id] },
    { text: 'DELETE FROM ranges WHERE participant_id = $1', params: [id] },
    { text: 'DELETE FROM day_willingness WHERE participant_id = $1', params: [id] },
  ];
  const multi = (table: string, cols: string[], rows: unknown[][]): Statement | null => {
    if (!rows.length) return null;
    const params: unknown[] = [];
    const values = rows.map(
      (r) =>
        `(${r
          .map((x) => {
            params.push(x);
            return `$${params.length}`;
          })
          .join(', ')})`,
    );
    return { text: `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${values.join(', ')}`, params };
  };
  const will = multi(
    'day_willingness',
    ['participant_id', 'event_id', 'date', 'value'],
    v.value.map((d) => [id, eventId, d.date, d.willingness]),
  );
  const rs = multi(
    'ranges',
    ['participant_id', 'event_id', 'date', 'kind', 'start_min', 'end_min'],
    v.value.flatMap((d) => [
      ...d.available.map((r) => [id, eventId, d.date, 'available', r.s, r.e]),
      ...d.favourite.map((r) => [id, eventId, d.date, 'favourite', r.s, r.e]),
    ]),
  );
  const cs = multi(
    'conditions',
    ['participant_id', 'event_id', 'date', 'type', 'payload', 'readback', 'source'],
    v.value.flatMap((d) => d.conditions.map((c) => [id, eventId, d.date, c.type, JSON.stringify(c.payload), c.readback, c.source])),
  );
  for (const s of [will, rs, cs]) if (s) statements.push(s);
  await db.transaction(statements);
  return { status: 'ok', response: await loadOwnResponse(db, eventId, me) };
}

// ---- Engine adapter (for C2) ----------------------------------------------------------------------------------

/**
 * Every response in the event as engine input, with stored references resolved to participant ids. Participants
 * who joined but never saved are omitted (they count as not attending). Server-only: this is private data.
 */
export async function loadEngineResponses(db: Db, eventId: string): Promise<Response[]> {
  const [people, rows] = await Promise.all([eventPeople(db, eventId), responseRows(db, eventId, null)]);
  return toEngineResponses(people, rows);
}

export function toEngineResponses(people: readonly ParticipantRow[], rows: Rows): Response[] {
  return people.flatMap((p): Response[] => {
    const mine = rows.will.filter((w) => w.participant_id === p.id);
    if (!mine.length) return [];
    const r: Response = { id: p.id, who: p.displayName, role: 'guest', avail: {}, ranges: {}, will: {}, conds: {}, favs: {} };
    for (const w of mine) {
      const sid = slotIdFor(w.date);
      const of = (kind: string) =>
        rows.ranges
          .filter((x) => x.participant_id === p.id && x.date === w.date && x.kind === kind)
          .map((x) => ({ s: Number(x.start_min), e: Number(x.end_min) }));
      const av = of('available');
      const fav = of('favourite');
      r.ranges[sid] = av;
      r.favs![sid] = fav;
      r.avail[sid] = fav.length ? 2 : av.length ? 1 : 0;
      r.will[sid] = w.value as Willingness;
      const cs = rows.conds.filter((c) => c.participant_id === p.id && c.date === w.date);
      r.conds[sid] = cs.length ? cs.map((c) => toEngineCondition({ type: c.type, payload: payloadOf(c.payload) }, people)) : null;
    }
    return [r];
  });
}

/** Removes a guest and, by cascade, their ranges, willingness and conditions. */
export async function leaveEvent(db: Db, eventId: string, participantId: string): Promise<void> {
  await db.query('DELETE FROM participants WHERE id = $1 AND event_id = $2', [participantId, eventId]);
}
