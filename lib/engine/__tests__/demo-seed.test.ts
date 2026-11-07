/* PRODUCT-RULES §8: Fri + Sat, window 18:00–23:00, duration 3 h. Everyone is available 19:00–22:00 on the
   days they didn't answer No. Participant ids are the display names. */
import { describe, expect, it } from 'vitest';
import { rankSlots } from '../index';
import type { Condition, EventData, Response, Willingness } from '../types';

const h = (hour: number) => hour * 60;
const SLOT = { s: h(19), e: h(22) };
const DAYS = [
  { id: 'fri', iso: '2026-10-23' },
  { id: 'sat', iso: '2026-10-24' },
];

function person(who: string, fri: Willingness, sat: Willingness, conds: { fri?: Condition[]; sat?: Condition[] } = {}): Response {
  const range = (w: Willingness) => (w === 'no' ? [] : [{ ...SLOT }]);
  return {
    id: who,
    who,
    role: 'guest',
    avail: { fri: 1, sat: 1 },
    will: { fri, sat },
    ranges: { fri: range(fri), sat: range(sat) },
    conds: { fri: conds.fri ?? null, sat: conds.sat ?? null },
  };
}
const needs = (id: string): Condition => ({ type: 'requires', people: [id] });
const atLeast = (n: number): Condition => ({ type: 'min_attendees', n });

const SEED = [
  person('Alex', 'yes', 'yes'),
  person('Ben', 'yes', 'yes'),
  person('Chloe', 'yes', 'yes'),
  person('Dan', 'yes', 'no'),
  person('Finn', 'if', 'if', { fri: [needs('Ella')], sat: [needs('Ella')] }),
  person('Grace', 'if', 'no', { fri: [atLeast(7)] }),
  person('Harry', 'if', 'no', { fri: [needs('Finn')] }),
  person('Jess', 'no', 'yes'),
];
const ella = (fri: Willingness, cond?: Condition): Response => person('Ella', fri, 'yes', cond ? { fri: [cond] } : {});

function run(responses: Response[]) {
  const ev: EventData = { slots: DAYS, win: { s: h(18), e: h(23) }, duration: 180, responses };
  const r = rankSlots(ev);
  return {
    counts: r.days.map((d) => [d.slot.id, d.free, d.go]),
    windows: r.days.map((d) => d.window),
    best: r.best?.slot.id ?? null,
  };
}

describe('PRODUCT-RULES §8 seed', () => {
  it('stage 1, before Ella: Fri 7/4, Sat 5/4, Friday, both 19:00–22:00', () => {
    const r = run(SEED);
    expect(r.counts).toEqual([
      ['fri', 7, 4],
      ['sat', 5, 4],
    ]);
    expect(r.best).toBe('fri');
    expect(r.windows).toEqual([SLOT, SLOT]);
  });

  it('stage 2, Ella joins Yes on both days: Fri 8/8, Sat 6/6, Friday', () => {
    const r = run([...SEED, ella('yes')]);
    expect(r.counts).toEqual([
      ['fri', 8, 8],
      ['sat', 6, 6],
    ]);
    expect(r.best).toBe('fri');
    expect(r.windows).toEqual([SLOT, SLOT]);
  });

  it('stage 3, Ella needs Jess on Friday: Fri 8/4, Sat 6/6, Saturday 7–10pm', () => {
    const r = run([...SEED, ella('if', needs('Jess'))]);
    expect(r.counts).toEqual([
      ['fri', 8, 4],
      ['sat', 6, 6],
    ]);
    expect(r.best).toBe('sat');
    expect(r.windows).toEqual([SLOT, SLOT]);
  });
});
