// Guest participation (B3) and persistent responses (B4/B5). Guests have no account: joining returns a
// credential "<participantId>.<secret>" that the browser keeps for this event; only SHA-256(secret) is stored.
import type { Condition, Range, Response, Willingness } from '../engine/types';
import { normaliseName, readback, titleCase, type ConditionView } from '../conditions/fallback';
import type { Db, Statement } from './db';
import { pgCode, pgConstraint } from './db';
import { hashToken, ID_PATTERN, newId, newToken, tokenMatches } from './credentials';
import { validateName, type ValidationError } from './validate';

export const MAX_PARTICIPANTS = 200;
const MAX_RANGES = 12;
const MAX_CONDITIONS = 6;
const MAX_PEOPLE = 10;
const SUMMARY_MAX = 120;
const DAY = 1440;

// ---- People references inside stored group conditions -------------------------------------------------------
// payload.people holds participant ids, or "name:<normalised name>" for someone who hasn't joined yet.
// Ids are base64url and never contain ":", so the two can't collide.

const PENDING = 'name:';
export const pendingRef = (normalised: string) => PENDING + normalised;
export const isPendingRef = (ref: string) => ref.startsWith(PENDING);
const pendingName = (ref: string) => ref.slice(PENDING.length);

export interface ParticipantRow {
  id: string;
  displayName: string;
  normalisedName: string;
}

/**
 * Resolves stored references to participant ids for the engine. A pending name matching a participant who has
 * since joined becomes their id; an unmatched one stays an id that matches nobody (so the dependency is unmet),
 * never dropped. Joining alone satisfies nothing: the engine still requires that person to be viable.
 */
export function resolveRefs(refs: readonly string[], people: readonly ParticipantRow[]): string[] {
  return refs.map((ref) => {
    if (!isPendingRef(ref)) return ref;
    const match = people.find((p) => p.normalisedName === pendingName(ref));
    return match ? match.id : ref;
  });
}

export interface StoredCondition {
  type: string;
  payload: Record<string, unknown>;
}

/** A stored payload as an engine Condition (C8 contract: people are ids only). */
export function toEngineCondition(c: StoredCondition, people: readonly ParticipantRow[]): Condition {
  const p = c.payload;
  if (c.type === 'requires' || c.type === 'requires_any') return { type: c.type, people: resolveRefs(p.people as string[], people) };
  if (c.type === 'min_attendees') return { type: 'min_attendees', n: Number(p.n) };
  if (c.type === 'time') {
    const t: Condition = { type: 'time' };
    if (typeof p.earliest_start === 'number') t.earliest_start = p.earliest_start;
    if (typeof p.latest_end === 'number') t.latest_end = p.latest_end;
    return t;
  }
  return { type: 'unresolvable', summary: String(p.summary) };
}

/** A stored payload as its author sees it, with names (and pending names that have since joined resolved). */
function toView(c: StoredCondition, people: readonly ParticipantRow[]): ConditionView {
  const p = c.payload;
  if (c.type === 'requires' || c.type === 'requires_any') {
    return {
      type: c.type,
      people: resolveRefs(p.people as string[], people).map((ref) => {
        const who = people.find((x) => x.id === ref);
        return who ? { name: who.displayName, pending: false } : { name: titleCase(pendingName(ref)), pending: true };
      }),
    };
  }
  return toEngineCondition(c, people) as ConditionView;
}

/** Engine slot id for a candidate day; the same id the flow UI uses (lib/ui/utils/dates.ts slotFromIso). */
export const slotIdFor = (date: string) => 'd' + date.replace(/-/g, '');

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

// ---- Validation -------------------------------------------------------------------------------------------------

export interface DayWindow {
  date: string;
  start: number;
  end: number;
}

export interface ValidDay {
  date: string;
  willingness: 'yes' | 'if' | 'no';
  available: Range[];
  favourite: Range[];
  conditions: { type: string; payload: Record<string, unknown>; readback: string; source: 'llm' | 'fallback' }[];
}

type V<T> = { ok: true; value: T } | { ok: false; error: ValidationError };
const bad = (field: string, message: string): { ok: false; error: ValidationError } => ({ ok: false, error: { field, message } });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function merge(rs: Range[]): Range[] {
  const out: Range[] = [];
  for (const r of [...rs].sort((a, b) => a.s - b.s)) {
    const last = out[out.length - 1];
    if (last && r.s <= last.e) last.e = Math.max(last.e, r.e);
    else out.push({ ...r });
  }
  return out;
}

function ranges(v: unknown, field: string, win: DayWindow): V<Range[]> {
  if (v === undefined) return { ok: true, value: [] };
  if (!Array.isArray(v) || v.length > MAX_RANGES) return bad(field, `Add up to ${MAX_RANGES} times per day.`);
  const out: Range[] = [];
  for (let i = 0; i < v.length; i++) {
    const r: unknown = v[i];
    if (!isObj(r) || !isInt(r.start) || !isInt(r.end) || r.start < 0 || r.end < 0 || r.start >= 2 * DAY || r.end > 2 * DAY) {
      return bad(`${field}[${i}]`, 'Each time needs a valid start and end.');
    }
    const s = r.start;
    const e = r.end < s && s < DAY ? r.end + DAY : r.end;
    if (e <= s) return bad(`${field}[${i}]`, 'Each time needs to end after it starts.');
    if (s < win.start || e > win.end) return bad(`${field}[${i}]`, "Keep your times inside the organiser's window for that day.");
    out.push({ s, e });
  }
  return { ok: true, value: merge(out) };
}

function condition(
  v: unknown,
  field: string,
  self: ParticipantRow,
  people: readonly ParticipantRow[],
): V<{ type: string; payload: Record<string, unknown>; view: ConditionView }> {
  if (!isObj(v)) return bad(field, 'That condition is not valid.');
  if (v.source !== 'fallback' && v.source !== 'llm') return bad(field, 'Conditions must be confirmed before saving.');
  switch (v.type) {
    case 'requires':
    case 'requires_any': {
      if (!Array.isArray(v.people) || v.people.length === 0) return bad(field, 'Say who needs to be there.');
      if (v.people.length > MAX_PEOPLE) return bad(field, `Name up to ${MAX_PEOPLE} people.`);
      const refs: string[] = [];
      for (const p of v.people as unknown[]) {
        let ref: string;
        if (isObj(p) && typeof p.id === 'string') {
          if (!people.some((x) => x.id === p.id)) return bad(field, "That person isn't in this event.");
          ref = p.id;
        } else if (isObj(p) && typeof p.name === 'string') {
          const n = normaliseName(p.name);
          if (!n || [...n].length > 30 || /[\u0000-\u001f\u007f]/.test(n)) return bad(field, 'Each name needs 1 to 30 characters.');
          const match = people.find((x) => x.normalisedName === n);
          ref = match ? match.id : pendingRef(n);
        } else {
          return bad(field, 'Say who needs to be there.');
        }
        if (ref === self.id || ref === pendingRef(self.normalisedName))
          return bad(field, "A condition can't depend on you coming. If nothing else needs to happen, choose Yes.");
        if (!refs.includes(ref)) refs.push(ref);
      }
      const payload = { type: v.type, people: refs };
      return { ok: true, value: { type: v.type, payload, view: toView({ type: v.type, payload }, people) } };
    }
    case 'min_attendees':
      if (!isInt(v.n) || v.n < 2 || v.n > MAX_PARTICIPANTS)
        return bad(field, `The number of people must be between 2 and ${MAX_PARTICIPANTS}.`);
      return {
        ok: true,
        value: { type: 'min_attendees', payload: { type: 'min_attendees', n: v.n }, view: { type: 'min_attendees', n: v.n } },
      };
    case 'time': {
      const es = v.earliest_start;
      const le = v.latest_end;
      const okMin = (m: unknown) => m === undefined || (isInt(m) && m >= 0 && m <= 2 * DAY);
      if ((es === undefined && le === undefined) || !okMin(es) || !okMin(le) || (isInt(es) && isInt(le) && es >= le))
        return bad(field, 'That time condition is not valid.');
      const payload: Record<string, unknown> = { type: 'time' };
      if (es !== undefined) payload.earliest_start = es;
      if (le !== undefined) payload.latest_end = le;
      return { ok: true, value: { type: 'time', payload, view: payload as ConditionView } };
    }
    case 'unresolvable': {
      const s = typeof v.summary === 'string' ? v.summary.replace(/\s+/g, ' ').trim() : '';
      if (!s || [...s].length > SUMMARY_MAX || /[\u0000-\u001f\u007f]/.test(s)) return bad(field, 'That condition needs a short summary.');
      return {
        ok: true,
        value: { type: 'unresolvable', payload: { type: 'unresolvable', summary: s }, view: { type: 'unresolvable', summary: s } },
      };
    }
    default:
      return bad(field, 'That kind of condition is not supported.');
  }
}

/**
 * Validates a whole response against the event's days and participants. Read-backs are regenerated here from the
 * structured result, so what is stored always matches what it means.
 */
export function validateResponse(
  body: unknown,
  days: readonly DayWindow[],
  self: ParticipantRow,
  people: readonly ParticipantRow[],
): V<ValidDay[]> {
  if (!isObj(body) || !Array.isArray(body.days)) return bad('days', 'Send your response as a list of days.');
  if (body.days.length === 0) return bad('days', 'Mark at least one day, or let us know none of them work.');
  if (body.days.length > days.length) return bad('days', 'Each day can only be answered once.');
  const seen = new Set<string>();
  const out: ValidDay[] = [];
  for (let i = 0; i < body.days.length; i++) {
    const f = `days[${i}]`;
    const d: unknown = body.days[i];
    if (!isObj(d)) return bad(f, 'Each day needs an answer.');
    const win = days.find((x) => x.date === d.date);
    if (!win) return bad(`${f}.date`, "That day isn't one of this event's days.");
    if (seen.has(win.date)) return bad(`${f}.date`, 'Each day can only be answered once.');
    seen.add(win.date);
    const w = d.willingness;
    if (w !== 'yes' && w !== 'if' && w !== 'no') return bad(`${f}.willingness`, "Let us know whether you'd actually go.");
    const av = ranges(d.available, `${f}.available`, win);
    if ('error' in av) return av;
    const fav = ranges(d.favourite, `${f}.favourite`, win);
    if ('error' in fav) return fav;
    if (w !== 'no' && av.value.length === 0) return bad(`${f}.available`, 'Add the times you could make it.');
    if (!fav.value.every((r) => av.value.some((a) => a.s <= r.s && r.e <= a.e)))
      return bad(`${f}.favourite`, 'Favourite times must be inside your available times.');
    const rawConds = d.conditions === undefined ? [] : d.conditions;
    if (!Array.isArray(rawConds) || rawConds.length > MAX_CONDITIONS)
      return bad(`${f}.conditions`, `Add up to ${MAX_CONDITIONS} conditions per day.`);
    if (w !== 'if' && rawConds.length) return bad(`${f}.conditions`, 'Conditions only apply to days you answered If….');
    if (w === 'if' && rawConds.length === 0) return bad(`${f}.conditions`, 'Confirm what it depends on, or choose Yes.');
    const conditions: ValidDay['conditions'] = [];
    for (let j = 0; j < rawConds.length; j++) {
      const c = condition(rawConds[j], `${f}.conditions[${j}]`, self, people);
      if ('error' in c) return c;
      conditions.push({
        type: c.value.type,
        payload: c.value.payload,
        readback: readback(c.value.view),
        source: (rawConds[j] as { source: 'llm' | 'fallback' }).source,
      });
    }
    out.push({ date: win.date, willingness: w, available: av.value, favourite: fav.value, conditions });
  }
  return { ok: true, value: out.sort((a, b) => (a.date < b.date ? -1 : 1)) };
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
