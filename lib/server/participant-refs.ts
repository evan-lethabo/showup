// How group conditions refer to people, and how stored conditions become engine input. Kept apart from responses.ts so
// validation and persistence can both use it without importing each other.
import type { Condition } from '../engine/types';
import { titleCase, type ConditionView } from '../conditions/fallback';

export const MAX_PARTICIPANTS = 200;

// ---- People references inside stored group conditions -------------------------------------------------------
// payload.people holds participant ids, or "name:<normalised name>" for someone who hasn't joined yet.
// Ids are base64url and never contain ":", so the two can't collide.

const PENDING = 'name:';
export const pendingRef = (normalised: string) => PENDING + normalised;
export const isPendingRef = (ref: string) => ref.startsWith(PENDING);
const pendingName = (ref: string) => ref.slice(PENDING.length);

export interface ParticipantRow {
  id: string;
  displayName: string;
  normalisedName: string;
}

/**
 * Resolves stored references to participant ids for the engine. A pending name matching a participant who has
 * since joined becomes their id; an unmatched one stays an id that matches nobody (so the dependency is unmet),
 * never dropped. Joining alone satisfies nothing: the engine still requires that person to be viable.
 */
export function resolveRefs(refs: readonly string[], people: readonly ParticipantRow[]): string[] {
  return refs.map((ref) => {
    if (!isPendingRef(ref)) return ref;
    const match = people.find((p) => p.normalisedName === pendingName(ref));
    return match ? match.id : ref;
  });
}

export interface StoredCondition {
  type: string;
  payload: Record<string, unknown>;
}

/** A stored payload as an engine Condition (C8 contract: people are ids only). */
export function toEngineCondition(c: StoredCondition, people: readonly ParticipantRow[]): Condition {
  const p = c.payload;
  if (c.type === 'requires' || c.type === 'requires_any') return { type: c.type, people: resolveRefs(p.people as string[], people) };
  if (c.type === 'min_attendees') return { type: 'min_attendees', n: Number(p.n) };
  if (c.type === 'time') {
    const t: Condition = { type: 'time' };
    if (typeof p.earliest_start === 'number') t.earliest_start = p.earliest_start;
    if (typeof p.latest_end === 'number') t.latest_end = p.latest_end;
    return t;
  }
  return { type: 'unresolvable', summary: String(p.summary) };
}

/** A stored payload as its author sees it, with names (and pending names that have since joined resolved). */
export function toView(c: StoredCondition, people: readonly ParticipantRow[]): ConditionView {
  const p = c.payload;
  if (c.type === 'requires' || c.type === 'requires_any') {
    return {
      type: c.type,
      people: resolveRefs(p.people as string[], people).map((ref) => {
        const who = people.find((x) => x.id === ref);
        return who ? { name: who.displayName, pending: false } : { name: titleCase(pendingName(ref)), pending: true };
      }),
    };
  }
  return toEngineCondition(c, people) as ConditionView;
}

/** Engine slot id for a candidate day; the same id the flow UI uses (lib/ui/utils/dates.ts slotFromIso). */
export const slotIdFor = (date: string) => 'd' + date.replace(/-/g, '');
