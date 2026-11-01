// Live results for a stored event: saved responses through the C8 engine, reduced to public aggregates.
// Every field is copied explicitly; engine objects (which hold responses and names) never leave this module.
import { rankSlots, type EventData, type TimeSlotStats } from '../engine';
import type { Db } from './db';
import type { PublicEvent } from './events';
import { eventRev } from '../ui/utils/persisted-event';
import { loadEngineResponses, slotIdFor } from './responses';

export interface ResultCounts { startMin: number; endMin: number; free: number; coming: number; maybe: number }
/** The day's chosen window, plus who is free in it: coming first, then maybe, then the rest (one name per dot). */
export interface DayBest extends ResultCounts { names: string[] }
export interface ResultSlot extends ResultCounts { date: string }
export interface ResultsDto {
  eventId: string;
  /** Changes whenever the organiser edits the title, name, length or schedule, so open pages know to reload. */
  rev: string;
  respondedCount: number;
  best: ResultSlot | null;
  days: { date: string; best: DayBest | null }[];
  slots: ResultSlot[];
  /** Everyone who has joined, in join order, and whether they've responded. Names are public (PRODUCT-RULES §7); answers are not. */
  people: { name: string; responded: boolean }[];
}

const counts = (s: number, e: number, free: number, go: number, tentative: number): ResultCounts =>
  ({ startMin: s, endMin: e, free, coming: go, maybe: tentative });

/** Names in dot order: the viable group, then tentative people, then everyone else who is free. */
function dotNames(d: { viable: { id: string; who: string }[]; tentativeList: { id: string; who: string }[]; freeList: { id: string; who: string }[] }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of [...d.viable, ...d.tentativeList, ...d.freeList]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r.who);
  }
  return out;
}

/** Aggregates plus who has joined and who has responded (names only, join order). */
export async function computeResults(db: Db, event: PublicEvent): Promise<ResultsDto> {
  const responses = await loadEngineResponses(db, event.id);
  const ev: EventData = {
    slots: event.days.map((d) => ({ id: slotIdFor(d.date), iso: d.date, win: { s: d.start, e: d.end } })),
    win: event.days[0] ? { s: event.days[0].start, e: event.days[0].end } : { s: 0, e: 0 },
    duration: event.durationMin,
    responses,
  };
  const ranking = rankSlots(ev);
  const dateOf = (i: number) => event.days[i]!.date;
  const days = ranking.days.map((d, i) => ({
    date: dateOf(i),
    // The engine's chosen slot for the day; a day nobody is free for has no time that fits.
    best: d.window && d.free > 0 ? { ...counts(d.window.s, d.window.e, d.free, d.go, d.tentative), names: dotNames(d) } : null,
  }));
  const slots = ranking.days.flatMap((d, i) => d.slots.map((t: TimeSlotStats) => ({ date: dateOf(i), ...counts(t.s, t.e, t.free, t.go, t.tentative) })));
  const b = ranking.best;
  const best = b && b.window
    ? { date: b.slot.iso!, ...counts(b.window.s, b.window.e, b.free, b.go, b.tentative) }
    : null;
  return { eventId: event.id, rev: eventRev(event), respondedCount: responses.length, best, days, slots, people: event.participants.map((p) => ({ name: p.name, responded: p.responded })) };
}
