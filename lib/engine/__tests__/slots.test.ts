/* Fixed-duration slots (PRODUCT-RULES §2, §3, §6). Slots start every 30 minutes from the day's window start
   and fit inside it. Available = one range (after merging a person's touching/overlapping ranges) covers the
   whole slot; Free = Available and not No; Favourites = viable people whose Favourite range covers the slot. */
import { describe, expect, it } from 'vitest';
import { rankSlots, slotStats } from '../index';
import type { Condition, EventData, Range, Response, Slot, Willingness } from '../types';

const h = (hour: number) => hour * 60;
const WIN: Range = { s: h(18), e: h(23) };

type Answer = { avail?: number; will?: Willingness; ranges?: Range[]; favs?: Range[]; conds?: Condition[] };
/** One response; every answer defaults to Free, Yes, the whole 6–11pm window, no conditions. */
function person(who: string, answers: Record<string, Answer>): Response {
  const r: Response = { id: who, who, role: 'guest', avail: {}, ranges: {}, will: {}, conds: {} };
  for (const [id, a] of Object.entries(answers)) {
    r.avail[id] = a.avail ?? 1;
    r.will[id] = a.will === undefined ? 'yes' : a.will;
    r.ranges[id] = a.ranges ?? [{ ...WIN }];
    r.conds[id] = a.conds ?? null;
    if (a.favs) (r.favs ??= {})[id] = a.favs;
  }
  return r;
}
const event = (slots: Slot[], responses: Response[], extra: Partial<EventData> = {}): EventData => ({
  slots,
  win: WIN,
  responses,
  ...extra,
});
const needs = (id: string): Condition => ({ type: 'requires', people: [id] });
const starts = (ev: EventData, id: string) =>
  rankSlots(ev)
    .days.find((d) => d.slot.id === id)!
    .slots.map((t) => t.s);

describe('slot generation', () => {
  it('starts every 30 minutes from the window start; every slot fits inside the window', () => {
    const ev = event([{ id: 'a' }], [person('Ana', { a: {} })]);
    expect(starts(ev, 'a')).toEqual([h(18), h(18.5), h(19), h(19.5), h(20), h(20.5), h(21)]);
    expect(rankSlots(ev).days[0]!.slots.every((t) => t.e === t.s + 120 && t.e <= WIN.e)).toBe(true);
    // An off-grid window start still gets slots, stepping from the window start.
    const odd = event([{ id: 'a' }], [person('Ana', { a: { ranges: [{ s: 1155, e: 1320 }] } })], { win: { s: 1155, e: 1320 } });
    expect(starts(odd, 'a')).toEqual([1155, 1185]);
  });

  it('duration defaults to 120 minutes and follows the event', () => {
    const ev = event([{ id: 'a' }], [person('Ana', { a: {} })], { duration: 90 });
    expect(starts(ev, 'a')).toEqual([h(18), h(18.5), h(19), h(19.5), h(20), h(20.5), h(21), h(21.5)]);
    expect(slotStats('a', ev.responses, WIN).slots).toHaveLength(7);
  });

  it('a per-day window overrides the event window', () => {
    const ev = event([{ id: 'a', win: { s: h(20), e: h(23) } }, { id: 'b' }], [person('Ana', { a: {}, b: {} })]);
    expect(starts(ev, 'a')).toEqual([h(20), h(20.5), h(21)]);
    expect(starts(ev, 'b')[0]).toBe(h(18));
  });

  it('a window shorter than the duration has no slots and no recommendation', () => {
    const ev = event([{ id: 'a' }], [person('Ana', { a: {} })], { win: { s: h(18), e: h(19.5) } });
    const r = rankSlots(ev);
    expect(r.days[0]!.slots).toEqual([]);
    expect([r.days[0]!.window, r.days[0]!.go, r.days[0]!.free]).toEqual([null, 0, 0]);
    expect(r.best).toBeNull();
  });

  it('rejects a duration that is not a positive number', () => {
    expect(() => slotStats('a', [], WIN, { duration: 0 })).toThrow();
    expect(() => slotStats('a', [], WIN, { duration: NaN })).toThrow();
  });
});

describe('Available and Free', () => {
  it('A available 19–21, B 21–23, duration 2 h: no slot has both free', () => {
    const ev = event(
      [{ id: 'a' }],
      [person('A', { a: { ranges: [{ s: h(19), e: h(21) }] } }), person('B', { a: { ranges: [{ s: h(21), e: h(23) }] } })],
    );
    const st = rankSlots(ev).days[0]!;
    expect(Math.max(...st.slots.map((t) => t.free))).toBe(1);
    expect(st.slots.filter((t) => t.free > 0).map((t) => [t.s, t.group])).toEqual([
      [h(19), ['A']],
      [h(21), ['B']],
    ]);
  });

  it('a range must cover the whole slot', () => {
    const ev = event([{ id: 'a' }], [person('A', { a: { ranges: [{ s: h(19), e: h(20.5) }] } })]);
    expect(rankSlots(ev).days[0]!.slots.every((t) => t.free === 0)).toBe(true);
    expect(rankSlots(ev).best).toBeNull();
  });

  it("a person's touching or overlapping ranges merge; a real gap is never bridged", () => {
    const ev = event(
      [{ id: 'a' }],
      [
        person('Touch', {
          a: {
            ranges: [
              { s: h(20), e: h(21) },
              { s: h(19), e: h(20) },
            ],
          },
        }),
        person('Overlap', {
          a: {
            ranges: [
              { s: h(19), e: h(20.5) },
              { s: h(20), e: h(21) },
            ],
          },
        }),
        person('Gap', {
          a: {
            ranges: [
              { s: h(19), e: h(20) },
              { s: h(20.25), e: h(21) },
            ],
          },
        }),
      ],
    );
    const st = rankSlots(ev).days[0]!;
    expect(st.slots.find((t) => t.s === h(19))!.group).toEqual(['Touch', 'Overlap']);
    expect(st.slots.some((t) => t.group.includes('Gap'))).toBe(false);
  });

  it('touching ranges of different people do not combine', () => {
    const ev = event(
      [{ id: 'a' }],
      [person('A', { a: { ranges: [{ s: h(19), e: h(20) }] } }), person('B', { a: { ranges: [{ s: h(20), e: h(21) }] } })],
      { duration: 60 },
    );
    expect(rankSlots(ev).days[0]!.slots.find((t) => t.s === h(19.5))!.free).toBe(0);
  });

  it('Free excludes No and missing willingness; Not free never counts; If… without conditions is not free', () => {
    const ev = event(
      [{ id: 'a' }],
      [
        person('Ana', { a: {} }),
        person('Ben', { a: { will: 'if' } }),
        person('Cleo', { a: { will: 'no' } }),
        person('Dev', { a: { will: null } }),
        person('Eli', { a: { avail: 0 } }),
      ],
    );
    const st = slotStats('a', ev.responses, WIN);
    expect([st.free, st.go, st.group]).toEqual([1, 1, ['Ana']]);
    expect(st.freeList.map((r) => r.who)).toEqual(['Ana']);
  });

  it('free is counted per slot, not per day', () => {
    const ev = event([{ id: 'a' }], [person('Ana', { a: {} }), person('Ben', { a: { ranges: [{ s: h(21), e: h(23) }] } })]);
    const st = slotStats('a', ev.responses, WIN);
    expect(st.slots.find((t) => t.s === h(18))!.free).toBe(1);
    expect([st.window, st.free, st.go]).toEqual([{ s: h(21), e: h(23) }, 2, 2]);
  });
});

describe('cross-midnight', () => {
  const LATE: Range = { s: h(22), e: h(25) }; // 10pm–1am

  it('a 10pm–1am window has slots on the linear minute axis; a slot may end past 1440', () => {
    const ev = event([{ id: 'a' }], [person('Ana', { a: { ranges: [{ s: h(23), e: h(25) }] } })], { win: LATE });
    const st = rankSlots(ev).days[0]!;
    expect(st.slots.map((t) => [t.s, t.e])).toEqual([
      [1320, 1440],
      [1350, 1470],
      [1380, 1500],
    ]);
    expect([st.window, st.go]).toEqual([{ s: 1380, e: 1500 }, 1]);
  });

  it('slots belong to the day they start on: Friday 11pm–1am is earlier than Saturday 10pm', () => {
    const ev = event(
      [
        { id: 'fri', iso: '2026-10-23' },
        { id: 'sat', iso: '2026-10-24' },
      ],
      [person('Ana', { fri: { ranges: [{ s: h(23), e: h(25) }] }, sat: { ranges: [{ s: h(22), e: h(24) }] } })],
      { win: LATE },
    );
    expect(rankSlots(ev).best?.slot.id).toBe('fri');
  });
});

describe('Favourite ranges', () => {
  it('count only when the Favourite range covers the whole slot', () => {
    const ev = event(
      [
        { id: 'a', iso: '2026-10-23' },
        { id: 'b', iso: '2026-10-24' },
      ],
      [person('Ana', { a: { favs: [{ s: h(19), e: h(20) }] }, b: { favs: [{ s: h(19), e: h(21) }] } }), person('Ben', { a: {}, b: {} })],
    );
    const r = rankSlots(ev);
    expect(r.days.map((d) => [d.slot.id, d.go, d.favourites])).toEqual([
      ['a', 2, 0],
      ['b', 2, 1],
    ]);
    expect(r.best?.slot.id).toBe('b');
    expect(r.best?.window).toEqual({ s: h(19), e: h(21) }); // the Favourite beats the earlier 6–8pm slot
    expect(rankSlots(ev, { favourites: false }).best?.window).toEqual({ s: h(18), e: h(20) });
  });

  it('a Favourite from someone who is not viable does not count', () => {
    const ev = event(
      [{ id: 'a' }],
      [person('Ana', { a: {} }), person('Cleo', { a: { will: 'if', conds: [needs('Zed')], favs: [{ ...WIN }] } })],
    );
    expect([slotStats('a', ev.responses, WIN).go, slotStats('a', ev.responses, WIN).favourites]).toEqual([1, 0]);
  });

  it('legacy Favourite day (avail = 2, no favs) uses the availability ranges; an explicit empty list stays empty', () => {
    const legacy = person('Ana', { a: { avail: 2, ranges: [{ s: h(19), e: h(21) }] } });
    expect(slotStats('a', [legacy], WIN).favourites).toBe(1);
    const explicit = { ...legacy, favs: { a: [] } };
    expect(slotStats('a', [explicit], WIN).favourites).toBe(0);
    const otherDayOnly = { ...legacy, favs: { b: [{ s: h(19), e: h(21) }] } };
    expect(slotStats('a', [otherDayOnly], WIN).favourites).toBe(0);
  });
});

describe('ranking and representative slots', () => {
  it('chronological tie-break is transitive when only some days have dates (falls back to event order)', () => {
    // Old comparator: y < x by order, x < z by order, z < y by date: a cycle that picked z.
    const ev = event(
      [{ id: 'y', iso: '2026-10-24' }, { id: 'x' }, { id: 'z', iso: '2026-10-23' }],
      [person('Ana', { y: {}, x: {}, z: {} })],
    );
    expect(rankSlots(ev).best?.slot.id).toBe('y');
  });

  it('same date and start: creation order decides', () => {
    const ev = event(
      [
        { id: 'p', iso: '2026-10-23' },
        { id: 'q', iso: '2026-10-23' },
      ],
      [person('Ana', { p: {}, q: {} })],
    );
    expect(rankSlots(ev).best?.slot.id).toBe('p');
  });

  it('a day with nobody viable shows its most-free slot (earliest on a tie); no viable slot anywhere → no plan', () => {
    const ev = event(
      [{ id: 'a' }, { id: 'b' }],
      [
        person('Ana', { a: { will: 'if', conds: [needs('Zed')] }, b: { will: 'if', conds: [needs('Zed')] } }),
        person('Ben', { a: { will: 'if', conds: [needs('Zed')], ranges: [{ s: h(21), e: h(23) }] } }),
      ],
    );
    const r = rankSlots(ev);
    expect(r.best).toBeNull();
    expect(r.days.map((d) => [d.slot.id, d.window, d.free, d.go])).toEqual([
      ['a', { s: h(21), e: h(23) }, 2, 0],
      ['b', { s: h(18), e: h(20) }, 1, 0],
    ]);
  });
});

describe('no fixed length (duration: null)', () => {
  it('counts a person who is free at the start, however soon they leave', () => {
    const early = person('Early', { a: { ranges: [{ s: h(19), e: h(20) }] } });
    const late = person('Late', { a: { ranges: [{ s: h(20), e: h(23) }] } });
    const ev = event([{ id: 'a' }], [early, late], { duration: null });
    const at = (s: number) => rankSlots(ev).days[0]!.slots.find((t) => t.s === s)!;
    expect([at(h(19)).free, at(h(19)).go]).toEqual([1, 1]);
    expect([at(h(19.5)).free]).toEqual([1]);
    expect([at(h(20)).free, at(h(20)).go]).toEqual([1, 1]);
    // With a 2 h length the same early person is not free for any slot (original behaviour).
    const fixed = event([{ id: 'a' }], [early, late], { duration: 120 });
    expect(rankSlots(fixed).days[0]!.slots.some((t) => t.s === h(19) && t.free > 0)).toBe(false);
  });

  it('picks the earliest start among equally good ones and offers starts up to the window end', () => {
    const ev = event([{ id: 'a' }], [person('Ana', { a: {} }), person('Bo', { a: {} })], { duration: null });
    const day = rankSlots(ev).days[0]!;
    expect(day.window?.s).toBe(h(18));
    expect(day.slots[0]!.s).toBe(h(18));
    expect(day.slots[day.slots.length - 1]!.s).toBe(h(22.5));
  });

  it('still honours time conditions: "until 7pm" counts for a 6pm start but not a 7pm one', () => {
    const cond: Condition = { type: 'time', latest_end: h(19) };
    const ev = event([{ id: 'a' }], [person('Cy', { a: { will: 'if', conds: [cond] } })], { duration: null });
    const free = (s: number) => rankSlots(ev).days[0]!.slots.find((t) => t.s === s)!.free;
    expect([free(h(18)), free(h(18.5)), free(h(19))]).toEqual([1, 1, 0]);
  });
});
