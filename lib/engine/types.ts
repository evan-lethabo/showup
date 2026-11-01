/*
 * Engine input. Condition shapes and field names follow docs/PRODUCT-RULES.md §4. The engine receives only
 * confirmed conditions; filtering unconfirmed ones happens upstream.
 */

/** Minutes since the day's midnight, end exclusive; values past 1440 are after midnight (1500 = 1am). */
export interface Range { s: number; e: number }

/** The organiser's time window for every candidate day. */
export type Window = Range;

export interface Slot {
  id: string;
  iso?: string;
  day?: string;
  title?: string;
  short?: string;
  /** This day's window; overrides EventData.win. */
  win?: Window;
}

/** Depends on who attends: all of `people` (requires), at least one (requires_any), or at least `n` people including self. */
export type GroupCondition =
  | { type: 'requires'; people: ParticipantId[] }
  | { type: 'requires_any'; people: ParticipantId[] }
  | { type: 'min_attendees'; n: number };

/** Narrows when the participant is free: the slot must start at or after `earliest_start` and end by `latest_end`. */
export interface TimeCondition { type: 'time'; earliest_start?: number; latest_end?: number }

/** Something the engine can't evaluate; makes the participant tentative instead of viable. */
export interface UnresolvableCondition { type: 'unresolvable'; summary: string }

export type Condition = GroupCondition | TimeCondition | UnresolvableCondition;

/** 0 = Not free, 1 = Free, 2 = Favourite. */
export type Availability = number;

export type Willingness = 'yes' | 'if' | 'no' | null;

/** One person's answers, keyed by day (slot) id. Conditions apply only on days answered If…. */
export interface Response {
  /** Stable participant id; conditions refer to people by this. */
  id: ParticipantId;
  /** Display name. */
  who: string;
  role: 'organiser' | 'guest' | string;
  avail: Record<string, Availability | undefined>;
  ranges: Record<string, Range[] | undefined>;
  will: Record<string, Willingness | undefined>;
  conds: Record<string, Condition[] | null | undefined>;
  /**
   * Favourite ranges per day. When absent, a day marked Favourite (avail = 2) treats its availability
   * ranges as Favourite ranges (the current UI's meaning). When present, only these count.
   */
  favs?: Record<string, Range[] | undefined>;
}

export interface EventData {
  slots: Slot[];
  win: Window;
  responses: Response[];
  /** Event length in minutes (default 120). `null` = no fixed length: people count if free at the start time. */
  duration?: number | null;
}

/** Stable participant id, used in conditions and engine output. */
export type ParticipantId = string;
