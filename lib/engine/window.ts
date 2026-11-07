import type { Range, Response, Slot, Window } from './types';
import type { SlotStats } from './viable';

/**
 * The display window: the longest run of 15-minute steps covered by the most of `people`; on equal
 * length, the earliest. Mirrors bestWindow in lib/ui/utils/recommend.ts exactly, including that `cur`
 * and `best` can be the same object while a run extends.
 */
export function bestWindow(win: Window, slotId: string, people: readonly Response[]): Range | null {
  let best: Range | null = null;
  let cur: Range | null = null;
  let max = 0;
  for (let t = win.s; t < win.e; t += 15) {
    const n = people.filter((r) => (r.ranges[slotId] || []).some((rg) => rg.s <= t && rg.e >= t + 15)).length;
    if (n > max) {
      max = n;
      best = { s: t, e: t + 15 };
      cur = best;
    } else if (n === max && n > 0 && cur && cur.e === t) {
      cur.e = t + 15;
      if (best && cur.e - cur.s > best.e - best.s) best = cur;
    } else if (n === max && n > 0) {
      cur = { s: t, e: t + 15 };
    } else cur = null;
  }
  return best;
}

/** How many of `people` cover the whole of `w`. */
export function coverCount(people: readonly Response[], slotId: string, w: Range): number {
  return people.filter((r) => (r.ranges[slotId] || []).some((rg) => rg.s <= w.s && rg.e >= w.e)).length;
}

export interface SlotWindow {
  slotId: string;
  /** null when nobody is free at any time in the organiser's window. */
  window: Range | null;
  /** Free people covering the whole window (dots). */
  free: number;
  /** Viable people covering the whole window (red dots). */
  go: number;
}

/**
 * The window and dot counts shown for a day: where the most would-go people overlap, or, if none of them
 * overlap, where the most free people do. Mirrors dayDots in lib/ui/utils/recommend.ts (minus formatting).
 */
export function slotWindow(win: Window, slot: Slot | string, stats: Pick<SlotStats, 'viable' | 'freeList'>): SlotWindow {
  const id = typeof slot === 'string' ? slot : slot.id;
  let w = stats.viable.length ? bestWindow(win, id, stats.viable) : null;
  if (!w || coverCount(stats.viable, id, w) === 0) w = stats.freeList.length ? bestWindow(win, id, stats.freeList) : null;
  if (!w) return { slotId: id, window: null, free: 0, go: 0 };
  return { slotId: id, window: w, free: coverCount(stats.freeList, id, w), go: coverCount(stats.viable, id, w) };
}
