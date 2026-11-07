// Server-side validation of event creation input. Times are linear minutes from the day's midnight;
// a window that ends after midnight is stored with an end above 1440 (docs/PRODUCT-RULES.md §2).

export const DEFAULT_DURATION = 120;
export const MIN_DURATION = 15;
export const MAX_DAYS = 31;
export const TITLE_MAX = 60;
export const NAME_MAX = 30;
const DAY = 1440;
const HORIZON_DAYS = 730;

export interface EventDayInput {
  date: string;
  start: number;
  end: number;
}

export interface CreateEventInput {
  title: string;
  organiserName: string;
  timezone: string;
  /** Minutes, or null when the organiser set no fixed length. */
  durationMin: number | null;
  /** Sorted by date; the index is the day's creation position. */
  days: EventDayInput[];
}

export interface ValidationError {
  field: string;
  message: string;
}

/** Narrow with `'error' in v`: the root tsconfig isn't strict, so `v.ok` doesn't narrow there. */
export type Validated<T> = { ok: true; value: T } | { ok: false; error: ValidationError };

const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(field: string, message: string): { ok: false; error: ValidationError } {
  return { ok: false, error: { field, message } };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Display length in characters, not UTF-16 units. */
function length(s: string): number {
  return [...s].length;
}

export function hoursText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}

/** The IANA zone in its canonical spelling, or null if the runtime doesn't know it. */
export function canonicalTimezone(tz: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** Today's calendar date (YYYY-MM-DD) in the given zone. */
export function todayIn(tz: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function text(v: unknown, field: string, max: number, empty: string, tooLong: string): Validated<string> {
  if (typeof v !== 'string') return fail(field, empty);
  const s = v.trim().replace(/\s+/g, ' ');
  if (!s) return fail(field, empty);
  if (CONTROL.test(s)) return fail(field, 'Remove the special characters and try again.');
  if (length(s) > max) return fail(field, tooLong);
  return { ok: true, value: s };
}

/** A participant's display name: trimmed, single-spaced, 1–30 characters. */
export function validateName(v: unknown, field = 'name'): Validated<string> {
  return text(v, field, NAME_MAX, 'Add your name to continue.', `Keep your name to ${NAME_MAX} characters.`);
}

/** Editing an existing event: its timezone is fixed, and days it already has stay valid even once they're past. */
export interface EditContext {
  timezone: string;
  keepDates: ReadonlySet<string>;
}

export function validateCreateEvent(body: unknown, now: Date = new Date(), edit?: EditContext): Validated<CreateEventInput> {
  if (!isObject(body)) return fail('body', 'Send the event as a JSON object.');

  const title = text(body.title, 'title', TITLE_MAX, 'Give your event a name.', `Keep the event name to ${TITLE_MAX} characters.`);
  if ('error' in title) return title;
  const organiserName = text(body.organiserName, 'organiserName', NAME_MAX, 'Add your name.', `Keep your name to ${NAME_MAX} characters.`);
  if ('error' in organiserName) return organiserName;

  let timezone: string | null;
  if (edit) {
    timezone = edit.timezone;
  } else {
    if (typeof body.timezone !== 'string' || body.timezone.length > 64) return fail('timezone', 'The event needs a valid timezone.');
    timezone = canonicalTimezone(body.timezone);
    if (!timezone) return fail('timezone', 'The event needs a valid timezone.');
  }

  // A missing key keeps the old default for older callers; an explicit null means no fixed length.
  let durationMin: number | null = DEFAULT_DURATION;
  if (body.durationMin === null) {
    durationMin = null;
  } else if (body.durationMin !== undefined) {
    const d = body.durationMin;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < MIN_DURATION || d > DAY) {
      return fail('durationMin', `The event length must be between ${MIN_DURATION} minutes and 24 hours.`);
    }
    durationMin = d;
  }

  if (!Array.isArray(body.days) || body.days.length === 0) return fail('days', 'Pick at least one day.');
  if (body.days.length > MAX_DAYS) return fail('days', `Pick at most ${MAX_DAYS} days.`);

  const today = todayIn(timezone, now);
  const last = addDays(today, HORIZON_DAYS);
  const seen = new Set<string>();
  const days: EventDayInput[] = [];
  for (let i = 0; i < body.days.length; i++) {
    const field = `days[${i}]`;
    const raw: unknown = body.days[i];
    if (!isObject(raw)) return fail(field, 'Each day needs a date and a time window.');
    const { date, start, end } = raw;
    if (typeof date !== 'string' || !isCalendarDate(date)) return fail(`${field}.date`, 'Each day needs a valid date.');
    if (seen.has(date)) return fail(`${field}.date`, 'Each date can only be picked once.');
    seen.add(date);
    if (date < today && !edit?.keepDates.has(date)) return fail(`${field}.date`, "Candidate days can't be in the past.");
    if (date > last) return fail(`${field}.date`, 'Candidate days must be within the next two years.');
    if (typeof start !== 'number' || !Number.isInteger(start) || start < 0 || start >= DAY) {
      return fail(`${field}.start`, 'Each day needs a valid start time.');
    }
    if (typeof end !== 'number' || !Number.isInteger(end) || end < 0 || end > 2 * DAY) {
      return fail(`${field}.end`, 'Each day needs a valid end time.');
    }
    if (end === start) return fail(`${field}.end`, "A day's window can't start and end at the same time.");
    const e = end < start ? end + DAY : end;
    if (e - start > DAY) return fail(`${field}.end`, "A day's window can't be longer than 24 hours.");
    if (durationMin !== null && e - start < durationMin) {
      return fail(`${field}.end`, `Each day's window needs to be at least ${hoursText(durationMin)}, the length of the event.`);
    }
    days.push({ date, start, end: e });
  }
  days.sort((a, b) => (a.date < b.date ? -1 : 1));

  return { ok: true, value: { title: title.value, organiserName: organiserName.value, timezone, durationMin, days } };
}
