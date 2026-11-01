/*
 * SHOWUP coordination engine: pure, dependency-free, no I/O. Safe to run on the server or the client.
 * Viability is worked out per fixed-duration slot: unlike lib/ui/utils/recommend.ts, people only count
 * together when each is available for the whole slot. See docs/ENGINE.md and docs/PRODUCT-RULES.md.
 */
export type * from './types';
export { conditionHolds, DEFAULT_DURATION, SLOT_STEP, START_COVER, slotStats, viableGroup } from './viable';
export type { EliminationRound, SlotOptions, SlotStats, TimeSlotStats, ViableResult } from './viable';
export { bestWindow, coverCount, slotWindow } from './window';
export type { SlotWindow } from './window';
export { rankSlots } from './rank';
export type { RankedSlot, Ranking } from './rank';
