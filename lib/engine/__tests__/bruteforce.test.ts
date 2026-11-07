/* Proves the greatest-fixed-point claim per fixed-duration slot on small events, and checks the fixed-point
   property on large ones. Uses its own condition evaluator, a 15-minute coverage scan and its own reading of
   time conditions (the slot must lie inside them), written from PRODUCT-RULES §3–§6, not the engine's code. */
import { describe, expect, it } from 'vitest';
import { slotStats } from '../index';
import type { Condition, EventData, Range, Response } from '../types';
import { rng, randomEvent } from './gen';

const DURATIONS = [30, 60, 90, 120, 180];

/** Conditions only apply on an If… day. */
const condsOf = (r: Response, id: string): Condition[] => (r.will[id] === 'if' ? r.conds[id] || [] : []);
const unresolvable = (r: Response, id: string) => condsOf(r, id).some((c) => c.type === 'unresolvable');
/** Spec: requires = all listed ids in the set, requires_any = at least one, min_attendees = set size ≥ n. */
function groupHolds(c: Condition, set: readonly Response[]): boolean {
  if (c.type === 'requires') return c.people.every((p) => set.some((g) => g.id === p));
  if (c.type === 'requires_any') return c.people.some((p) => set.some((g) => g.id === p));
  if (c.type === 'min_attendees') return set.length >= c.n;
  return true;
}
const groupOk = (r: Response, id: string, set: readonly Response[]) => condsOf(r, id).every((c) => groupHolds(c, set));
/** Every 15-minute step of [s, e) lies inside one of the ranges (generated times sit on 15-minute steps). */
const covered = (ranges: readonly Range[] | undefined, s: number, e: number) => {
  for (let t = s; t < e; t += 15) if (!(ranges || []).some((rg) => rg.s <= t && rg.e >= t + 15)) return false;
  return true;
};
/** The slot respects every time condition. */
const inTime = (r: Response, id: string, s: number, e: number) =>
  condsOf(r, id).every(
    (c) =>
      c.type !== 'time' || ((c.earliest_start === undefined || s >= c.earliest_start) && (c.latest_end === undefined || e <= c.latest_end)),
  );
/** Free for [s, e): not Not free; Yes, or If… with at least one condition; inside time conditions; available throughout. */
const freeFor = (ev: EventData, id: string, s: number, e: number) =>
  ev.responses.filter(
    (r) =>
      r.avail[id] !== 0 &&
      (r.will[id] === 'yes' || (r.will[id] === 'if' && condsOf(r, id).length > 0)) &&
      inTime(r, id, s, e) &&
      covered(r.ranges[id], s, e),
  );
/** Favourite ranges: `favs` when the response has them, else (legacy) the availability ranges of a Favourite day. */
const favRanges = (r: Response, id: string) => (r.favs ? r.favs[id] : r.avail[id] === 2 ? r.ranges[id] : undefined);
const tentativeOf = (free: readonly Response[], viable: readonly Response[], id: string) =>
  free.filter((r) => unresolvable(r, id) && groupOk(r, id, [...viable, r]));

describe('greatest fixed point per slot (brute force, n ≤ 10)', () => {
  it('engine slots and pick = the largest self-consistent group of free people without unresolvable conditions; tentative per spec (2,000 events)', () => {
    const rand = rng(424242);
    let checked = 0,
      nontrivial = 0,
      tentativeSeen = 0,
      timeLimited = 0;
    for (let i = 0; i < 2000; i++) {
      const ev = randomEvent(rand, { minPeople: 1, maxPeople: 10, minSlots: 1, maxSlots: 4, ifRate: 0.6 });
      const dur = DURATIONS[i % DURATIONS.length]!;
      for (const sl of ev.slots) {
        const st = slotStats(sl, ev.responses, ev.win, { duration: dur });
        const want: { s: number; group: string[]; free: number; tentative: string[]; fav: number }[] = [];
        for (let s = ev.win.s; s + dur <= ev.win.e; s += 30) {
          const free = freeFor(ev, sl.id, s, s + dur);
          const cand = free.filter((r) => !unresolvable(r, sl.id));
          let bestMasks: number[] = [];
          let bestSize = -1;
          let union = 0;
          for (let mask = 0; mask < 1 << cand.length; mask++) {
            const g = cand.filter((_, k) => mask & (1 << k));
            if (!g.every((r) => groupOk(r, sl.id, g))) continue;
            union |= mask;
            if (g.length > bestSize) {
              bestSize = g.length;
              bestMasks = [mask];
            } else if (g.length === bestSize) bestMasks.push(mask);
          }
          // Positive conditions => the maximum is unique and equals the union of all consistent sets.
          expect(bestMasks).toHaveLength(1);
          expect(bestMasks[0]).toBe(union);
          const viable = cand.filter((_, k) => union & (1 << k));
          const tentative = tentativeOf(free, viable, sl.id);
          const fav = viable.filter((r) => covered(favRanges(r, sl.id), s, s + dur)).length;
          want.push({ s, group: viable.map((r) => r.id), free: free.length, tentative: tentative.map((r) => r.id), fav });
          if (viable.length && viable.length < cand.length) nontrivial++;
          if (tentative.length) tentativeSeen++;
          if (ev.responses.some((r) => !inTime(r, sl.id, s, s + dur) && covered(r.ranges[sl.id], s, s + dur))) timeLimited++;
        }
        expect(
          st.slots.map((t) => ({ s: t.s, group: t.group, free: t.free, tentative: t.tentativeList.map((r) => r.id), fav: t.favourites })),
        ).toEqual(want);
        // The day's pick: viable, then tentative, then Favourites (or, with nobody viable, free), then earliest.
        let pick: (typeof want)[number] | null = null;
        for (const t of want) {
          if (!pick) {
            pick = t;
            continue;
          }
          const better =
            t.group.length !== pick.group.length
              ? t.group.length > pick.group.length
              : t.tentative.length !== pick.tentative.length
                ? t.tentative.length > pick.tentative.length
                : t.group.length > 0
                  ? t.fav > pick.fav
                  : t.free > pick.free;
          if (better) pick = t;
        }
        expect(st.window?.s ?? null).toBe(pick ? pick.s : null);
        expect([st.group, st.free, st.tentative, st.favourites]).toEqual(
          pick ? [pick.group, pick.free, pick.tentative.length, pick.fav] : [[], 0, 0, 0],
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(4000);
    expect(nontrivial).toBeGreaterThan(1000);
    expect(tentativeSeen).toBeGreaterThan(500);
    expect(timeLimited).toBeGreaterThan(1000);
  });
});

describe('fixed point and trace (up to 30 people)', () => {
  it('every slot group is free, self-consistent and has no unresolvable conditions; the trace explains every removal (2,000 events)', () => {
    const rand = rng(777);
    for (let i = 0; i < 2000; i++) {
      const ev = randomEvent(rand, { minPeople: 0, maxPeople: 30, minSlots: 1, maxSlots: 6, ifRate: 0.6 });
      const dur = DURATIONS[i % DURATIONS.length]!;
      for (const sl of ev.slots) {
        const st = slotStats(sl, ev.responses, ev.win, { duration: dur });
        expect(st.go).toBe(st.group.length);
        // Slots start every 30 minutes from the window start and fit inside the window.
        expect(st.slots.map((t) => t.s)).toEqual(
          Array.from({ length: Math.max(0, Math.floor((ev.win.e - ev.win.s - dur) / 30) + 1) }, (_, k) => ev.win.s + 30 * k),
        );
        for (const t of st.slots) {
          expect(t.e).toBe(t.s + dur);
          expect([t.go, t.tentative]).toEqual([t.group.length, t.tentativeList.length]);
          expect(t.freeList.map((r) => r.id)).toEqual(freeFor(ev, sl.id, t.s, t.e).map((r) => r.id));
          expect(t.viable.some((r) => unresolvable(r, sl.id))).toBe(false);
          expect(t.viable.every((r) => groupOk(r, sl.id, t.viable))).toBe(true);
          expect(t.tentativeList.map((r) => r.id)).toEqual(tentativeOf(t.freeList, t.viable, sl.id).map((r) => r.id));
          // Trace: replaying the rounds from the slot's candidates reproduces the group.
          let cur = t.freeList.filter((r) => !unresolvable(r, sl.id));
          for (const round of t.rounds) {
            expect(round.removed.length).toBeGreaterThan(0);
            for (const pid of round.removed) {
              const r = cur.find((x) => x.id === pid)!;
              expect(r.will[sl.id]).toBe('if');
              const failed = round.failed[pid]!;
              expect(failed.length).toBeGreaterThan(0);
              for (const c of failed) expect(groupHolds(c, cur)).toBe(false);
            }
            cur = cur.filter((x) => !round.removed.includes(x.id));
          }
          expect(cur.map((r) => r.id)).toEqual(t.group);
        }
        // The day's headline numbers are one of its slots.
        if (!st.window) {
          expect(st.slots).toEqual([]);
          continue;
        }
        const chosen = st.slots.find((t) => t.s === st.window!.s)!;
        expect([chosen.e, chosen.group, chosen.free, chosen.tentative, chosen.rounds]).toEqual([
          st.window.e,
          st.group,
          st.free,
          st.tentative,
          st.rounds,
        ]);
      }
    }
  }, 20_000);
});
