import type { EventData, Slot } from './types';
import { slotStats, type SlotStats } from './viable';

export interface RankedSlot extends SlotStats {
  slot: Slot;
}

export interface Ranking {
  /** One entry per slot, in the event's slot order. */
  days: RankedSlot[];
  /** The best slot, or null when nobody would go on any day. */
  best: RankedSlot | null;
}

export interface RankOptions {
  /** Use Favourites as a tie-break (default true). With `false` that step is skipped. */
  favourites?: boolean;
}

/**
 * Negative when `a` starts earlier than `b`. Days compare by `iso` date when every day has one, else by
 * event order (mixing the two isn't transitive); then by start time; then creation order.
 */
function earlier(a: RankedSlot, ai: number, b: RankedSlot, bi: number, byDate: boolean): number {
  if (byDate && a.slot.iso !== b.slot.iso) return a.slot.iso! < b.slot.iso! ? -1 : 1;
  if (!byDate && ai !== bi) return ai - bi;
  const t = (a.window?.s ?? 0) - (b.window?.s ?? 0);
  return t !== 0 ? t : ai - bi;
}

/**
 * Ranks the event's days by their chosen fixed-duration slot (see slotStats), using each day's `win` or
 * else the event window, and the event duration. A day where nobody is viable is never best; when no day
 * has anyone viable, `best` is null ("No viable plan yet"). Otherwise, in order (PRODUCT-RULES §6):
 *   1. the largest viable group,
 *   2. the most tentative people,
 *   3. the most Favourites among the viable group (skipped when `favourites: false`),
 *   4. the earliest start (date, then time),
 *   5. creation order.
 */
export function rankSlots(ev: EventData, opts: RankOptions = {}): Ranking {
  const useFav = opts.favourites !== false;
  const byDate = ev.slots.every((sl) => !!sl.iso);
  const days: RankedSlot[] = ev.slots.map((slot) => ({
    slot,
    ...slotStats(slot, ev.responses || [], slot.win ?? ev.win, { duration: ev.duration, favourites: useFav }),
  }));
  let best: RankedSlot | null = null;
  let bestIdx = -1;
  days.forEach((d, i) => {
    if (d.go <= 0) return;
    if (best) {
      if (d.go !== best.go) {
        if (d.go < best.go) return;
      } else if (d.tentative !== best.tentative) {
        if (d.tentative < best.tentative) return;
      } else if (useFav && d.favourites !== best.favourites) {
        if (d.favourites < best.favourites) return;
      } else if (earlier(d, i, best, bestIdx, byDate) >= 0) return;
    }
    best = d;
    bestIdx = i;
  });
  return { days, best };
}
