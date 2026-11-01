import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component } from './main';
import { toFlowEvent } from '../utils/persisted-event';
import { ORGANISER_EVENTS_KEY, loadOrganiserEvents } from '../services/organiser-events';

const EVT = 'EVTAAAAAAAAAAAA1';
const TOKEN = 'orgtokenorgtokenorgtokenorgtokenorgtokenabc';
const stored = { id: EVT, title: 'Dinner', organiserName: 'Alex', durationMin: 180, timezone: 'Australia/Sydney', days: [{ date: '2026-10-23', start: 1080, end: 1380 }, { date: '2026-10-24', start: 1080, end: 1380 }], participants: [{ name: 'Sam', responded: true }, { name: 'Jo', responded: false }] };
const results = (over: Record<string, unknown> = {}) => ({
  eventId: EVT, respondedCount: 8,
  best: { date: '2026-10-24', startMin: 1140, endMin: 1320, free: 6, coming: 6, maybe: 0 },
  days: [{ date: '2026-10-23', best: { startMin: 1140, endMin: 1320, free: 8, coming: 4, maybe: 2 } }, { date: '2026-10-24', best: { startMin: 1140, endMin: 1320, free: 6, coming: 6, maybe: 0 } }],
  slots: [], ...over,
});

let store: Map<string, string>;
let calls: { url: string; init?: RequestInit }[];
let reply: () => Promise<Response>;

function mount(initialState: Record<string, unknown>, organiser = false) {
  const links = organiser ? { guestPath: '/e/' + EVT, organiserPath: `/e/${EVT}/admin?k=${TOKEN}` } : { guestPath: '/e/' + EVT };
  const c: any = new Component({ startAt: organiser ? 'fresh' : 'join', event: toFlowEvent(stored, links), initialState });
  c.__host = { __setLogicState(patch: object, cb?: () => void) { c.state = { ...c.state, ...patch }; if (cb) cb(); } };
  c.componentDidMount();
  return c;
}
function update(c: any, patch: Record<string, unknown>) { c.setState(patch); c.componentDidUpdate(c.props); }
const resultCalls = () => calls.filter((x) => x.url.endsWith('/results'));
const ok = (body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => {
  vi.useFakeTimers();
  store = new Map(); calls = [];
  reply = ok(results());
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => { calls.push({ url, init }); return url.endsWith('/results') ? reply() : Promise.resolve(new Response('{}', { status: 401 })); }));
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  vi.stubGlobal('location', { pathname: '/e/' + EVT, search: '', hash: '', origin: 'https://showup.test', host: 'showup.test' });
  vi.stubGlobal('history', { state: null, replaceState: vi.fn() });
  vi.stubGlobal('document', {});
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }), location: { assign: vi.fn() } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('results polling', () => {
  it('fetches on mount, then every 3s after each reply, without a credential for viewers', async () => {
    const c = mount({ screen: 'join' });
    expect(resultCalls()).toHaveLength(1);
    expect(resultCalls()[0]!.init!.headers).toEqual({});
    await vi.advanceTimersByTimeAsync(2999);
    expect(resultCalls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(resultCalls()).toHaveLength(2);
    expect(c.state.results).toEqual(results());
    c.componentWillUnmount();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(resultCalls()).toHaveLength(2);
  });

  it('never overlaps: the next request waits for the slow one', async () => {
    let release!: (r: Response) => void;
    reply = () => new Promise((res) => { release = res; });
    const c = mount({ screen: 'join' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(resultCalls()).toHaveLength(1);
    release(new Response(JSON.stringify(results()), { status: 200 }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(resultCalls()).toHaveLength(2);
    c.componentWillUnmount();
  });

  it('keeps the last results through failures and retries on the next tick', async () => {
    const c = mount({ screen: 'join' });
    await vi.advanceTimersByTimeAsync(0);
    expect(c.state.results).toEqual(results());
    reply = () => Promise.reject(new Error('offline'));
    await vi.advanceTimersByTimeAsync(3000);
    reply = () => Promise.resolve(new Response('{}', { status: 503 }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(c.state.results).toEqual(results());
    expect(c.renderVals()).toMatchObject({ resultsFailed: false, resultsHasBest: true });
    reply = ok(results({ respondedCount: 9 }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(c.state.results.respondedCount).toBe(9);
    expect(resultCalls()).toHaveLength(4);
    c.componentWillUnmount();
  });

  it('stops on the Respond form, ignores the reply that was in flight, and resumes with one loop', async () => {
    let release!: (r: Response) => void;
    reply = () => new Promise((res) => { release = res; });
    const c = mount({ screen: 'join' });
    update(c, { screen: 'respond' });
    release(new Response(JSON.stringify(results({ respondedCount: 99 })), { status: 200 }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(resultCalls()).toHaveLength(1);
    expect(c.state.results).toBeUndefined();
    reply = ok(results());
    update(c, { screen: 'event', mode: 'guest' });
    update(c, { liveMsg: 'rerender' });
    update(c, { screen: 'event' });
    expect(resultCalls()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(resultCalls()).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(3000);
    expect(resultCalls()).toHaveLength(4);
    c.componentWillUnmount();
  });

  it('organiser sends its token only in the Authorization header', () => {
    const c = mount({ screen: 'event', mode: 'organiser', myName: 'Alex' }, true);
    const [call] = resultCalls();
    expect(call!.url).toBe(`/api/events/${EVT}/results`);
    expect(call!.url).not.toContain(TOKEN);
    expect(call!.init!.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    c.componentWillUnmount();
  });
});

describe('results view', () => {
  it('formats the best time and one row per day from the API values', async () => {
    const c = mount({ screen: 'event', mode: 'guest', participantId: 'P1', myName: 'Sam' });
    expect(c.renderVals()).toMatchObject({ resultsLoading: true, resultsRows: [] });
    await vi.advanceTimersByTimeAsync(0);
    const v = c.renderVals();
    expect(v.resultsBestLine).toBe('Best time: Sat 7pm · 6 coming');
    expect(v.resultsRows.map((r: any) => [r.label, r.counts, r.isBest])).toEqual([
      ['Fri 23 Oct · 7pm', '8 free · 4 coming · 2 maybe', false],
      ['Sat 24 Oct · 7pm', '6 free · 6 coming', true],
    ]);
    expect(v.resultsRows[0].freePct).toBe('100');
    expect(v.resultsRows[0].comingPct).toBe('50');
    expect(v.resultsRows[1].freePct).toBe('75');
    expect(v.showPeople).toBe(false);
    expect(v.countLine).toBe('8 responses');
    c.componentWillUnmount();
  });

  it('shows the empty, no-confirmed-time and no-time-fits states', async () => {
    reply = ok(results({ respondedCount: 0, best: null, days: [{ date: '2026-10-23', best: null }, { date: '2026-10-24', best: null }] }));
    const c = mount({ screen: 'join' });
    await vi.advanceTimersByTimeAsync(0);
    expect(c.renderVals()).toMatchObject({ resultsEmpty: true, resultsNoBest: false, resultsRows: [] });
    reply = ok(results({ respondedCount: 2, best: null, days: [{ date: '2026-10-23', best: { startMin: 1140, endMin: 1320, free: 2, coming: 0, maybe: 0 } }, { date: '2026-10-24', best: null }] }));
    await vi.advanceTimersByTimeAsync(3000);
    const v = c.renderVals();
    expect(v).toMatchObject({ resultsEmpty: false, resultsNoBest: true, resultsHasBest: false });
    expect(v.resultsRows[1].label).toBe('Sat 24 Oct · No time fits');
    expect(v.resultsRows[1].counts).toBe('');
    c.componentWillUnmount();
  });

  it('shows a neutral error, not numbers, when results never loaded', async () => {
    reply = () => Promise.resolve(new Response('{}', { status: 500 }));
    const c = mount({ screen: 'join' });
    await vi.advanceTimersByTimeAsync(0);
    expect(c.renderVals()).toMatchObject({ resultsFailed: true, resultsLoading: false, resultsHasBest: false, resultsRows: [] });
    c.componentWillUnmount();
  });

  it.each([['organiser', true], ['guest', false]])('%s sees silver circles for who responded and who has not; nothing else about individuals', async (mode, org) => {
    reply = ok({ ...results(), people: [{ name: 'Sam', responded: true }, { name: 'ella', responded: false }] });
    const c = mount({ screen: 'event', mode, myName: 'Alex', participantId: org ? undefined : 'P1' }, org);
    await vi.advanceTimersByTimeAsync(0);
    const v = c.renderVals();
    expect(v).toMatchObject({ showPeople: true, showLiveResults: true });
    expect(v.resultsPeople.map((p: any) => [p.initial, p.tip, p.cls.includes('is-waiting')])).toEqual([['S', 'Sam', false], ['E', 'ella \u00b7 not replied yet', true]]);
    expect(v.resultsPeople[0].cls).toContain('glass-silver');
    expect(Object.keys(v.resultsPeople[0]).sort()).toEqual(['aria', 'cls', 'initial', 'key', 'name', 'tip']);
    c.componentWillUnmount();
  });

  it('a stored event with submitted responses renders the event screen without the legacy summary', () => {
    const c = mount({ screen: 'event', mode: 'guest', participantId: 'P1', myName: 'Sam', justSaved: true });
    const v = c.renderVals();
    expect(v).toMatchObject({ showResults: false, dotRows: [], guestStatus: 'Response saved.', isPrototype: false });
    c.setState({ justSaved: false });
    expect(c.renderVals().guestStatus).toBe("You've responded.");
    c.setState({ mode: 'organiser' });
    expect(() => c.renderVals()).not.toThrow();
    c.componentWillUnmount();
  });
});

describe('Your events', () => {
  it('saves a created event locally, lists it newest first and opens its organiser link', async () => {
    store.set(ORGANISER_EVENTS_KEY, JSON.stringify([{ eventId: 'OLDAAAAAAAAAAAA1', title: 'Old', adminUrl: '/e/OLDAAAAAAAAAAAA1/admin?k=x', createdAt: '2026-10-01T00:00:00.000Z' }]));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ id: 'NEWAAAAAAAAAAAA2', guestPath: '/e/NEWAAAAAAAAAAAA2', organiserPath: '/e/NEWAAAAAAAAAAAA2/admin?k=tok' }), { status: 201 }))));
    const c: any = new Component({ startAt: 'create' });
    c.__host = { __setLogicState(patch: object) { c.state = { ...c.state, ...patch }; } };
    c.createEvent();
    await vi.advanceTimersByTimeAsync(0);
    expect((window as any).location.assign).toHaveBeenCalledWith('/e/NEWAAAAAAAAAAAA2/admin?k=tok');
    const saved = loadOrganiserEvents();
    expect(saved.map((e) => e.eventId)).toEqual(['NEWAAAAAAAAAAAA2', 'OLDAAAAAAAAAAAA1']);
    expect(saved[0]).toMatchObject({ title: 'Weekend plans', adminUrl: '/e/NEWAAAAAAAAAAAA2/admin?k=tok' });
    expect(Number.isNaN(Date.parse(saved[0]!.createdAt))).toBe(false);

    const home: any = new Component({ startAt: 'landing' });
    const v = home.landingVals(home.state);
    expect(v.hasMyEvents).toBe(true);
    expect(v.myEvents.map((e: any) => [e.name, e.href])).toEqual([['Weekend plans', '/e/NEWAAAAAAAAAAAA2/admin?k=tok'], ['Old', '/e/OLDAAAAAAAAAAAA1/admin?k=x']]);
  });

  it('saves nothing when creation fails, and survives malformed storage', async () => {
    store.set(ORGANISER_EVENTS_KEY, '{not json');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 400 }))));
    const c: any = new Component({ startAt: 'create' });
    c.__host = { __setLogicState(patch: object) { c.state = { ...c.state, ...patch }; } };
    c.createEvent();
    await vi.advanceTimersByTimeAsync(0);
    expect(loadOrganiserEvents()).toEqual([]);
    expect(store.get(ORGANISER_EVENTS_KEY)).toBe('{not json');
    const home: any = new Component({ startAt: 'landing' });
    expect(home.landingVals(home.state).hasMyEvents).toBe(false);
  });
});
