/* Ranking with the favourites tie-break (the default): group size, then Favourites in the viable group,
   then the earliest eligible date/time, then the earlier slot. */
import { describe, expect, it } from 'vitest';
import { rankSlots } from '../index';
import type { EventData, Response, Willingness } from '../types';
import { ALEX, a6Event } from './a6-fixtures';

/** A response with the same answer shape on slots a and b: [avail, will] per slot; full window, no conditions. */
function person(who: string, a: [number, Willingness], b: [number, Willingness]): Response {
  const full = [{ s: 1020, e: 1440 }];
  return {
    id: who,
    who,
    role: 'guest',
    avail: { a: a[0], b: b[0] },
    will: { a: a[1], b: b[1] },
    ranges: { a: full, b: full },
    conds: { a: null, b: null },
  };
}
const event = (responses: Response[]): EventData => ({ slots: [{ id: 'a' }, { id: 'b' }], win: { s: 1020, e: 1440 }, responses });

describe('favourites tie-break', () => {
  it('two slots tie on group size: the favourite decides (even against more people free)', () => {
    const ev = event([
      person('Ana', [1, 'yes'], [2, 'yes']), // favourite on b
      person('Ben', [1, 'yes'], [1, 'yes']),
      person('Cleo', [1, 'if'], [0, null]), // free on a only (but eliminated): a has more free (3 vs 2)
    ]);
    ev.responses[2]!.conds.a = [{ type: 'requires', people: ['Zed'] }];
    const r = rankSlots(ev);
    expect(r.days.map((d) => [d.slot.id, d.go, d.favourites, d.free])).toEqual([
      ['a', 2, 0, 3],
      ['b', 2, 1, 2],
    ]);
    expect(r.best?.slot.id).toBe('b');
    expect(rankSlots(ev, { favourites: false }).best?.slot.id).toBe('a'); // without Favourites: the earlier slot
  });

  it('group size still beats favourites', () => {
    const ev = event([person('Ana', [1, 'yes'], [2, 'yes']), person('Ben', [1, 'yes'], [2, 'yes']), person('Cleo', [1, 'yes'], [1, 'no'])]);
    const r = rankSlots(ev);
    expect(r.days.map((d) => [d.slot.id, d.go, d.favourites])).toEqual([
      ['a', 3, 0],
      ['b', 2, 2],
    ]);
    expect(r.best?.slot.id).toBe('a');
  });

  it('favourites only count inside the viable group (not people who said No or were eliminated)', () => {
    const ev = event([
      person('Ana', [1, 'yes'], [1, 'yes']),
      person('Ben', [1, 'yes'], [2, 'no']), // favourite but won't go
      person('Cleo', [1, 'yes'], [2, 'if']), // favourite but eliminated (needs 4 people)
    ]);
    ev.responses[2]!.conds.b = [{ type: 'min_attendees', n: 4 }];
    ev.responses[1]!.will.a = 'no';
    const r = rankSlots(ev);
    expect(r.days.map((d) => [d.slot.id, d.go, d.favourites])).toEqual([
      ['a', 2, 0],
      ['b', 1, 0],
    ]);
    expect(r.best?.slot.id).toBe('a');
  });

  it('equal favourites fall back to the earlier slot; people free no longer decide', () => {
    const moreFreeOnB = event([person('Ana', [2, 'yes'], [2, 'yes']), person('Ben', [0, null], [1, 'no'])]);
    expect(rankSlots(moreFreeOnB).best?.slot.id).toBe('a');
    const fullTie = event([person('Ana', [2, 'yes'], [2, 'yes'])]);
    expect(rankSlots(fullTie).best?.slot.id).toBe('a');
  });

  it('Alex alone (A6 fixture): his Favourite Saturday now beats Friday', () => {
    expect(rankSlots(a6Event([ALEX()])).best?.slot.id).toBe('sat');
  });
});
