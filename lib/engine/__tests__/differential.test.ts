/* Differential test against the original recommend.ts (unchanged, read-only). The original only knows
   "person" (by name) and "min" conditions and works per day, so events use only requires / min_attendees and
   are translated to its shape: ids become display names, and If… with no conditions becomes No (PRODUCT-RULES
   §4: such a day isn't free). They are compared where they must agree:
   - when every answered day's range is the whole window and the slot is the whole window, groups match, and
     the engine's free count is the original's Yes/If… candidates;
   - on any event, every slot's group is a subset of the original's day-level group;
   - given the same people, the display window and dots are identical. */
import { describe, expect, it } from 'vitest';
import { bestWindow, rankSlots, slotWindow } from '../index';
import type { EventData } from '../types';
import { rng, randomEvent } from './gen';
import * as old from '../../ui/utils/recommend';
import { fmtCompact } from '../../ui/utils/format';

const GROUP_ONLY = { minPeople: 0, maxPeople: 16, minSlots: 1, maxSlots: 8, groupOnly: true };

/** The event in recommend.ts's shape. Ids of people who never respond become names nobody has. */
function legacy(ev: EventData): any {
  const nameOf = new Map(ev.responses.map((r) => [r.id, r.who]));
  return {
    ...ev,
    responses: ev.responses.map((r) => {
      const will: Record<string, unknown> = {},
        conds: Record<string, unknown> = {};
      for (const sl of ev.slots) {
        const cs = r.conds[sl.id] || [];
        if (sl.id in r.will) will[sl.id] = r.will[sl.id] === 'if' && !cs.length ? 'no' : r.will[sl.id];
        conds[sl.id] = cs.flatMap((c): object[] =>
          c.type === 'requires'
            ? c.people.map((p) => ({ type: 'person', name: nameOf.get(p) ?? p }))
            : c.type === 'min_attendees'
              ? [{ type: 'min', n: String(c.n) }]
              : [],
        );
      }
      return { ...r, will, conds };
    }),
  };
}
const whoOf = (ev: EventData) => new Map(ev.responses.map((r) => [r.id, r.who]));

/** Every answered day gets the whole organiser window as its only range, and one slot spans the window. */
function wholeWindow(ev: EventData): EventData {
  for (const r of ev.responses)
    for (const sl of ev.slots) if (r.avail[sl.id] !== undefined) r.ranges[sl.id] = [{ s: ev.win.s, e: ev.win.e }];
  ev.duration = ev.win.e - ev.win.s;
  return ev;
}

describe('differential: recommend.ts vs engine', () => {
  it('1,000 random events, everyone free for the whole window: identical groups and counts', () => {
    const rand = rng(20261018);
    let slotsChecked = 0,
      eliminations = 0;
    for (let i = 0; i < 1000; i++) {
      const ev = wholeWindow(randomEvent(rand, GROUP_ONLY));
      const lv = legacy(ev);
      const who = whoOf(ev);
      for (const d of rankSlots(ev).days) {
        const o: any = old.dayStats(lv, d.slot.id); // untyped original (@ts-nocheck)
        const willing = lv.responses.filter(
          (x: any) => (x.avail[d.slot.id] || 0) > 0 && (x.will[d.slot.id] === 'yes' || x.will[d.slot.id] === 'if'),
        ).length;
        expect(d.slots).toHaveLength(1);
        expect({ event: i, slot: d.slot.id, free: d.free, go: d.go, group: d.group.map((id) => who.get(id)) }).toEqual({
          event: i,
          slot: d.slot.id,
          free: willing,
          go: o.go,
          group: o.viable.map((x: any) => x.who),
        });
        if (d.rounds.length) eliminations++;
      }
      slotsChecked += ev.slots.length;
    }
    expect(slotsChecked).toBeGreaterThan(3000);
    expect(eliminations).toBeGreaterThan(500);
  });

  it("1,000 random events: every slot's group is within the original's day-level group", () => {
    const rand = rng(7);
    let smaller = 0;
    for (let i = 0; i < 1000; i++) {
      const ev = randomEvent(rand, GROUP_ONLY);
      ev.duration = 60;
      const lv = legacy(ev);
      const who = whoOf(ev);
      for (const d of rankSlots(ev).days) {
        const dayLevel = (old.dayStats(lv, d.slot.id) as any).viable.map((x: any) => x.who);
        for (const t of d.slots) expect(t.group.every((id) => dayLevel.includes(who.get(id)))).toBe(true);
        if (d.slots.length && d.go < dayLevel.length) smaller++;
      }
    }
    expect(smaller).toBeGreaterThan(500); // overlap really changes results on realistic data
  });

  it('1,000 random events: same display window and dots as dayDots for the same people', () => {
    const rand = rng(99);
    for (let i = 0; i < 1000; i++) {
      const ev = randomEvent(rand, GROUP_ONLY);
      const lv = legacy(ev);
      for (const d of rankSlots(ev).days) {
        const dd: any = old.dayDots(lv, d);
        // dayDots uses everyone marked free that day, not the slot's free list.
        const dayFree = ev.responses.filter((r) => (r.avail[d.slot.id] || 0) > 0);
        const w = slotWindow(ev.win, d.slot, { viable: d.viable, freeList: dayFree });
        expect({ time: w.window ? fmtCompact(w.window.s, w.window.e) : '', free: w.free, go: w.go }).toEqual({
          time: dd.time,
          free: dd.free,
          go: dd.go,
        });
        expect(bestWindow(ev.win, d.slot.id, d.viable)).toEqual(old.bestWindow(lv, d.slot.id, d.viable));
      }
    }
  });
});
