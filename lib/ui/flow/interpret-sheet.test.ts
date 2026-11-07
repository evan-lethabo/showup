import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component } from './main';
import { toFlowEvent } from '../utils/persisted-event';
import { buildResponseBody } from '../utils/response-sync';

const EVT = 'EVTAAAAAAAAAAAA1';
const CRED = 'PELLAAAAAAAAAAA1.secret';
const SLOT = 'd20270108';
const stored = {
  id: EVT,
  title: 'Dinner',
  organiserName: 'Alex',
  durationMin: 120,
  timezone: 'Australia/Sydney',
  days: [{ date: '2027-01-08', start: 1080, end: 1380 }],
  participants: [
    { name: 'Jess', responded: true },
    { name: 'Ella', responded: false },
  ],
};

let reply: () => Promise<Response>;
let calls: { url: string; init?: RequestInit }[];
const jsonRes = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

function mount() {
  const c: any = new Component({
    startAt: 'respond',
    event: toFlowEvent(stored, { guestPath: '/e/' + EVT }),
    initialState: { screen: 'respond', mode: 'guest', myName: 'Ella' },
  });
  c.__host = {
    __setLogicState(patch: object, cb?: () => void) {
      c.state = { ...c.state, ...patch };
      if (cb) cb();
    },
  };
  c.state = { ...c.state, avail: { ...c.state.avail, [SLOT]: 1 }, ranges: { ...c.state.ranges, [SLOT]: [{ s: 1080, e: 1380 }] } };
  return c;
}
const settle = async (ms = 0) => {
  await new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
async function check(c: any, text: string) {
  c.openSheet(SLOT);
  c.onSheetText(text);
  c.interpretSheet();
  expect(c.sheetVals(c.state)).toMatchObject({ interpretBusy: true, interpretLabel: 'Checking…', sheetText: text });
  await settle();
}

beforeEach(() => {
  calls = [];
  const store = new Map([['showup-guest-' + EVT, CRED]]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return reply();
    }),
  );
  vi.stubGlobal('location', { pathname: '/e/' + EVT, search: '', hash: '', origin: 'https://showup.test', host: 'showup.test' });
  vi.stubGlobal('document', { getElementById: () => null, querySelector: () => null });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ConditionsSheet with the interpreter', () => {
  it('calls /interpret only on Check this, labels AI output and saves it as llm after confirmation', async () => {
    reply = () =>
      jsonRes({
        status: 'ok',
        source: 'llm',
        conditions: [{ type: 'requires', people: [{ id: 'PJESS', name: 'Jess', pending: false }] }],
        lines: ["You'll only count if Jess comes."],
      });
    const c = mount();
    c.openSheet(SLOT);
    c.onSheetText('if Jess comes');
    expect(calls).toHaveLength(0);
    await check(c, 'if Jess comes');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`/api/events/${EVT}/interpret`);
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe('Bearer ' + CRED);
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ date: '2027-01-08', text: 'if Jess comes' });
    const v = c.sheetVals(c.state);
    expect(v).toMatchObject({
      showSourceLabel: true,
      sourceLabel: 'Interpreted by AI',
      sheetLines: ["You'll only count if Jess comes."],
      cannotConfirm: false,
      showRephrase: true,
    });
    c.confirmSheet();
    await settle(200);
    expect(c.state.will[SLOT]).toBe('if');
    const body = buildResponseBody(c.state.slots, c.state);
    expect(body.days[0].conditions).toEqual([{ type: 'requires', source: 'llm', people: [{ id: 'PJESS' }] }]);
  });

  it('labels server fallback and local fallback (request failed) as offline, keeping the text', async () => {
    reply = () =>
      jsonRes({
        status: 'ok',
        source: 'fallback',
        conditions: [{ type: 'unresolvable', summary: "Part of what you said can't be checked offline" }],
        lines: ['x'],
      });
    const c = mount();
    await check(c, "only if the weather's good");
    expect(c.sheetVals(c.state).sourceLabel).toBe('Interpreted offline (basic)');
    reply = () => Promise.reject(new Error('offline'));
    const d = mount();
    await check(d, "only if the weather's good");
    expect(d.sheetVals(d.state)).toMatchObject({
      sourceLabel: 'Interpreted offline (basic)',
      sheetText: "only if the weather's good",
      cannotConfirm: false,
    });
    expect(d.state.sheet.result.conditions).toEqual([{ type: 'unresolvable', summary: "Part of what you said can't be checked offline" }]);
  });

  it('shows the self-reference message and cannot confirm', async () => {
    reply = () =>
      jsonRes({
        status: 'self',
        source: 'llm',
        conditions: [],
        lines: [],
        message: "A condition can't depend on you coming. If nothing else needs to happen, choose Yes.",
      });
    const c = mount();
    await check(c, 'only if Ella comes');
    expect(c.sheetVals(c.state)).toMatchObject({
      cannotConfirm: true,
      showQuiet: true,
      quietLine: "A condition can't depend on you coming. If nothing else needs to happen, choose Yes.",
    });
  });

  describe('no condition', () => {
    beforeEach(() => {
      reply = () =>
        jsonRes({
          status: 'no_condition',
          source: 'llm',
          conditions: [],
          lines: ["Noted: 'Would be nice if Jess came' doesn't change how you're counted."],
        });
    });

    it('Yes saves unconditional willingness', async () => {
      const c = mount();
      await check(c, 'would be nice if Jess came');
      expect(c.sheetVals(c.state)).toMatchObject({ showNoCondition: true, cannotConfirm: true });
      c.noConditionYes();
      await settle(200);
      expect(c.state.will[SLOT]).toBe('yes');
      expect(buildResponseBody(c.state.slots, c.state).days[0]).toMatchObject({ willingness: 'yes', conditions: [] });
    });

    it('Rephrase returns to the input with the text kept', async () => {
      const c = mount();
      await check(c, 'would be nice if Jess came');
      c.rephraseSheet();
      expect(c.sheetVals(c.state)).toMatchObject({
        showNoCondition: false,
        showInterpretBtn: true,
        sheetText: 'would be nice if Jess came',
      });
    });

    it('Count me as tentative saves If with one unresolvable condition, never an empty If', async () => {
      const c = mount();
      await check(c, 'would be nice if Jess came');
      c.noConditionTentative();
      await settle(200);
      const day = buildResponseBody(c.state.slots, c.state).days[0];
      expect(day.willingness).toBe('if');
      expect(day.conditions).toEqual([{ type: 'unresolvable', source: 'llm', summary: 'You asked to be counted as tentative' }]);
    });
  });
});
