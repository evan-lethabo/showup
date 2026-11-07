// Validates a guest's whole response before it is stored. Pure: no database access.
import type { Range } from '../engine/types';
import { normaliseName, readback, type ConditionView } from '../conditions/fallback';
import { type ValidationError } from './validate';
import { MAX_PARTICIPANTS, pendingRef, toView, type ParticipantRow } from './participant-refs';

const MAX_RANGES = 12;
const MAX_CONDITIONS = 6;
const MAX_PEOPLE = 10;
const SUMMARY_MAX = 120;
const DAY = 1440;

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
