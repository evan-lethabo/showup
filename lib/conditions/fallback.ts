// Offline condition interpretation (PRODUCT-RULES §4 "Fallback") and the deterministic read-back.
// Shared by the browser (to show what will be saved) and the server (which regenerates the stored read-back).
// The later AI interpreter replaces `interpretOffline`; chips, read-backs and confirmation stay.
import { parseConditions } from '../ui/utils/conditions-parser';

/** Lower case, single spaces, trimmed: the same rule as participants.normalised_name. */
export function normaliseName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function titleCase(normalised: string): string {
  return normalised.replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** A person in a condition as shown to its author: someone in the event, or a name nobody has joined with yet. */
export interface PersonView {
  name: string;
  pending: boolean;
}

/** A condition as its author sees it (server reads and the confirm sheet). Engine conditions use ids instead. */
export type ConditionView =
  | { type: 'requires' | 'requires_any'; people: PersonView[] }
  | { type: 'min_attendees'; n: number }
  | { type: 'time'; earliest_start?: number; latest_end?: number }
  | { type: 'unresolvable'; summary: string };

/** The fixed summary for "count me as tentative" from the offline interpreter. Raw text is never stored. */
export const OFFLINE_TENTATIVE_SUMMARY = "Part of what you said can't be checked offline";

function list(names: string[], conj: string): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${conj} ${names[names.length - 1]}`;
}

function clock(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

/** One plain-English sentence (or two) per condition. Deterministic: the server stores exactly this. */
export function readback(c: ConditionView): string {
  switch (c.type) {
    case 'requires':
    case 'requires_any': {
      const names = c.people.map((p) => p.name);
      const head =
        c.type === 'requires' || names.length === 1
          ? `You'll go only if ${list(names, 'and')} ${names.length > 1 ? 'come' : 'comes'}.`
          : `You'll go only if at least one of ${list(names, 'or')} comes.`;
      const pending = c.people.filter((p) => p.pending).map((p) => p.name);
      if (!pending.length) return head;
      return `${head} ${list(pending, 'and')} ${pending.length > 1 ? "haven't" : "hasn't"} joined yet, so this isn't met until they join and can come.`;
    }
    case 'min_attendees':
      return `You'll go only if at least ${c.n} people come, including you.`;
    case 'time': {
      const parts = [
        c.earliest_start !== undefined ? `starts at ${clock(c.earliest_start)} or later` : '',
        c.latest_end !== undefined ? `ends by ${clock(c.latest_end)}` : '',
      ].filter(Boolean);
      return `You'll go only if it ${parts.join(' and ')}.`;
    }
    case 'unresolvable':
      return `${c.summary.replace(/[.\s]+$/, '')}, so you'll show as tentative.`;
  }
}

/** Confirm-sheet chips. `kept` carries a stored condition the offline interpreter can't produce (e.g. from the AI). */
export type Chip =
  | { type: 'person'; name: string; pending: boolean }
  | { type: 'min'; n: number }
  | { type: 'tentative' }
  | { type: 'kept'; cond: ConditionView };

export function chipsToViews(chips: readonly Chip[]): ConditionView[] {
  const people = chips.filter((c): c is Extract<Chip, { type: 'person' }> => c.type === 'person');
  const out: ConditionView[] = [];
  if (people.length)
    out.push({
      type: 'requires',
      people: people.map((p) => ({ name: p.pending ? titleCase(normaliseName(p.name)) : p.name, pending: p.pending })),
    });
  for (const c of chips) {
    if (c.type === 'min') out.push({ type: 'min_attendees', n: c.n });
    else if (c.type === 'tentative') out.push({ type: 'unresolvable', summary: OFFLINE_TENTATIVE_SUMMARY });
    else if (c.type === 'kept') out.push(c.cond);
  }
  return out;
}

export function viewsToChips(views: readonly ConditionView[]): Chip[] {
  const chips: Chip[] = [];
  for (const v of views) {
    if (v.type === 'requires') chips.push(...v.people.map((p): Chip => ({ type: 'person', name: p.name, pending: p.pending })));
    else if (v.type === 'min_attendees') chips.push({ type: 'min', n: v.n });
    else if (v.type === 'unresolvable' && v.summary === OFFLINE_TENTATIVE_SUMMARY) chips.push({ type: 'tentative' });
    else chips.push({ type: 'kept', cond: v });
  }
  return chips;
}

/**
 * - ok: everything was understood.
 * - partial: some of it was understood; the rest is offered as "tentative" rather than dropped.
 * - tentative: none of it can be checked offline (negatives, "or", the weather, "my boyfriend"…).
 * - self: the condition names the author. - none: nothing that adds a condition. - empty: no text.
 */
export type OfflineStatus = 'ok' | 'partial' | 'tentative' | 'self' | 'none' | 'empty';

// Words that carry no condition by themselves. Anything else left over means part of the text wasn't understood.
const FILLER = new Set(
  (
    'if only as long provided providing so and also too but then when i ll d m will would can could be is are s re ' +
    'there here going goes go come comes coming attend attends attending show shows up turn turns join joins joining at least a an ' +
    'minimum of more than over people persons others friends us guests plus the it that we they in just get gets to me ok'
  ).split(' '),
);
const NUMBER = /^(\d+|two|three|four|five|six|seven|eight|nine|ten)$/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Interprets condition text with the offline regex parser, never silently dropping what it can't read. */
export function interpretOffline(
  text: string,
  opts: { self: string; roster: readonly string[] },
): { status: OfflineStatus; chips: Chip[] } {
  const clean = text.replace(/[‘’`]/g, "'").replace(/\s+/g, ' ').trim();
  if (!clean) return { status: 'empty', chips: [] };
  const self = normaliseName(opts.self);
  const roster = opts.roster.filter((n) => normaliseName(n) !== self);
  const lower = clean.toLowerCase();
  let rest = ` ${lower.replace(/[^\p{L}\p{N}' ]+/gu, ' ')} `;

  // The parser refuses negatives and "or"; those become a tentative interpretation, never a group condition.
  const parsed = parseConditions(clean, null) as { status: string; chips: { type: string; name?: string; n?: string }[] };
  if (parsed.status === 'unsupported') return { status: 'tentative', chips: [{ type: 'tentative' }] };

  const chips: Chip[] = [];
  const seen = new Set<string>();
  const addPerson = (name: string) => {
    const key = normaliseName(name);
    if (seen.has(key)) return;
    seen.add(key);
    const known = roster.find((r) => normaliseName(r) === key);
    chips.push({ type: 'person', name: known ?? name, pending: !known });
  };
  const mentionsSelf = (name: string) => normaliseName(name) === self;

  for (const r of roster) {
    const re = new RegExp(`(^|[^\\p{L}])${escapeRe(normaliseName(r))}(?=$|[^\\p{L}])`, 'u');
    if (re.test(lower)) {
      addPerson(r);
      rest = rest.replace(new RegExp(` ${escapeRe(normaliseName(r))}(?:'s)? `, 'g'), ' ');
    }
  }
  for (const c of parsed.chips) {
    if (c.type === 'person' && c.name) {
      if (mentionsSelf(c.name)) return { status: 'self', chips: [] };
      addPerson(c.name);
      rest = rest.replace(new RegExp(` ${escapeRe(c.name.toLowerCase())}(?:'s)? `, 'g'), ' ');
    } else if (c.type === 'min' && c.n) {
      chips.push({ type: 'min', n: Number(c.n) });
    }
  }
  if (self.length > 1 && new RegExp(`(^|[^\\p{L}])${escapeRe(self)}(?=$|[^\\p{L}])`, 'u').test(lower) && !seen.has(self)) {
    return { status: 'self', chips: [] };
  }

  const hasMin = chips.some((c) => c.type === 'min');
  const leftover = rest.split(/[\s']+/).filter((w) => w && !FILLER.has(w) && !(hasMin && NUMBER.test(w)));
  if (!chips.length) return leftover.length ? { status: 'tentative', chips: [{ type: 'tentative' }] } : { status: 'none', chips: [] };
  if (leftover.length) return { status: 'partial', chips: [...chips, { type: 'tentative' }] };
  return { status: 'ok', chips };
}
