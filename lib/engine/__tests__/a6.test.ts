/* Expected values from docs/BACKEND_REQUIREMENTS.md ("Characterisation values for the engine", stage A6). */
import { describe, expect, it } from 'vitest';
import { rankSlots, slotWindow, viableGroup } from '../index';
import type { EventData } from '../types';
import { ALEX, JESS, a6Event } from './a6-fixtures';
// Formatting comes from the UI (read-only).
import { fmtCompact } from '../../ui/utils/format';

// A6 records the prototype's ranking, which ignores Favourites.
const OLD = { favourites: false };
const alexAlone = (): EventData => a6Event([ALEX()]);
const alexAndJess = (): EventData => a6Event([ALEX(), JESS()]);
const dots = (ev: EventData, id: string) => {
  const d = rankSlots(ev, OLD).days.find((x) => x.slot.id === id)!;
  const w = slotWindow(ev.win, d.slot, d);
  return { time: w.window ? fmtCompact(w.window.s, w.window.e) : '', go: w.go, free: w.free };
};

describe('A6: Alex alone', () => {
  it('best is fri: both days go 1 / free 1, and on a full tie the earlier day wins', () => {
    const r = rankSlots(alexAlone(), OLD);
    expect(r.days.map((d) => [d.slot.id, d.go, d.free])).toEqual([
      ['fri', 1, 1],
      ['sat', 1, 1],
    ]);
    expect(r.best?.slot.id).toBe('fri');
  });
  it('dayDots: fri 7 – 11pm 1/1 and sat 7 – 11pm 1/1', () => {
    const ev = alexAlone();
    expect(dots(ev, 'fri')).toEqual({ time: '7 – 11pm', go: 1, free: 1 });
    expect(dots(ev, 'sat')).toEqual({ time: '7 – 11pm', go: 1, free: 1 });
  });
});

describe('A6: Alex + Jess', () => {
  it('best is sat', () => {
    expect(rankSlots(alexAndJess(), OLD).best?.slot.id).toBe('sat');
  });
  it('fri: go 1, free 2; Jess\'s "at least 3" fails, so she is eliminated', () => {
    const ev = alexAndJess();
    const d = rankSlots(ev, OLD).days.find((x) => x.slot.id === 'fri')!;
    expect([d.go, d.free]).toEqual([1, 2]);
    const v = viableGroup('fri', ev.responses, ev.win);
    expect(v.group).toEqual(['Alex']);
    expect(v.rounds).toHaveLength(1);
    expect(v.rounds[0]!.removed).toEqual(['Jess']);
    expect(v.rounds[0]!.failed['Jess']).toEqual([{ type: 'min_attendees', n: 3 }]);
  });
  it("fri dots: 7 – 11pm, 1 of 1 (Jess's 6–10pm range doesn't cover the window)", () => {
    expect(dots(alexAndJess(), 'fri')).toEqual({ time: '7 – 11pm', go: 1, free: 1 });
  });
  it('sat: go 2, free 2, dots 8 – 11pm, 2 of 2', () => {
    const ev = alexAndJess();
    const d = rankSlots(ev, OLD).days.find((x) => x.slot.id === 'sat')!;
    expect([d.go, d.free]).toEqual([2, 2]);
    expect(viableGroup('sat', ev.responses, ev.win)).toEqual({ group: ['Alex', 'Jess'], rounds: [] });
    expect(dots(ev, 'sat')).toEqual({ time: '8 – 11pm', go: 2, free: 2 });
  });
});
