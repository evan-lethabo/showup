import { describe, expect, it } from 'vitest';
import { validateCreateEvent, type ValidationError } from '../validate';

// 2030-01-01 09:00 UTC is already 2 Jan in Sydney and still 1 Jan in Los Angeles.
const now = new Date('2030-01-01T23:30:00Z');
const base = {
  title: 'Dinner',
  organiserName: 'Alex',
  timezone: 'Europe/London',
  days: [{ date: '2030-01-05', start: 1080, end: 1380 }],
};

function errorOf(body: unknown): ValidationError {
  const v = validateCreateEvent(body, now);
  if (!('error' in v)) throw new Error('expected invalid input');
  return v.error;
}

function valueOf(body: unknown) {
  const v = validateCreateEvent(body, now);
  if ('error' in v) throw new Error(`unexpected error: ${v.error.field} ${v.error.message}`);
  return v.value;
}

describe('event creation validation', () => {
  it('accepts a valid event, defaulting the duration to 2 hours', () => {
    expect(valueOf(base)).toEqual({ ...base, durationMin: 120 });
  });

  it('normalises the title and name and canonicalises the timezone', () => {
    const v = valueOf({ ...base, title: '  Friday   drinks ', organiserName: ' Sam\tLee ', timezone: 'europe/london' });
    expect(v.title).toBe('Friday drinks');
    expect(v.organiserName).toBe('Sam Lee');
    expect(v.timezone).toBe('Europe/London');
  });

  it('requires a title, organiser name and timezone within limits', () => {
    expect(errorOf({ ...base, title: '   ' })).toEqual({ field: 'title', message: 'Give your event a name.' });
    expect(errorOf({ ...base, title: 7 }).field).toBe('title');
    expect(errorOf({ ...base, title: 'x'.repeat(61) })).toEqual({ field: 'title', message: 'Keep the event name to 60 characters.' });
    expect(valueOf({ ...base, title: '🎉'.repeat(60) }).title).toHaveLength(120);
    expect(errorOf({ ...base, title: 'a\u0000b' }).field).toBe('title');
    expect(errorOf({ ...base, organiserName: '' })).toEqual({ field: 'organiserName', message: 'Add your name.' });
    expect(errorOf({ ...base, organiserName: 'x'.repeat(31) }).field).toBe('organiserName');
    expect(errorOf({ ...base, timezone: 'Mars/Olympus' }).field).toBe('timezone');
    expect(errorOf({ ...base, timezone: undefined }).field).toBe('timezone');
  });

  it('accepts an explicit duration and rejects invalid ones', () => {
    expect(valueOf({ ...base, durationMin: 90 }).durationMin).toBe(90);
    for (const d of [0, -30, 14, 1441, 90.5, '120']) expect(errorOf({ ...base, durationMin: d }).field).toBe('durationMin');
  });

  it('treats an explicit null as no fixed length, with no window-length minimum', () => {
    const short = { date: '2030-01-05', start: 1200, end: 1230 };
    const v = valueOf({ ...base, durationMin: null, days: [short] });
    expect(v.durationMin).toBeNull();
    expect(v.days).toEqual([short]);
  });

  it("rejects a window shorter than the event, naming the day's end field", () => {
    expect(errorOf({ ...base, days: [{ date: '2030-01-05', start: 1200, end: 1260 }] })).toEqual({
      field: 'days[0].end',
      message: "Each day's window needs to be at least 2 hr, the length of the event.",
    });
    expect(errorOf({ ...base, durationMin: 90, days: [base.days[0], { date: '2030-01-06', start: 1200, end: 1260 }] }).message).toBe(
      "Each day's window needs to be at least 1 hr 30 min, the length of the event.",
    );
    expect(valueOf({ ...base, days: [{ date: '2030-01-05', start: 1200, end: 1320 }] }).days[0]!.end).toBe(1320);
  });

  it('normalises windows that cross midnight to ends above 1440', () => {
    expect(valueOf({ ...base, days: [{ date: '2030-01-05', start: 1320, end: 60 }] }).days).toEqual([
      { date: '2030-01-05', start: 1320, end: 1500 },
    ]);
    expect(valueOf({ ...base, days: [{ date: '2030-01-05', start: 1320, end: 1500 }] }).days[0]!.end).toBe(1500);
    expect(errorOf({ ...base, days: [{ date: '2030-01-05', start: 1380, end: 30 }] }).field).toBe('days[0].end');
  });

  it('rejects malformed and impossible windows', () => {
    const day = (start: unknown, end: unknown) => ({ ...base, days: [{ date: '2030-01-05', start, end }] });
    expect(errorOf(day(1200, 1200)).message).toBe("A day's window can't start and end at the same time.");
    expect(errorOf(day(600, 2100)).message).toBe("A day's window can't be longer than 24 hours.");
    expect(errorOf(day(1440, 1600)).field).toBe('days[0].start');
    expect(errorOf(day(-1, 600)).field).toBe('days[0].start');
    expect(errorOf(day(600.5, 900)).field).toBe('days[0].start');
    expect(errorOf(day('18:00', 1380)).field).toBe('days[0].start');
    expect(errorOf(day(600, 2881)).field).toBe('days[0].end');
    expect(errorOf(day(600, null)).field).toBe('days[0].end');
  });

  it('requires 1 to 31 unique, real, current dates and sorts them', () => {
    expect(errorOf({ ...base, days: [] }).field).toBe('days');
    expect(errorOf({ ...base, days: 'tomorrow' }).field).toBe('days');
    const many = Array.from({ length: 32 }, (_, i) => ({ date: `2030-02-${String(i + 1).padStart(2, '0')}`, start: 1080, end: 1380 }));
    expect(errorOf({ ...base, days: many }).field).toBe('days');
    expect(errorOf({ ...base, days: [base.days[0], { ...base.days[0] }] })).toEqual({
      field: 'days[1].date',
      message: 'Each date can only be picked once.',
    });
    for (const date of ['2030-02-30', '2030-13-01', '30-01-05', '2030-1-5', '']) {
      expect(errorOf({ ...base, days: [{ date, start: 1080, end: 1380 }] }).field).toBe('days[0].date');
    }
    expect(errorOf({ ...base, days: [{ date: '2032-01-03', start: 1080, end: 1380 }] }).message).toBe(
      'Candidate days must be within the next two years.',
    );
    const sorted = valueOf({
      ...base,
      days: [
        { date: '2030-01-09', start: 600, end: 900 },
        { date: '2030-01-03', start: 1080, end: 1380 },
      ],
    }).days;
    expect(sorted.map((d) => d.date)).toEqual(['2030-01-03', '2030-01-09']);
  });

  it("judges past dates by the event's own timezone, not UTC", () => {
    const on = (timezone: string, date: string) =>
      validateCreateEvent({ ...base, timezone, days: [{ date, start: 1080, end: 1380 }] }, now);
    expect(on('Australia/Sydney', '2030-01-01').ok).toBe(false);
    expect(on('Australia/Sydney', '2030-01-02').ok).toBe(true);
    expect(on('America/Los_Angeles', '2030-01-01').ok).toBe(true);
    expect(on('America/Los_Angeles', '2029-12-31').ok).toBe(false);
  });

  it('rejects non-object bodies', () => {
    for (const body of [null, [], 'x', 42]) expect(errorOf(body).field).toBe('body');
  });
});
