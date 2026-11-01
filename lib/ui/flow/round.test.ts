import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component } from './main';
import { toFlowEvent } from '../utils/persisted-event';

const EVT = 'EVTAAAAAAAAAAAA1';
const TOKEN = 'orgtokenorgtokenorgtokenorgtokenorgtokenabc';
const CRED = 'PARTAAAAAAAAAAA1.secret';
const stored = { id: EVT, title: 'Dinner', organiserName: 'Alex', durationMin: 180, timezone: 'Australia/Sydney', days: [{ date: '2026-10-23', start: 1080, end: 1380 }, { date: '2026-10-24', start: 1080, end: 1380 }], participants: [{ name: 'Sam', responded: true }] };
const results = { eventId: EVT, respondedCount: 2, best: { date: '2026-10-24', startMin: 1140, endMin: 1320, free: 2, coming: 2, maybe: 0 }, days: [{ date: '2026-10-23', best: { startMin: 1080, endMin: 1260, free: 1, coming: 1, maybe: 0 } }, { date: '2026-10-24', best: { startMin: 1140, endMin: 1320, free: 2, coming: 2, maybe: 0 } }], slots: [] };
const open = { status: 'open', date: '2026-10-24', startMin: 1140, endMin: 1320, deadline: '2026-10-23', minAttendees: 3 };

let store: Map<string, string>;
let calls: { url: string; init?: RequestInit }[];
let proposal: object | null;
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

function mount(mode: 'organiser' | 'guest') {
  const links = mode === 'organiser' ? { guestPath: '/e/' + EVT, organiserPath: `/e/${EVT}/admin?k=${TOKEN}` } : { guestPath: '/e/' + EVT };
  const c: any = new Component({ startAt: 'fresh', event: toFlowEvent(stored, links), initialState: { screen: 'event', mode, myName: 'Alex' } });
  c.__host = { __setLogicState(patch: object, cb?: () => void) { c.state = { ...c.state, ...patch }; if (cb) cb(); } };
  c.componentDidMount();
  return c;
}

beforeEach(() => {
  vi.useFakeTimers();
  store = new Map([[`showup-guest-${EVT}`, CRED]]); calls = []; proposal = null;
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/results')) return json(results);
    if (url.endsWith('/proposal/vote')) return json({ proposal: { ...open, myVote: JSON.parse(String(init!.body)).vote } });
    if (url.endsWith('/proposal') && init?.method === 'DELETE') { proposal = null; return json({ proposal: null }); }
    if (url.endsWith('/proposal/close')) return json({ proposal: { ...open, status: 'confirmed', confirmedCount: 3, myStatus: 'going' } });
    if (url.endsWith('/proposal') && init?.method === 'POST') return json({ proposal: open }, 201);
    if (url.endsWith('/proposal')) return json({ proposal });
    return json({}, 404);
  }));
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  vi.stubGlobal('location', { pathname: '/e/' + EVT, search: '', hash: '', origin: 'https://showup.test', host: 'showup.test' });
  vi.stubGlobal('history', { state: null, replaceState: vi.fn() });
  vi.stubGlobal('document', {});
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }), location: { assign: vi.fn() } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('organiser', () => {
  it('can propose the recommended time once results are in, and the request carries only the organiser token', async () => {
    const c = mount('organiser');
    await vi.advanceTimersByTimeAsync(0);
    expect(c.renderVals()).toMatchObject({ roundCanPropose: true, roundProposeLabel: 'Propose this time', roundOrgOpen: false });
    c.openRoundSheet();
    expect(c.renderVals().roundSlotOptions.map((o: any) => o.label).join('|')).toMatch(/best so far/);
    c.setState({ roundForm: { deadline: '2026-10-23', min: '3' } });
    c.submitRound();
    await vi.advanceTimersByTimeAsync(0);
    const post = calls.find((x) => x.init?.method === 'POST' && x.url.endsWith('/proposal'))!;
    expect(JSON.parse(String(post.init!.body))).toEqual({ date: '2026-10-24', startMin: 1140, deadline: '2026-10-23', minAttendees: 3 });
    expect((post.init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(c.renderVals()).toMatchObject({ roundOrgOpen: true, roundCanPropose: false, evStatusLabel: 'Time proposed' });
    c.componentWillUnmount();
  });

  it('can pick another day\'s time from the list instead of the best one', async () => {
    const c = mount('organiser');
    await vi.advanceTimersByTimeAsync(0);
    c.openRoundSheet();
    const v = c.renderVals();
    expect(v.roundSlotOptions.map((o: any) => o.value)).toEqual(['2026-10-23', '2026-10-24']);
    expect(v.roundSlot).toBe('2026-10-24');
    expect(v.roundSlotOptions[1].label).toMatch(/best so far/);
    expect(v.roundSlotOptions[0].label).not.toMatch(/best so far/);
    c.setState({ roundForm: { slot: '2026-10-23', deadline: '', min: '2' } });
    c.submitRound();
    await vi.advanceTimersByTimeAsync(0);
    const post = calls.find((x) => x.init?.method === 'POST' && x.url.endsWith('/proposal'))!;
    expect(JSON.parse(String(post.init!.body))).toMatchObject({ date: '2026-10-23', startMin: 1080 });
    c.componentWillUnmount();
  });

  it('shows the live reply counter from the server tally, organiser only', async () => {
    proposal = { ...open, tally: [{ name: 'Sam', vote: 'in' }, { name: 'Jo', vote: 'out' }, { name: 'Kai', vote: null }] };
    const org = mount('organiser');
    await vi.advanceTimersByTimeAsync(0);
    expect(org.renderVals()).toMatchObject({ roundHasTally: true, roundTallyLine: "2 of 3 replied \u00b7 1 in \u00b7 1 can't \u00b7 1 pending" });
    expect(org.renderVals().roundTally.map((t: any) => [t.name, t.label])).toEqual([['Sam', 'In'], ['Jo', "Can't make it"], ['Kai', 'Pending']]);
    org.componentWillUnmount();
    proposal = open;
    const guest = mount('guest');
    await vi.advanceTimersByTimeAsync(0);
    expect(guest.renderVals()).toMatchObject({ roundHasTally: false, roundTallyLine: '' });
    guest.componentWillUnmount();
  });

  it('rejects a minimum under 2 without calling the server', async () => {
    const c = mount('organiser');
    await vi.advanceTimersByTimeAsync(0);
    c.openRoundSheet(); c.setState({ roundForm: { deadline: '', min: '1' } }); c.submitRound();
    expect(c.renderVals()).toMatchObject({ hasRoundError: true });
    expect(calls.some((x) => x.init?.method === 'POST')).toBe(false);
    c.componentWillUnmount();
  });

  it('closing the poll goes through the confirm sheet and shows the confirmed time', async () => {
    proposal = open;
    const c = mount('organiser');
    await vi.advanceTimersByTimeAsync(0);
    expect(c.renderVals().roundOrgOpen).toBe(true);
    c.openConfirm('closePoll');
    expect(c.renderVals()).toMatchObject({ confirmTitle: 'Close the poll now?' });
    c.confirmAction();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.renderVals()).toMatchObject({ roundConfirmed: true, roundConfirmedGoing: true, roundOrgOpen: false, evStatusLabel: 'Confirmed' });
    c.componentWillUnmount();
  });
});

describe('cancel this time', () => {
  it('is offered once confirmed, asks first, then clears the proposal so the organiser can propose again', async () => {
    proposal = { ...open, status: 'confirmed', confirmedCount: 3, myStatus: 'going', tally: [] };
    const c = mount('organiser');
    await vi.advanceTimersByTimeAsync(0);
    expect(c.renderVals()).toMatchObject({ roundCanWithdraw: true, roundCanPropose: false });
    c.renderVals().askWithdraw();
    expect(c.renderVals()).toMatchObject({ confirmTitle: 'Cancel this time?' });
    c.confirmAction();
    await vi.advanceTimersByTimeAsync(0);
    const del = calls.find((x) => x.init?.method === 'DELETE')!;
    expect((del.init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(c.renderVals()).toMatchObject({ roundOn: false, roundCanWithdraw: false, roundCanPropose: true, evStatusLabel: 'Collecting responses' });
    c.componentWillUnmount();
  });

  it('is not offered to guests or when there is no proposal', async () => {
    const g = mount('guest'); proposal = { ...open, status: 'confirmed', confirmedCount: 3, myStatus: 'going' };
    await vi.advanceTimersByTimeAsync(0);
    expect(g.renderVals().roundCanWithdraw).toBe(false);
    g.componentWillUnmount();
    proposal = null;
    const o = mount('organiser');
    await vi.advanceTimersByTimeAsync(0);
    expect(o.renderVals().roundCanWithdraw).toBe(false);
    o.componentWillUnmount();
  });
});

describe('guest', () => {
  it('sees the card, votes with their own credential, then sees only their own answer and can change it', async () => {
    proposal = open;
    const c = mount('guest');
    await vi.advanceTimersByTimeAsync(0);
    expect(c.renderVals()).toMatchObject({ roundGuestAsk: true, roundGuestVoted: false, roundCanPropose: false });
    c.vote('in');
    await vi.advanceTimersByTimeAsync(0);
    const put = calls.find((x) => x.init?.method === 'PUT')!;
    expect((put.init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${CRED}`);
    expect(JSON.parse(String(put.init!.body))).toEqual({ vote: 'in' });
    expect(c.renderVals()).toMatchObject({ roundGuestAsk: false, roundGuestVoted: true });
    expect(c.renderVals().roundMyVote).toMatch(/you're in|you said you're in/i);
    c.renderVals().changeVote();
    expect(c.renderVals().roundGuestAsk).toBe(true);
    c.componentWillUnmount();
  });

  it('polling picks up a confirmed result; someone who is not in the group is told it goes ahead without them', async () => {
    proposal = { ...open, status: 'confirmed', confirmedCount: 3, myVote: 'out', myStatus: 'not_going' };
    const c = mount('guest');
    await vi.advanceTimersByTimeAsync(0);
    expect(c.renderVals()).toMatchObject({ roundConfirmed: true, roundConfirmedNot: true, roundConfirmedGoing: false });
    c.componentWillUnmount();
  });

  it('shows no propose button to a guest', async () => {
    const c = mount('guest');
    await vi.advanceTimersByTimeAsync(0);
    expect(c.renderVals()).toMatchObject({ roundCanPropose: false, roundOn: false });
    c.componentWillUnmount();
  });
});
