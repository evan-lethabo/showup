import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayIso } from './dates';
import { eventDetails, toFlowEvent } from './persisted-event';

const stored = {
  id: 'abcDEF123_-xyz00',
  title: 'Weekend plans',
  organiserName: 'Alex',
  durationMin: 120,
  timezone: 'Australia/Sydney',
  days: [
    { date: '2026-10-23', start: 1020, end: 1440 },
    { date: '2026-10-24', start: 1020, end: 1440 },
  ],
};

describe('stored events in the flow', () => {
  it('maps a stored event onto the flow event shape with per-day windows', () => {
    const ev = toFlowEvent(stored, { guestPath: '/e/abcDEF123_-xyz00' });
    expect(ev).toMatchObject({
      id: stored.id,
      name: 'Weekend plans',
      organiser: 'Alex',
      duration: 120,
      responses: [],
      proposal: null,
      persisted: true,
      win: { s: 1020, e: 1440 },
    });
    expect(ev.slots.map((s) => [s.iso, s.short, s.win])).toEqual([
      ['2026-10-23', 'Fri 23 Oct', { s: 1020, e: 1440 }],
      ['2026-10-24', 'Sat 24 Oct', { s: 1020, e: 1440 }],
    ]);
  });

  it('describes the days, windows and duration', () => {
    expect(eventDetails(toFlowEvent(stored, { guestPath: '/' }))).toBe('Fri 23 Oct, Sat 24 Oct · 5pm – 12am · 2 hr event');
    const mixed = { ...stored, durationMin: 90, days: [stored.days[0]!, { date: '2026-10-24', start: 1320, end: 1500 }] };
    expect(eventDetails(toFlowEvent(mixed, { guestPath: '/' }))).toBe('Fri 23 Oct 5pm – 12am, Sat 24 Oct 10pm – 1am · 1 hr 30 min event');
  });
});

describe('todayIso', () => {
  const tz = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = tz;
  });

  it("is the device's local date on both sides of the UTC date boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T14:30:00Z'));
    process.env.TZ = 'Australia/Sydney';
    expect(todayIso()).toBe('2026-10-18');
    vi.setSystemTime(new Date('2026-10-18T03:00:00Z'));
    process.env.TZ = 'America/Los_Angeles';
    expect(todayIso()).toBe('2026-10-17');
  });
});
