/* Seeded random event generator for the engine tests and benchmark. Produces engine input with awkward but
   possible values: missing keys, nulls, ranges outside the window, If… with no conditions, conditions on Yes
   days, references to roster members who never respond, empty time conditions. Participant ids differ from
   display names. */
import type { Condition, EventData, Range, Response, Slot, TimeCondition, Willingness } from '../types';

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  'Alex',
  'Sam',
  'Jess',
  'Drew',
  'Maya',
  'Nina',
  'Leo',
  'Kai',
  'Priya',
  'Tom',
  'Ana',
  'Ben',
  'Cleo',
  'Dev',
  'Eli',
  'Fay',
  'Gus',
  'Hana',
  'Ivo',
  'June',
  'Kofi',
  'Lia',
  'Mo',
  'Ned',
  'Oli',
  'Pia',
  'Quin',
  'Raj',
  'Sol',
  'Tia',
];
const N_VALUES = [1, 2, 2, 3, 3, 4, 5, 6, 8, 12, 20, 0];
/** Participant id for a display name. */
export const idOf = (name: string) => 'id:' + name.toLowerCase();

export interface GenOptions {
  minPeople: number;
  maxPeople: number;
  minSlots: number;
  maxSlots: number;
  /** Probability that a response for a slot is "If…" (to exercise elimination). */
  ifRate?: number;
  /** Only `requires` and `min_attendees` (the conditions lib/ui/utils/recommend.ts can express). */
  groupOnly?: boolean;
}

export function randomEvent(rand: () => number, o: GenOptions): EventData {
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const nSlots = int(o.minSlots, o.maxSlots);
  const slots: Slot[] = Array.from({ length: nSlots }, (_, i) => ({ id: 's' + i, title: 'Slot ' + i }));
  const ws = int(0, 88) * 15;
  const we = Math.min(1440, ws + int(4, 40) * 15);
  const win = { s: ws, e: we };
  const steps = (win.e - win.s) / 15;
  const nPeople = int(o.minPeople, o.maxPeople);
  const pool = NAMES.slice().sort(() => rand() - 0.5);
  const people = pool.slice(0, nPeople);
  const roster = pool.slice(nPeople, nPeople + 3); // in the event but never respond
  const ifRate = o.ifRate ?? 0.45;
  const someone = () => idOf(rand() < 0.85 && people.length ? pick(people) : pick(roster.length ? roster : NAMES));
  const someIds = (max: number) => Array.from({ length: int(1, max) }, someone);

  const condition = (): Condition => {
    const k = rand();
    if (o.groupOnly) return k < 0.6 ? { type: 'requires', people: someIds(2) } : { type: 'min_attendees', n: pick(N_VALUES) };
    if (k < 0.35) return { type: 'requires', people: someIds(2) };
    if (k < 0.5) return { type: 'requires_any', people: someIds(3) };
    if (k < 0.75) return { type: 'min_attendees', n: pick(N_VALUES) };
    if (k < 0.9) {
      const c: TimeCondition = { type: 'time' };
      if (rand() < 0.6) c.earliest_start = win.s + int(0, steps) * 15;
      if (rand() < 0.6) c.latest_end = win.s + int(0, steps) * 15;
      return c;
    }
    return { type: 'unresolvable', summary: 'depends on the weather' };
  };

  const responses: Response[] = people.map((who, pi) => {
    const r: Response = { id: idOf(who), who, role: pi === 0 ? 'organiser' : 'guest', avail: {}, ranges: {}, will: {}, conds: {} };
    for (const sl of slots) {
      const roll = rand();
      if (roll < 0.05) continue; // slot missing from this response entirely
      r.avail[sl.id] = roll < 0.3 ? 0 : roll < 0.8 ? 1 : 2;
      const w = rand();
      const will: Willingness | undefined =
        w < ifRate ? 'if' : w < ifRate + 0.3 ? 'yes' : w < ifRate + 0.4 ? 'no' : w < ifRate + 0.47 ? null : undefined;
      if (will !== undefined) r.will[sl.id] = will;
      const ranges: Range[] = [];
      const nr = int(0, 3);
      for (let k = 0; k < nr; k++) {
        const s = Math.max(0, win.s + int(-4, Math.max(0, steps)) * 15);
        ranges.push({ s, e: Math.min(1440 + 60, s + int(1, 24) * 15) });
      }
      if (rand() < 0.95) r.ranges[sl.id] = ranges;
      const cr = rand();
      if (cr < 0.15) r.conds[sl.id] = null;
      else if (cr < 0.25) {
        /* missing */
      } else r.conds[sl.id] = Array.from({ length: int(0, 3) }, condition);
    }
    return r;
  });
  return { slots, win, responses };
}
