import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component } from './main';
import { toFlowEvent } from '../utils/persisted-event';
import { consumeEditFragment, editLink, forgetEditFragment } from '../services/guest-credential';

const EVT = 'EVTAAAAAAAAAAAA1';
const OTHER = 'EVTBBBBBBBBBBBB2';
const SAM = 'PSAMAAAAAAAAAAA1.samsecret';
const JO = 'PJOAAAAAAAAAAAA2.josecret';
const stored = {
  id: EVT,
  title: 'Dinner',
  organiserName: 'Alex',
  durationMin: 120,
  timezone: 'Australia/Sydney',
  days: [{ date: '2027-01-08', start: 1080, end: 1380 }],
  participants: [
    { name: 'Sam', responded: true },
    { name: 'Jo', responded: true },
  ],
};
const own = (id: string, name: string, responded: boolean) => ({
  participant: { id, name },
  responded,
  days: responded
    ? [{ date: '2027-01-08', willingness: 'yes', available: [{ start: 1080, end: 1380 }], favourite: [], conditions: [] }]
    : [],
});

let store: Map<string, string>;
let addr: { pathname: string; search: string; hash: string };
let fetchMock: ReturnType<typeof vi.fn>;

function respondWith(byCred: Record<string, { status: number; body?: unknown }>) {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization || '';
    const hit = byCred[auth.replace('Bearer ', '')] || { status: 401, body: { error: { code: 'unauthorised' } } };
    return new Response(JSON.stringify(hit.body ?? {}), { status: hit.status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
}

function mount(ev = stored) {
  const c: any = new Component({ startAt: 'join', event: toFlowEvent(ev, { guestPath: '/e/' + ev.id }), initialState: { screen: 'join' } });
  c.__host = {
    __setLogicState(patch: object, cb?: () => void) {
      c.state = { ...c.state, ...patch };
      if (cb) cb();
    },
  };
  c.componentDidMount();
  return c;
}
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  store = new Map();
  addr = { pathname: '/e/' + EVT, search: '?utm=x', hash: '' };
  forgetEditFragment();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  vi.stubGlobal('location', {
    get pathname() {
      return addr.pathname;
    },
    get search() {
      return addr.search;
    },
    get hash() {
      return addr.hash;
    },
    origin: 'https://showup.test',
    host: 'showup.test',
  });
  vi.stubGlobal('history', {
    state: null,
    replaceState: vi.fn((_s: unknown, _t: string, url: string) => {
      const [p, q = ''] = url.split('?');
      addr = { pathname: p, search: q ? '?' + q : '', hash: '' };
    }),
  });
  vi.stubGlobal('document', {});
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('private edit link', () => {
  it('puts the credential in the fragment only', () => {
    const url = new URL(editLink('https://showup.test', EVT, SAM));
    expect(url.pathname).toBe('/e/' + EVT);
    expect(url.search).toBe('');
    expect(url.hash).toBe('#k=' + SAM);
  });

  it('is consumed before render: removed from the address, keeping path and query', () => {
    addr.hash = '#k=' + SAM;
    respondWith({});
    const c = mount();
    expect(addr).toEqual({ pathname: '/e/' + EVT, search: '?utm=x', hash: '' });
    expect(c.editCredential).toBe(SAM);
    expect(consumeEditFragment()).toBe(SAM); // Strict Mode's second constructor still sees it
  });

  it('is verified with the Authorization header, then stored and restored, replacing a different stored guest', async () => {
    store.set('showup-guest-' + EVT, JO);
    addr.hash = '#k=' + SAM;
    respondWith({
      [SAM]: { status: 200, body: own('PSAMAAAAAAAAAAA1', 'Sam', true) },
      [JO]: { status: 200, body: own('PJOAAAAAAAAAAAA2', 'Jo', true) },
    });
    const c = mount();
    expect(store.get('showup-guest-' + EVT)).toBe(JO); // not stored before verification
    await settle();
    const ownCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/response'));
    expect(ownCalls).toHaveLength(1);
    const [url, init] = ownCalls[0];
    expect(url).toBe(`/api/events/${EVT}/response`);
    expect(url).not.toContain('samsecret');
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer ' + SAM });
    expect(store.get('showup-guest-' + EVT)).toBe(SAM);
    expect(c.state).toMatchObject({ screen: 'event', mode: 'guest', myName: 'Sam', participantId: 'PSAMAAAAAAAAAAA1' });
    const v = c.renderVals();
    expect(v.showEditLink).toBe(true);
    expect(v.editLinkText).toBe(`https://showup.test/e/${EVT}#k=${SAM}`);
    expect(v.canSwitchGuest).toBe(true);
    expect(v.switchLabel).toBe('Not Sam? Join as someone else');
  });

  it.each([401, 403, 404])('on %i is not stored and shows Join with the invalid-link error', async (status) => {
    store.set('showup-guest-' + EVT, JO);
    addr.hash = '#k=' + SAM;
    respondWith({ [SAM]: { status, body: {} } });
    const c = mount();
    await settle();
    expect(store.get('showup-guest-' + EVT)).toBe(JO);
    expect(c.state.screen).toBe('join');
    expect(c.renderVals()).toMatchObject({
      hasJoinError: true,
      joinError: "That edit link isn't valid for this event.",
      joinDisabled: false,
    });
  });

  it('is scoped to its event: a link for another event is checked against this event and rejected', async () => {
    addr = { pathname: '/e/' + OTHER, search: '', hash: '#k=' + SAM };
    respondWith({}); // the server 401s a credential presented for an event it doesn't belong to
    const c = mount({ ...stored, id: OTHER });
    await settle();
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/events/${OTHER}/response`);
    expect(store.has('showup-guest-' + OTHER)).toBe(false);
    expect(store.has('showup-guest-' + EVT)).toBe(false);
    expect(c.state.joinError).toBe("That edit link isn't valid for this event.");
  });
});

describe('returning guest on this browser', () => {
  it('restores the saved response, offers Edit my response and Not you?', async () => {
    store.set('showup-guest-' + EVT, SAM);
    respondWith({ [SAM]: { status: 200, body: own('PSAMAAAAAAAAAAA1', 'Sam', true) } });
    const c = mount();
    await settle();
    expect(c.state.screen).toBe('event');
    const v = c.renderVals();
    expect(v.isGuestView).toBe(true);
    expect(v.canSwitchGuest).toBe(true);
    expect(c.state.will[c.state.slots[0].id]).toBe('yes');
  });

  it('forgets a stored credential the server rejects', async () => {
    store.set('showup-guest-' + EVT, SAM);
    respondWith({});
    const c = mount();
    await settle();
    expect(store.has('showup-guest-' + EVT)).toBe(false);
    expect(c.state.screen).toBe('join');
    expect(c.state.joinError).toBe('');
  });
});

describe('switching guest', () => {
  async function respondingAs() {
    store.set('showup-guest-' + EVT, SAM);
    store.set('showup-guest-' + OTHER, JO);
    respondWith({ [SAM]: { status: 200, body: own('PSAMAAAAAAAAAAA1', 'Sam', false) } });
    const c = mount();
    await settle();
    expect(c.state.screen).toBe('respond');
    return c;
  }

  it("clears only this event's credential and returns to an empty Join, without server calls", async () => {
    const c = await respondingAs();
    const calls = fetchMock.mock.calls.length;
    c.renderVals().switchGuest();
    expect(c.state).toMatchObject({ screen: 'join', joinName: '', participantId: null, myName: '', phase: 'editing' });
    expect(Object.values(c.state.avail).every((a) => a === 0)).toBe(true);
    expect(store.has('showup-guest-' + EVT)).toBe(false);
    expect(store.get('showup-guest-' + OTHER)).toBe(JO);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('asks before discarding unsaved changes; Cancel keeps the form and identity', async () => {
    const c = await respondingAs();
    const id = c.state.slots[0].id;
    c.setAvail(id, 1);
    c.renderVals().switchGuest();
    expect(c.renderVals().confirmSwitch).toBe(true);
    expect(store.get('showup-guest-' + EVT)).toBe(SAM);
    c.renderVals().cancelSwitch();
    expect(c.state).toMatchObject({ screen: 'respond', confirmSwitch: false, myName: 'Sam' });
    expect(c.state.avail[id]).toBe(1);
    c.renderVals().switchGuest();
    c.renderVals().discardSwitch();
    expect(c.state.screen).toBe('join');
    expect(store.has('showup-guest-' + EVT)).toBe(false);
  });

  it('then joins under a different available name', async () => {
    const c = await respondingAs();
    c.renderVals().switchGuest();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ participantId: 'PNEWAAAAAAAAAAA3', name: 'Kim', credential: 'PNEWAAAAAAAAAAA3.kimsecret' }), {
            status: 201,
          }),
      ),
    );
    c.setState({ joinName: 'Kim' });
    c.joinContinue();
    await settle();
    expect(c.state).toMatchObject({ screen: 'respond', myName: 'Kim', participantId: 'PNEWAAAAAAAAAAA3' });
    expect(store.get('showup-guest-' + EVT)).toBe('PNEWAAAAAAAAAAA3.kimsecret');
  });
});

describe('stored-event event screen', () => {
  it('renders for organisers and guests with respondents, without legacy results', () => {
    respondWith({});
    const c = mount();
    c.setState({ screen: 'event', mode: 'organiser' });
    const org = c.renderVals();
    expect(org).toMatchObject({ showResults: false, hasBest: false, showLiveResults: true, dotRows: [] });
    c.setState({ mode: 'guest' });
    expect(c.renderVals()).toMatchObject({ showResults: false, showGuestStatus: true, showLiveResults: true });
  });
});
