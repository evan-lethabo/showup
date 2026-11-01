import type { Condition, GroupCondition, ParticipantId, Range, Response, Slot, Window } from './types';

export interface EliminationRound {
  /** Who dropped out in this round (all at once; order = response order). */
  removed: ParticipantId[];
  /** Human-readable summary of the round. */
  reason: string;
  /** The group conditions each removed person had that failed, keyed by id. */
  failed: Record<ParticipantId, GroupCondition[]>;
}

export interface ViableResult {
  /**
   * Who will come: the greatest set of the slot's free people without unresolvable conditions in which every
   * member's group conditions hold. Participant ids, response order.
   */
  group: ParticipantId[];
  /** Each elimination round, in order. Empty when nobody's conditions failed. */
  rounds: EliminationRound[];
}

/** Results for one fixed-duration slot. */
export interface TimeSlotStats extends ViableResult {
  /** Start and end on the day's linear minute axis (end exclusive; values past 1440 are after midnight). */
  s: number;
  e: number;
  /** Number of people free for the slot (PRODUCT-RULES §3). */
  free: number;
  /** Size of the viable group. */
  go: number;
  /** Number of tentative people: free, group conditions hold against the viable group, but an unresolvable condition. */
  tentative: number;
  /** The viable group's responses (same objects as passed in). */
  viable: Response[];
  /** The free people's responses. */
  freeList: Response[];
  /** The tentative people's responses. */
  tentativeList: Response[];
  /** How many of the viable group have a Favourite range covering the whole slot. */
  favourites: number;
}

/**
 * Per-day results. The headline fields describe the day's chosen slot, `window`: most viable, then most
 * tentative, then most Favourites, then earliest; when nobody is viable in any slot, most tentative, then most
 * free, then earliest.
 */
export interface SlotStats extends ViableResult {
  free: number;
  go: number;
  tentative: number;
  viable: Response[];
  freeList: Response[];
  tentativeList: Response[];
  favourites: number;
  /** The chosen slot's start and end. null when no slot fits the window. */
  window: Range | null;
  /** Every slot for the day, in start order. */
  slots: TimeSlotStats[];
}

export interface SlotOptions {
  /**
   * Event length in minutes (default 120). `null` means no fixed length: there is no end to cover, so a person is
   * free for a slot when their availability covers its start (START_COVER minutes), however long they stay.
   */
  duration?: number | null;
  /** Use Favourites when choosing the day's slot (default true). */
  favourites?: boolean;
}

export const DEFAULT_DURATION = 120;
/** Slot starts are this many minutes apart, from the window start. */
export const SLOT_STEP = 30;
/** With no fixed length, a person is free at a start time when they cover this many minutes from it (the finest availability step). */
export const START_COVER = 15;

/** Does group condition `c` hold for a set with these participant ids and this many people? */
export function conditionHolds(c: GroupCondition, ids: ReadonlySet<ParticipantId>, size: number): boolean {
  switch (c.type) {
    case 'requires': return c.people.every((p) => ids.has(p));
    case 'requires_any': return c.people.some((p) => ids.has(p));
    case 'min_attendees': return size >= c.n;
  }
}

function describe(c: GroupCondition, nameOf: (id: ParticipantId) => string): string {
  if (c.type === 'min_attendees') return `needs at least ${c.n} people`;
  return `needs ${c.people.map(nameOf).join(c.type === 'requires' ? ' and ' : ' or ')}`;
}

function slotIdOf(slot: Slot | string): string {
  return typeof slot === 'string' ? slot : slot.id;
}

/** One participant's answers for a day, prepared for the slot loop. */
interface Person {
  r: Response;
  group: GroupCondition[];
  unresolvable: boolean;
  /** Availability after time conditions and merging. */
  avail: Range[];
  favs: Range[];
}

/** Simultaneous elimination on group conditions, until nothing changes. */
function greatestFixedPoint(cand: readonly Person[], nameOf: (id: ParticipantId) => string): { viable: Person[]; rounds: EliminationRound[] } {
  let cur = cand.slice();
  const rounds: EliminationRound[] = [];
  // All group conditions are positive (more people never breaks one), so this reaches the greatest fixed
  // point: the largest self-consistent group among the candidates.
  for (;;) {
    const ids = new Set(cur.map((p) => p.r.id));
    const size = cur.length;
    const failed: Record<ParticipantId, GroupCondition[]> = {};
    const removed: ParticipantId[] = [];
    const next = cur.filter((p) => {
      const bad = p.group.filter((c) => !conditionHolds(c, ids, size));
      if (!bad.length) return true;
      removed.push(p.r.id);
      failed[p.r.id] = bad;
      return false;
    });
    if (next.length === cur.length) break;
    const parts = removed.map((pid) => `${nameOf(pid)} (${(failed[pid] || []).map((c) => describe(c, nameOf)).join(', ')})`);
    rounds.push({ removed, reason: `With ${size} ${size === 1 ? 'person' : 'people'}: ${parts.join('; ')}`, failed });
    cur = next;
  }
  return { viable: cur, rounds };
}

/** Sorted, with touching or overlapping ranges merged; empty or inverted ranges dropped. Gaps stay gaps. */
function mergeRanges(ranges: readonly Range[] | undefined): Range[] {
  const sorted = (ranges || []).filter((rg) => rg.e > rg.s).map((rg) => ({ s: rg.s, e: rg.e })).sort((a, b) => a.s - b.s);
  const out: Range[] = [];
  for (const rg of sorted) {
    const last = out[out.length - 1];
    if (last && rg.s <= last.e) last.e = Math.max(last.e, rg.e);
    else out.push(rg);
  }
  return out;
}

const covers = (ranges: readonly Range[], s: number, e: number) => ranges.some((rg) => rg.s <= s && rg.e >= e);

/** Favourite ranges for a day: `favs` when the response has them, else the availability ranges of a Favourite day. */
function favouriteRanges(r: Response, id: string): Range[] | undefined {
  if (r.favs) return r.favs[id];
  return r.avail[id] === 2 ? r.ranges[id] : undefined;
}

/**
 * The person's day, or null if they can't be free for any slot: marked Not free (avail = 0), not Yes or If…, or
 * If… without a condition. Conditions apply only on If… days. Time conditions clip availability before
 * merging; ranges emptied by clipping are dropped.
 */
function personFor(r: Response, id: string): Person | null {
  const will = r.will[id];
  if (r.avail[id] === 0 || (will !== 'yes' && will !== 'if')) return null;
  const conds: readonly Condition[] = will === 'if' ? r.conds[id] || [] : [];
  if (will === 'if' && !conds.length) return null;
  let lo = -Infinity, hi = Infinity, unresolvable = false;
  const group: GroupCondition[] = [];
  for (const c of conds) {
    if (c.type === 'time') {
      if (c.earliest_start !== undefined) lo = Math.max(lo, c.earliest_start);
      if (c.latest_end !== undefined) hi = Math.min(hi, c.latest_end);
    } else if (c.type === 'unresolvable') unresolvable = true;
    else group.push(c);
  }
  const clipped = (r.ranges[id] || []).map((rg) => ({ s: Math.max(rg.s, lo), e: Math.min(rg.e, hi) }));
  return { r, group, unresolvable, avail: mergeRanges(clipped), favs: mergeRanges(favouriteRanges(r, id)) };
}

/** Is `a` a better pick for the day than `b`? Callers go in start order, so ties keep the earlier slot. */
function betterPick(a: TimeSlotStats, b: TimeSlotStats, useFav: boolean): boolean {
  if (a.go !== b.go) return a.go > b.go;
  if (a.tentative !== b.tentative) return a.tentative > b.tentative;
  if (a.go > 0) return useFav && a.favourites > b.favourites;
  return a.free > b.free;
}

/**
 * Per-day statistics on slots (PRODUCT-RULES §2–§5). Slots start every SLOT_STEP minutes from
 * the window start and must fit inside it. For each slot: free = people whose (time-clipped, merged)
 * availability covers the whole slot; viable = the greatest fixed point of the free people without
 * unresolvable conditions; tentative = free people with an unresolvable condition whose group conditions hold
 * against the viable group plus themselves.
 *
 * The window is `win`, else the slot's own `win`; one of them is required.
 */
export function slotStats(slot: Slot | string, participants: readonly Response[], win?: Window, opts: SlotOptions = {}): SlotStats {
  const id = slotIdOf(slot);
  const w = win ?? (typeof slot === 'string' ? undefined : slot.win);
  if (!w) throw new Error(`slotStats: no window for day ${id}`);
  const duration = opts.duration === undefined ? DEFAULT_DURATION : opts.duration;
  if (duration !== null && !(duration > 0)) throw new Error(`slotStats: duration must be a positive number of minutes, got ${duration}`);
  const useFav = opts.favourites !== false;

  const people = participants.map((r) => personFor(r, id)).filter((p): p is Person => p !== null);
  const names = new Map(participants.map((r) => [r.id, r.who]));
  const nameOf = (pid: ParticipantId) => names.get(pid) ?? pid;

  const slots: TimeSlotStats[] = [];
  let pick: TimeSlotStats | null = null;
  // Fixed length: free means covering the whole slot. No length: covering the start is enough, and any start with room for it is offered.
  const need = duration ?? START_COVER;
  for (let s = w.s; s + need <= w.e; s += SLOT_STEP) {
    const e = s + (duration ?? SLOT_STEP);
    const free = people.filter((p) => covers(p.avail, s, s + need));
    const { viable, rounds } = greatestFixedPoint(free.filter((p) => !p.unresolvable), nameOf);
    const viableIds = new Set(viable.map((p) => p.r.id));
    const tentative = free.filter((p) => {
      if (!p.unresolvable) return false;
      const ids = new Set(viableIds).add(p.r.id);
      return p.group.every((c) => conditionHolds(c, ids, ids.size));
    });
    const t: TimeSlotStats = {
      s, e,
      free: free.length, go: viable.length, tentative: tentative.length,
      viable: viable.map((p) => p.r), freeList: free.map((p) => p.r), tentativeList: tentative.map((p) => p.r),
      favourites: viable.filter((p) => covers(p.favs, s, s + need)).length,
      group: viable.map((p) => p.r.id), rounds
    };
    slots.push(t);
    if (!pick || betterPick(t, pick, useFav)) pick = t;
  }

  if (!pick) return { free: 0, go: 0, tentative: 0, viable: [], freeList: [], tentativeList: [], favourites: 0, group: [], rounds: [], window: null, slots };
  const { free, go, tentative, viable, freeList, tentativeList, favourites, group, rounds } = pick;
  return { free, go, tentative, viable, freeList, tentativeList, favourites, group, rounds, window: { s: pick.s, e: pick.e }, slots };
}

/** Who will come on `slot` in its chosen time slot, plus the elimination trace for that slot. */
export function viableGroup(slot: Slot | string, participants: readonly Response[], win?: Window, opts?: SlotOptions): ViableResult {
  const { group, rounds } = slotStats(slot, participants, win, opts);
  return { group, rounds };
}
