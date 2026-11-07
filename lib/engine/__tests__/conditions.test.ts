/* Condition classes (PRODUCT-RULES §3–§6): group conditions in the fixed point, time conditions narrowing
   Free, unresolvable conditions making people tentative. One test per engine row of the §9 table, then the
   extra C8 cases. Participant ids here are lower-case and display names capitalised, so nothing can pass by
   matching names. */
import { describe, expect, it } from 'vitest';
import { rankSlots, slotStats } from '../index';
import type { Condition, EventData, Range, Response, Slot, Willingness } from '../types';

const h = (hour: number) => hour * 60;
const WIN: Range = { s: h(18), e: h(23) };

type Answer = { avail?: number; will?: Willingness; ranges?: Range[]; favs?: Range[]; conds?: Condition[] | null };
/** Defaults: Free, the whole 6–11pm window; Yes, or If… when conditions are given. */
function person(id: string, answers: Record<string, Answer>): Response {
  const r: Response = { id, who: id.charAt(0).toUpperCase() + id.slice(1), role: 'guest', avail: {}, ranges: {}, will: {}, conds: {} };
  for (const [day, a] of Object.entries(answers)) {
    r.avail[day] = a.avail ?? 1;
    r.will[day] = a.will !== undefined ? a.will : a.conds ? 'if' : 'yes';
    r.ranges[day] = a.ranges ?? [{ ...WIN }];
    r.conds[day] = a.conds ?? null;
    if (a.favs) (r.favs ??= {})[day] = a.favs;
  }
  return r;
}
const requires = (...people: string[]): Condition => ({ type: 'requires', people });
const requiresAny = (...people: string[]): Condition => ({ type: 'requires_any', people });
const atLeast = (n: number): Condition => ({ type: 'min_attendees', n });
const time = (t: { earliest_start?: number; latest_end?: number }): Condition => ({ type: 'time', ...t });
const unresolvable = (summary = 'depends on the weather'): Condition => ({ type: 'unresolvable', summary });

const day = (responses: Response[], win: Range = WIN, duration = 120) => slotStats('a', responses, win, { duration });
const event = (slots: Slot[], responses: Response[], extra: Partial<EventData> = {}): EventData => ({
  slots,
  win: WIN,
  responses,
  ...extra,
});
const at = (st: ReturnType<typeof day>, s: number) => st.slots.find((t) => t.s === s)!;
const counts = (st: { free: number; go: number; tentative: number }) => [st.free, st.go, st.tentative];

describe('PRODUCT-RULES §9 (engine rows)', () => {
  it('A available 19–21, B 21–23, duration 2 h: no slot has both free', () => {
    const st = day([
      person('ana', { a: { ranges: [{ s: h(19), e: h(21) }] } }),
      person('bob', { a: { ranges: [{ s: h(21), e: h(23) }] } }),
    ]);
    expect(Math.max(...st.slots.map((t) => t.free))).toBe(1);
  });

  it('A requires B, B requires A, both free: both viable', () => {
    const st = day([person('ana', { a: { conds: [requires('bob')] } }), person('bob', { a: { conds: [requires('ana')] } })]);
    expect(st.group).toEqual(['ana', 'bob']);
  });

  it('A requires B, B requires A, B not free: neither viable', () => {
    const st = day([person('ana', { a: { conds: [requires('bob')] } }), person('bob', { a: { avail: 0, conds: [requires('ana')] } })]);
    expect(counts(st)).toEqual([1, 0, 0]);
  });

  it('min_attendees 5, exactly 5 viable including self: viable', () => {
    const st = day([person('ana', { a: { conds: [atLeast(5)] } }), ...['bob', 'cleo', 'dev', 'eve'].map((id) => person(id, { a: {} }))]);
    expect(st.go).toBe(5);
  });

  it('min_attendees 5, 4 viable: not viable', () => {
    const st = day([person('ana', { a: { conds: [atLeast(5)] } }), ...['bob', 'cleo', 'dev'].map((id) => person(id, { a: {} }))]);
    expect([st.go, st.group.includes('ana')]).toEqual([3, false]);
  });

  it('A requires_any [B, C], only C free: A viable', () => {
    const st = day([
      person('ana', { a: { conds: [requiresAny('bob', 'cleo')] } }),
      person('bob', { a: { will: 'no' } }),
      person('cleo', { a: {} }),
    ]);
    expect(st.group).toEqual(['ana', 'cleo']);
  });

  it('A requires_any [B, C], neither free: A not viable', () => {
    const st = day([
      person('ana', { a: { conds: [requiresAny('bob', 'cleo')] } }),
      person('bob', { a: { will: 'no' } }),
      person('cleo', { a: { avail: 0 } }),
    ]);
    expect(counts(st)).toEqual([1, 0, 0]);
  });

  it('time latest_end 22:00: not free for 20:00–23:00, free for 19:00–22:00', () => {
    const st = day([person('ana', { a: { conds: [time({ latest_end: h(22) })] } })], WIN, 180);
    expect(at(st, h(20)).free).toBe(0);
    expect([at(st, h(19)).free, at(st, h(19)).go]).toEqual([1, 1]);
  });

  it('unresolvable condition only, free: tentative, not viable', () => {
    expect(counts(day([person('ana', { a: { conds: [unresolvable()] } })]))).toEqual([1, 0, 1]);
  });

  it('group condition holds + unresolvable: tentative', () => {
    const st = day([person('ana', { a: { conds: [requires('bob'), unresolvable()] } }), person('bob', { a: {} })]);
    expect([st.group, st.tentative, st.tentativeList.map((r) => r.id)]).toEqual([['bob'], 1, ['ana']]);
  });

  it('group condition fails + unresolvable: neither viable nor tentative', () => {
    expect(counts(day([person('ana', { a: { conds: [requires('zed'), unresolvable()] } })]))).toEqual([1, 0, 0]);
  });

  it("A min_attendees 3; S = A, B (viable) and C (tentative): A not viable (tentative people don't count)", () => {
    const st = day([
      person('ana', { a: { conds: [atLeast(3)] } }),
      person('bob', { a: {} }),
      person('cleo', { a: { conds: [unresolvable()] } }),
    ]);
    expect([st.group, st.tentative]).toEqual([['bob'], 1]);
  });

  it('A requires B; B is tentative: A not viable', () => {
    const st = day([person('ana', { a: { conds: [requires('bob')] } }), person('bob', { a: { conds: [unresolvable()] } })]);
    expect(counts(st)).toEqual([2, 0, 1]);
  });

  it('"Only if Tom isn\'t coming", stored as unresolvable: tentative', () => {
    expect(day([person('ana', { a: { conds: [unresolvable("only if Tom isn't coming")] } })]).tentative).toBe(1);
  });

  it('condition naming someone outside the event, stored as unresolvable: tentative', () => {
    expect(day([person('ana', { a: { conds: [unresolvable("Sam isn't in this event")] } })]).tentative).toBe(1);
  });

  it('window 22:00–01:00 on Friday: all its slots count as Friday', () => {
    const ev = event(
      [
        { id: 'fri', iso: '2026-10-23', win: { s: h(22), e: h(25) } },
        { id: 'sat', iso: '2026-10-24' },
      ],
      [person('ana', { fri: { ranges: [{ s: h(23), e: h(25) }] }, sat: { ranges: [{ s: h(19), e: h(21) }] } })],
    );
    const r = rankSlots(ev);
    expect(r.days[0]!.slots.map((t) => t.s)).toEqual([h(22), h(22.5), h(23)]);
    expect([r.best?.slot.id, r.best?.window]).toEqual(['fri', { s: h(23), e: h(25) }]);
  });

  it('condition naming a roster member who has not responded: treated as not attending', () => {
    expect(counts(day([person('ana', { a: { conds: [requires('dev')] } })]))).toEqual([1, 0, 0]);
  });

  it('If… with no confirmed condition: not free (never treated as Yes), no error', () => {
    const st = day([
      person('ana', { a: { will: 'if', conds: null } }),
      person('bob', { a: { will: 'if', conds: [] } }),
      person('cleo', { a: {} }),
    ]);
    expect([st.free, st.group]).toEqual([1, ['cleo']]);
  });

  it('no slot has any viable person: best is null', () => {
    expect(rankSlots(event([{ id: 'a' }], [person('ana', { a: { conds: [requires('zed')] } })])).best).toBeNull();
  });

  it('two slots tie on viable count: broken by tentative, then Favourites, then earliest, then creation order', () => {
    const days = [
      { id: 'a', iso: '2026-10-23' },
      { id: 'b', iso: '2026-10-24' },
    ];
    // Tentative beats Favourites: a has a Favourite, b has a tentative person.
    const tent = event(days, [person('ana', { a: { favs: [{ ...WIN }] }, b: {} }), person('tom', { b: { conds: [unresolvable()] } })]);
    expect(rankSlots(tent).days.map((d) => [d.slot.id, d.go, d.tentative, d.favourites])).toEqual([
      ['a', 1, 0, 1],
      ['b', 1, 1, 0],
    ]);
    expect(rankSlots(tent).best?.slot.id).toBe('b');
    // Equal tentative: Favourites decide.
    const fav = event(days, [person('ana', { a: {}, b: { favs: [{ ...WIN }] } })]);
    expect(rankSlots(fav).best?.slot.id).toBe('b');
    // Equal Favourites: the earlier date.
    const early = event(
      [
        { id: 'late', iso: '2026-10-24' },
        { id: 'soon', iso: '2026-10-23' },
      ],
      [person('ana', { late: {}, soon: {} })],
    );
    expect(rankSlots(early).best?.slot.id).toBe('soon');
    // Same date and start: creation order.
    const same = event(
      [
        { id: 'p', iso: '2026-10-23' },
        { id: 'q', iso: '2026-10-23' },
      ],
      [person('ana', { p: {}, q: {} })],
    );
    expect(rankSlots(same).best?.slot.id).toBe('p');
  });

  it('§8 seed: tentative is 0 at every stage', () => {
    const R = [{ s: h(19), e: h(22) }];
    const p = (id: string, fri: Willingness, sat: Willingness, conds: { fri?: Condition[]; sat?: Condition[] } = {}): Response => ({
      id,
      who: id,
      role: 'guest',
      avail: { fri: 1, sat: 1 },
      will: { fri, sat },
      ranges: { fri: fri === 'no' ? [] : R, sat: sat === 'no' ? [] : R },
      conds: { fri: conds.fri ?? null, sat: conds.sat ?? null },
    });
    const seed = [
      p('alex', 'yes', 'yes'),
      p('ben', 'yes', 'yes'),
      p('chloe', 'yes', 'yes'),
      p('dan', 'yes', 'no'),
      p('finn', 'if', 'if', { fri: [requires('ella')], sat: [requires('ella')] }),
      p('grace', 'if', 'no', { fri: [atLeast(7)] }),
      p('harry', 'if', 'no', { fri: [requires('finn')] }),
      p('jess', 'no', 'yes'),
    ];
    const run = (rs: Response[]) =>
      rankSlots({
        slots: [
          { id: 'fri', iso: '2026-10-23' },
          { id: 'sat', iso: '2026-10-24' },
        ],
        win: WIN,
        duration: 180,
        responses: rs,
      }).days.map((d) => [d.free, d.go, d.tentative]);
    expect(run(seed)).toEqual([
      [7, 4, 0],
      [5, 4, 0],
    ]);
    expect(run([...seed, p('ella', 'yes', 'yes')])).toEqual([
      [8, 8, 0],
      [6, 6, 0],
    ]);
    expect(run([...seed, p('ella', 'if', 'yes', { fri: [requires('jess')] })])).toEqual([
      [8, 4, 0],
      [6, 6, 0],
    ]);
  });
});

describe('group conditions', () => {
  it('requires_any in a cascade', () => {
    const st = day([
      person('ana', { a: { conds: [requiresAny('bob', 'cleo')] } }),
      person('bob', { a: { conds: [requires('dev')] } }), // dev never responds
      person('cleo', { a: { conds: [requiresAny('bob')] } }),
      person('eve', { a: {} }),
    ]);
    expect(st.group).toEqual(['eve']);
    expect(st.rounds.map((r) => r.removed)).toEqual([['bob'], ['cleo'], ['ana']]);
    expect(st.rounds[0]!.failed['bob']).toEqual([requires('dev')]);
  });

  it('requires_any mutual dependency: both viable together, neither when one is not free', () => {
    const both = [
      person('ana', { a: { conds: [requiresAny('bob', 'zed')] } }),
      person('bob', { a: { conds: [requiresAny('ana', 'yan')] } }),
    ];
    expect(day(both).group).toEqual(['ana', 'bob']);
    both[1]!.ranges.a = [];
    expect(counts(day(both))).toEqual([1, 0, 0]);
  });

  it('conditions combine with AND', () => {
    const rs = [person('ana', { a: { conds: [requires('bob'), atLeast(3)] } }), person('bob', { a: {} })];
    expect(day(rs).group).toEqual(['bob']);
    rs.push(person('cleo', { a: {} }));
    expect(day(rs).group).toEqual(['ana', 'bob', 'cleo']);
  });

  it('references are participant ids, independent of display names', () => {
    const ana: Response = {
      id: 'u1',
      who: 'Ana',
      role: 'guest',
      avail: { a: 1 },
      ranges: { a: [{ ...WIN }] },
      will: { a: 'if' },
      conds: { a: [requires('u2')] },
    };
    const ben: Response = {
      id: 'u2',
      who: 'Ben',
      role: 'guest',
      avail: { a: 1 },
      ranges: { a: [{ ...WIN }] },
      will: { a: 'yes' },
      conds: {},
    };
    expect(day([ana, ben]).group).toEqual(['u1', 'u2']);
    // A display name is not an id.
    expect(day([{ ...ana, conds: { a: [requires('Ben')] } }, ben]).group).toEqual(['u2']);
    // Someone whose display name is "u2" doesn't satisfy a reference to id u2.
    const impostor: Response = { ...ben, id: 'u3', who: 'u2' };
    expect(day([ana, { ...ben, will: { a: 'no' } }, impostor]).group).toEqual(['u3']);
  });

  it('results do not depend on response order', () => {
    const rs = [
      person('ana', { a: { conds: [requiresAny('bob', 'cleo')] } }),
      person('bob', { a: { conds: [atLeast(4)] } }),
      person('cleo', { a: { conds: [requires('ana')] } }),
      person('dev', { a: {} }),
      person('tom', { a: { conds: [requires('cleo'), unresolvable()] } }),
    ];
    const fwd = day(rs),
      rev = day(rs.slice().reverse());
    expect([fwd.group.slice().sort(), fwd.tentative]).toEqual([rev.group.slice().sort(), rev.tentative]);
    expect([fwd.group.slice().sort(), fwd.tentative]).toEqual([['ana', 'bob', 'cleo', 'dev'], 1]);
  });
});

describe('tentative', () => {
  it('a tentative person never satisfies another tentative person, and counts themself for min_attendees', () => {
    const rs = [person('cleo', { a: { conds: [unresolvable(), requires('dev')] } }), person('dev', { a: { conds: [unresolvable()] } })];
    expect([day(rs).tentative, day(rs).tentativeList.map((r) => r.id)]).toEqual([1, ['dev']]);
    const three = [person('ana', { a: {} }), person('bob', { a: {} }), person('tom', { a: { conds: [unresolvable(), atLeast(3)] } })];
    expect(day(three).tentative).toBe(1);
    three[2]!.conds.a = [unresolvable(), atLeast(4)];
    expect(day(three).tentative).toBe(0);
  });

  it('a tentative-only event has no recommendation; the day shows its slot with the most tentative people', () => {
    const r = rankSlots(
      event(
        [{ id: 'a' }],
        [
          person('ana', { a: { conds: [unresolvable()] } }),
          person('bob', { a: { conds: [unresolvable()], ranges: [{ s: h(21), e: h(23) }] } }),
        ],
      ),
    );
    expect(r.best).toBeNull();
    expect([r.days[0]!.window, r.days[0]!.go, r.days[0]!.tentative]).toEqual([{ s: h(21), e: h(23) }, 0, 2]);
  });

  it('tentative count breaks a viable tie before Favourites, within a day too', () => {
    const st = day([
      person('ana', { a: { favs: [{ s: h(18), e: h(20) }] } }),
      person('tom', { a: { conds: [unresolvable()], ranges: [{ s: h(21), e: h(23) }] } }),
    ]);
    expect([st.window, st.go, st.tentative, st.favourites]).toEqual([{ s: h(21), e: h(23) }, 1, 1, 0]);
  });

  it('a day with no viable slot: most tentative, then most free, then earliest', () => {
    const blocked = (id: string) => person(id, { a: { conds: [requires('zed')], ranges: [{ s: h(18), e: h(20) }] } });
    const rs = [
      blocked('bob'),
      blocked('cleo'),
      blocked('dev'),
      person('tom', { a: { conds: [unresolvable()], ranges: [{ s: h(21), e: h(23) }] } }),
    ];
    expect([day(rs).window, day(rs).free, day(rs).tentative]).toEqual([{ s: h(21), e: h(23) }, 1, 1]);
    expect(day(rs.slice(0, 3)).window).toEqual({ s: h(18), e: h(20) });
  });
});

describe('time conditions', () => {
  it('clip availability before merging and coverage; several combine with AND', () => {
    const st = day([
      person('ana', {
        a: {
          conds: [time({ earliest_start: h(19) }), time({ latest_end: h(22) })],
          ranges: [
            { s: h(18), e: h(20) },
            { s: h(20), e: h(23) },
          ],
        },
      }),
    ]);
    expect(st.slots.filter((t) => t.free).map((t) => t.s)).toEqual([h(19), h(19.5), h(20)]);
  });

  it('a range emptied by clipping is dropped; if nothing is left the person is never free', () => {
    const one = day([
      person('ana', {
        a: {
          conds: [time({ earliest_start: h(20.5) })],
          ranges: [
            { s: h(18), e: h(20) },
            { s: h(20.5), e: h(23) },
          ],
        },
      }),
    ]);
    expect(one.slots.filter((t) => t.free).map((t) => t.s)).toEqual([h(20.5), h(21)]);
    const none = day([person('ana', { a: { conds: [time({ earliest_start: h(20) })], ranges: [{ s: h(18), e: h(20) }] } })]);
    expect(none.slots.every((t) => t.free === 0)).toBe(true);
  });

  it('cross-midnight restrictions on the linear minute axis', () => {
    const LATE: Range = { s: h(22), e: h(26) };
    const free = (c: Condition) =>
      day([person('ana', { a: { conds: [c], ranges: [{ ...LATE }] } })], LATE)
        .slots.filter((t) => t.free)
        .map((t) => t.s);
    expect(free(time({ latest_end: h(25) }))).toEqual([h(22), h(22.5), h(23)]); // done by 1am
    expect(free(time({ earliest_start: h(24) }))).toEqual([h(24)]); // not before midnight
  });

  it('time conditions apply to the person only; others are unaffected', () => {
    const st = day([person('ana', { a: { conds: [time({ latest_end: h(20) })] } }), person('bob', { a: {} })]);
    expect([at(st, h(18)).group, at(st, h(19)).group]).toEqual([['ana', 'bob'], ['bob']]);
  });

  it('conditions on a Yes day are ignored', () => {
    const st = day([person('ana', { a: { will: 'yes', conds: [unresolvable(), time({ latest_end: h(19) })] } })]);
    expect(st.slots.every((t) => t.go === 1)).toBe(true);
  });
});
