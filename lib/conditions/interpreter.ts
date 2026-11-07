// Condition interpreter (PRODUCT-RULES §4). The model proposes structured clauses; everything here after the model
// call is deterministic: schema and span checks, name/self resolution, time and headcount mapping, and the read-back.
// No database, HTTP or environment access: the route and scripts/eval-interpreter.ts share this pipeline unchanged.
import { chipsToViews, interpretOffline, normaliseName, OFFLINE_TENTATIVE_SUMMARY, titleCase, type ConditionView } from './fallback';

export interface InterpretationContext {
  day: { date: string; weekday: string; window_start: string; window_end: string; duration_minutes: number };
  self_name: string;
  self_id: string;
  /** Other participants (ids stay server-side; the model sees names only). */
  roster: { id: string; name: string }[];
  text: string;
}

export type InterpretSource = 'llm' | 'fallback';
export type InterpretStatus = 'ok' | 'no_condition' | 'self' | 'no_fit';

/** A canonical condition ready for PUT /response (people: id when matched, name when pending). */
export interface CanonicalCondition {
  type: 'requires' | 'requires_any' | 'min_attendees' | 'time' | 'unresolvable';
  people?: { id?: string; name: string; pending: boolean }[];
  n?: number;
  earliest_start?: number;
  latest_end?: number;
  summary?: string;
}

export interface Interpretation {
  status: InterpretStatus;
  source: InterpretSource;
  conditions: CanonicalCondition[];
  /** Server-generated confirmation lines, one per condition, note, alias or assumption. */
  lines: string[];
  message?: string;
}

export type TransportResult = { ok: true; text: string } | { ok: false; category: FailureCategory };
export type FailureCategory =
  'no_key' | 'timeout' | 'http_error' | 'unavailable' | 'truncated' | 'refusal' | 'bad_json' | 'schema' | 'semantic';
export type ModelTransport = (req: { system: string; user: string; schema: Record<string, unknown> }) => Promise<TransportResult>;

export const MAX_TEXT_CHARS = 500;
export const SELF_MESSAGE = "A condition can't depend on you coming. If nothing else needs to happen, choose Yes.";
export const NO_FIT_MESSAGE = 'No time on this day fits these limits.';
export const TENTATIVE_SUMMARY = 'You asked to be counted as tentative';

const UNSUPPORTED_SUMMARY: Record<string, string> = {
  weather: 'Depends on the weather',
  negative: 'Depends on someone not coming',
  mixed_or: 'Depends on one of several different things',
  unknown_person: "Depends on someone who isn't named",
  other: "Depends on something that can't be checked",
};

// ---- Model contract ---------------------------------------------------------------------------------------------

const nullable = (t: Record<string, unknown>) => ({ anyOf: [t, { type: 'null' }] });

export const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['clauses'],
  properties: {
    clauses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['source_text', 'kind', 'type', 'people', 'count', 'includes_self', 'time', 'reason', 'assumption'],
        properties: {
          source_text: { type: 'string' },
          kind: { type: 'string', enum: ['enforceable', 'unsupported', 'not_a_condition'] },
          type: { type: ['string', 'null'], enum: ['requires', 'requires_any', 'min_attendees', 'earliest_start', 'latest_end', null] },
          people: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'roster_match'],
              properties: { name: { type: 'string' }, roster_match: nullable({ type: 'string' }) },
            },
          },
          count: nullable({ type: 'integer' }),
          includes_self: nullable({ type: 'boolean' }),
          time: nullable({ type: 'string' }),
          reason: { type: ['string', 'null'], enum: ['weather', 'negative', 'mixed_or', 'unknown_person', 'other', null] },
          assumption: nullable({ type: 'string' }),
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = `You interpret one guest's attendance condition for a group event planner. You only interpret language; you never decide who attends.

Input JSON: day (date, weekday, window_start, window_end in 24h local time, duration_minutes), self_name (the guest writing), roster (other participants' names), text (verbatim).

Return clauses. Each clause covers one limiting idea, with source_text copied EXACTLY from text (a contiguous substring, not a paraphrase). Every meaningful part of text must appear in some clause. Never drop a condition because it can't be checked; mark it unsupported instead.

kind:
- enforceable: one of the supported types below.
- unsupported: a real condition the planner can't check. reason: weather; negative (someone NOT coming / "unless X comes"); mixed_or (OR between different kinds, e.g. a person OR a headcount); unknown_person (a relation or vague person with no name: "my boyfriend", "someone from work"); other.
- not_a_condition: preferences, wishes or context that do not limit attendance ("would be nice if", "she's driving", gibberish).

type (enforceable only; otherwise null):
- requires: ALL listed people must come ("if Jess and Sam come", "if Jess is").
- requires_any: AT LEAST ONE listed person ("if Jess or Ben comes").
- min_attendees: headcount. count = the number said; includes_self = true when the number counts the guest ("at least 6 people", "6 of us"), false for "others"/"other people"/"more people besides me".
- earliest_start: the event must start at or after time ("can't get there before 8", "after 8").
- latest_end: the event must end by time ("done by 10", "need to leave by 10", "home by 10", "finish before 1am").
Times are 24h HH:MM, choosing AM/PM to fit the day's window (an evening window means "8" is 20:00). If you infer AM/PM, travel time or what a phrase means, write assumption as one short sentence starting "We read '<phrase>' as ...". Otherwise assumption = null.

people: name exactly as written; roster_match = the roster name it refers to (exact match, or an obvious nickname like Sammy -> Samuel only if that roster name exists), else null. A name not on the roster is still a person (roster_match null). Report references to self_name as a person too; do not drop them.
Unused fields: people = [], count/includes_self/time/reason/assumption = null.

Logic: independent requirements joined by "and"/"but" are separate clauses. OR between named people is ONE requires_any clause. OR across different kinds is ONE unsupported mixed_or clause covering the whole alternative; never split it into separate conditions. Keep uncertainty and negation; never turn them into a supported condition.

Examples (roster includes Jess, Ben; window 18:00-23:00):
"I'm in if Jess is, she's driving" -> {requires, people [Jess]} source "if Jess is"; {not_a_condition} source "she's driving".
"only if Jess and Sam come" -> {requires, people [Jess->Jess, Sam->null]}.
"if Jess or Ben comes" -> {requires_any, people [Jess, Ben]}.
"if 5 others come" -> {min_attendees, count 5, includes_self false}.
"as long as I'm done by 10" -> {latest_end, time "22:00", assumption "We read 'done by 10' as the event ending by 10pm."}.
"if Jess comes or at least 6 people go" -> ONE {unsupported, reason mixed_or} with the whole phrase.
"not if Tom comes" -> {unsupported, negative}. "only if the weather's good" -> {unsupported, weather}. "if my boyfriend can come" -> {unsupported, unknown_person}.
"would be nice if Jess came" -> {not_a_condition}. "asdfgh" -> {not_a_condition} or no clauses.`;

// ---- Validation and mapping (pure) ------------------------------------------------------------------------------

interface Clause {
  source_text: string;
  kind: 'enforceable' | 'unsupported' | 'not_a_condition';
  type: 'requires' | 'requires_any' | 'min_attendees' | 'earliest_start' | 'latest_end' | null;
  people: { name: string; roster_match: string | null }[];
  count: number | null;
  includes_self: boolean | null;
  time: string | null;
  reason: 'weather' | 'negative' | 'mixed_or' | 'unknown_person' | 'other' | null;
  assumption: string | null;
}

const KINDS = ['enforceable', 'unsupported', 'not_a_condition'];
const TYPES = ['requires', 'requires_any', 'min_attendees', 'earliest_start', 'latest_end'];
const REASONS = ['weather', 'negative', 'mixed_or', 'unknown_person', 'other'];
const KEYS = ['source_text', 'kind', 'type', 'people', 'count', 'includes_self', 'time', 'reason', 'assumption'];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strOrNull = (v: unknown) => v === null || typeof v === 'string';

/** Strict shape check of the parsed model output; null when anything is off. */
export function parseClauses(raw: unknown): Clause[] | null {
  if (!isObj(raw) || Object.keys(raw).length !== 1 || !Array.isArray(raw.clauses) || raw.clauses.length > 12) return null;
  for (const c of raw.clauses as unknown[]) {
    if (!isObj(c) || Object.keys(c).length !== KEYS.length || !KEYS.every((k) => k in c)) return null;
    if (typeof c.source_text !== 'string' || !KINDS.includes(c.kind as string)) return null;
    if (!(c.type === null || TYPES.includes(c.type as string)) || !(c.reason === null || REASONS.includes(c.reason as string))) return null;
    if (!Array.isArray(c.people) || c.people.length > 10) return null;
    for (const p of c.people as unknown[]) {
      if (!isObj(p) || Object.keys(p).length !== 2 || typeof p.name !== 'string' || !strOrNull(p.roster_match)) return null;
    }
    if (!(c.count === null || Number.isInteger(c.count)) || !(c.includes_self === null || typeof c.includes_self === 'boolean'))
      return null;
    if (!strOrNull(c.time) || !strOrNull(c.assumption)) return null;
    if (c.kind === 'enforceable') {
      if (c.type === null || c.reason !== null) return null;
      if ((c.type === 'requires' || c.type === 'requires_any') && (c.people.length === 0 || c.count !== null || c.time !== null))
        return null;
      if (c.type === 'min_attendees' && (c.count === null || c.includes_self === null || c.people.length || c.time !== null)) return null;
      if (
        (c.type === 'earliest_start' || c.type === 'latest_end') &&
        (typeof c.time !== 'string' || !HHMM.test(c.time) || c.people.length || c.count !== null)
      )
        return null;
    } else if (c.type !== null) {
      return null;
    } else if (c.kind === 'unsupported' && c.reason === null) {
      return null;
    }
  }
  return raw.clauses as Clause[];
}

const spanNorm = (s: string) =>
  s
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^[\s.,;:!?'"-]+|[\s.,;:!?'"-]+$/g, '');

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};
const clockLabel = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
};

/** The day window in linear minutes (end past midnight is +1440, as stored by C8). */
export function windowOf(ctx: InterpretationContext): { s: number; e: number } {
  const s = toMin(ctx.day.window_start);
  let e = toMin(ctx.day.window_end);
  if (e <= s) e += 1440;
  return { s, e };
}

/** A clock time as a linear minute inside (or nearest to) the day window. */
export function linearTime(hhmm: string, win: { s: number; e: number }): number {
  const m = toMin(hhmm);
  const options = [m, m + 1440];
  const inside = options.find((x) => x >= win.s && x <= win.e);
  if (inside !== undefined) return inside;
  const dist = (x: number) => (x < win.s ? win.s - x : x - win.e);
  return dist(m) <= dist(m + 1440) ? m : m + 1440;
}

const NOT_A_NAME = new Set([
  'my',
  'his',
  'her',
  'their',
  'our',
  'your',
  'the',
  'a',
  'an',
  'someone',
  'somebody',
  'anyone',
  'anybody',
  'everyone',
  'people',
  'friend',
  'friends',
]);
const NAME_RE = /^\p{L}[\p{L}' .-]{0,29}$/u;

const quote = (s: string) => {
  const t = s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const listOf = (names: string[], conj: string) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} ${conj} ${names[names.length - 1]}`;
const clean = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

/** The confirmation line for one canonical condition (pending names get their own line). */
export function conditionLine(c: CanonicalCondition): string {
  switch (c.type) {
    case 'requires':
    case 'requires_any': {
      const names = (c.people ?? []).map((p) => p.name);
      const verb = c.type === 'requires' && names.length > 1 ? 'come' : 'comes';
      return `You'll only count if ${listOf(names, c.type === 'requires' ? 'and' : 'or')} ${verb}.`;
    }
    case 'min_attendees':
      return `You'll only count if at least ${c.n} people come, including you.`;
    case 'time':
      return c.earliest_start !== undefined
        ? `Only times starting from ${clockLabel(c.earliest_start)}.`
        : `Only times ending by ${clockLabel(c.latest_end!)}.`;
    case 'unresolvable':
      return `${(c.summary ?? '').replace(/[.\s]+$/, '')}, so you'll show as tentative.`;
  }
}

const pendingLine = (name: string) => `${name} hasn't joined yet; you'll count once they're in and coming.`;

export type MapResult = { ok: true; value: Interpretation } | { ok: false; category: 'schema' | 'semantic' };

/** Validates model clauses against the context and maps them to canonical conditions plus read-back. */
export function mapClauses(ctx: InterpretationContext, raw: unknown): MapResult {
  const clauses = parseClauses(raw);
  if (!clauses) return { ok: false, category: 'schema' };
  const text = spanNorm(ctx.text);
  const self = normaliseName(ctx.self_name);
  const win = windowOf(ctx);
  const conditions: CanonicalCondition[] = [];
  const lines: string[] = [];
  const notes: string[] = [];
  let es: number | undefined;
  let le: number | undefined;
  let selfRef = false;

  for (const c of clauses) {
    const span = spanNorm(c.source_text);
    if (!span || !text.includes(span)) return { ok: false, category: 'semantic' };
    if (c.kind === 'not_a_condition') {
      notes.push(`Noted: '${quote(c.source_text)}' doesn't change how you're counted.`);
      continue;
    }
    if (c.kind === 'unsupported') {
      conditions.push({ type: 'unresolvable', summary: UNSUPPORTED_SUMMARY[c.reason!] });
      lines.push(`'${quote(c.source_text)}' can't be checked, so you'll show as tentative.`);
      continue;
    }
    if (c.type === 'requires' || c.type === 'requires_any') {
      const people: NonNullable<CanonicalCondition['people']> = [];
      const extra: string[] = [];
      for (const p of c.people) {
        const name = p.name.replace(/\s+/g, ' ').trim();
        const n = normaliseName(name);
        // Self-reference first: the model's roster excludes the guest, so "Ella" may come back unmatched.
        const match = p.roster_match === null ? undefined : normaliseName(p.roster_match);
        if (n === self || match === self) {
          selfRef = true;
          continue;
        }
        if (!NAME_RE.test(name) || NOT_A_NAME.has(n.split(' ')[0]!)) return { ok: false, category: 'semantic' };
        const byMatch = match !== undefined ? ctx.roster.find((r) => normaliseName(r.name) === match) : undefined;
        const byName = ctx.roster.find((r) => normaliseName(r.name) === n);
        const hit = byMatch ?? byName;
        if (hit && hit.id === ctx.self_id) {
          selfRef = true;
          continue;
        }
        if (hit) {
          if (!people.some((x) => x.id === hit.id)) people.push({ id: hit.id, name: hit.name, pending: false });
          if (normaliseName(hit.name) !== n) extra.push(`You said ${name}; we matched this to ${hit.name}.`);
        } else if (!people.some((x) => x.pending && normaliseName(x.name) === n)) {
          const shown = titleCase(n);
          people.push({ name: shown, pending: true });
          extra.push(pendingLine(shown));
        }
      }
      if (selfRef) continue;
      if (!people.length) return { ok: false, category: 'semantic' };
      const cond: CanonicalCondition = { type: c.type, people };
      conditions.push(cond);
      lines.push(conditionLine(cond), ...extra);
    } else if (c.type === 'min_attendees') {
      const n = c.count! + (c.includes_self ? 0 : 1);
      if (n < 2 || n > 100) return { ok: false, category: 'semantic' };
      const cond: CanonicalCondition = { type: 'min_attendees', n };
      conditions.push(cond);
      lines.push(conditionLine(cond));
    } else {
      const m = linearTime(c.time!, win);
      const cond: CanonicalCondition = c.type === 'earliest_start' ? { type: 'time', earliest_start: m } : { type: 'time', latest_end: m };
      if (c.type === 'earliest_start') es = es === undefined ? m : Math.max(es, m);
      else le = le === undefined ? m : Math.min(le, m);
      conditions.push(cond);
      lines.push(conditionLine(cond));
    }
    if (c.assumption) lines.push(clean(c.assumption));
  }

  if (selfRef) return { ok: true, value: { status: 'self', source: 'llm', conditions: [], lines: [], message: SELF_MESSAGE } };
  if (!conditions.length) return { ok: true, value: { status: 'no_condition', source: 'llm', conditions: [], lines: notes } };
  const from = Math.max(win.s, es ?? win.s);
  const to = Math.min(win.e, le ?? win.e);
  if (to - from < ctx.day.duration_minutes) {
    return { ok: true, value: { status: 'no_fit', source: 'llm', conditions, lines: [...lines, ...notes], message: NO_FIT_MESSAGE } };
  }
  return { ok: true, value: { status: 'ok', source: 'llm', conditions, lines: [...lines, ...notes] } };
}

// ---- Fallback ---------------------------------------------------------------------------------------------------

/** The offline parser, labelled as such. Anything it can't account for stays as a tentative condition. */
export function interpretFallback(ctx: InterpretationContext): Interpretation {
  const r = interpretOffline(ctx.text, { self: ctx.self_name, roster: ctx.roster.map((p) => p.name) });
  if (r.status === 'self') return { status: 'self', source: 'fallback', conditions: [], lines: [], message: SELF_MESSAGE };
  if (r.status === 'empty' || r.status === 'none') return { status: 'no_condition', source: 'fallback', conditions: [], lines: [] };
  const conditions: CanonicalCondition[] = [];
  const lines: string[] = [];
  for (const v of chipsToViews(r.chips) as ConditionView[]) {
    if (v.type === 'requires' || v.type === 'requires_any') {
      const people = v.people.map((p) => {
        const hit = ctx.roster.find((x) => normaliseName(x.name) === normaliseName(p.name));
        return hit ? { id: hit.id, name: hit.name, pending: false } : { name: p.name, pending: true };
      });
      const cond: CanonicalCondition = { type: v.type, people };
      conditions.push(cond);
      lines.push(conditionLine(cond), ...people.filter((p) => p.pending).map((p) => pendingLine(p.name)));
    } else if (v.type === 'min_attendees') {
      const cond: CanonicalCondition = { type: 'min_attendees', n: v.n };
      conditions.push(cond);
      lines.push(conditionLine(cond));
    } else if (v.type === 'unresolvable') {
      const cond: CanonicalCondition = { type: 'unresolvable', summary: v.summary || OFFLINE_TENTATIVE_SUMMARY };
      conditions.push(cond);
      lines.push(conditionLine(cond));
    }
  }
  return { status: 'ok', source: 'fallback', conditions, lines };
}

// ---- Orchestrator -----------------------------------------------------------------------------------------------

/** The model's view of the context: names only, the guest excluded from the roster, text verbatim. */
export function modelInput(ctx: InterpretationContext): string {
  return JSON.stringify({
    day: ctx.day,
    self_name: ctx.self_name,
    roster: ctx.roster.filter((r) => r.id !== ctx.self_id).map((r) => r.name),
    text: ctx.text,
  });
}

/**
 * Interprets condition text: model (when a transport is given) then deterministic validation, else the offline
 * fallback. `failure` reports a safe category only, never text.
 */
export async function interpretCondition(
  ctx: InterpretationContext,
  transport: ModelTransport | null,
): Promise<Interpretation & { failure?: FailureCategory }> {
  if (!ctx.text.trim()) return { status: 'no_condition', source: 'fallback', conditions: [], lines: [] };
  if (!transport) return { ...interpretFallback(ctx), failure: 'no_key' };
  let res: TransportResult;
  try {
    res = await transport({ system: SYSTEM_PROMPT, user: modelInput(ctx), schema: OUTPUT_SCHEMA });
  } catch {
    res = { ok: false, category: 'unavailable' };
  }
  if ('category' in res) return { ...interpretFallback(ctx), failure: res.category };
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    return { ...interpretFallback(ctx), failure: 'bad_json' };
  }
  const mapped = mapClauses(ctx, parsed);
  if ('category' in mapped) return { ...interpretFallback(ctx), failure: mapped.category };
  return mapped.value;
}
