import { describe, expect, it, vi } from 'vitest';
import {
  interpretCondition,
  mapClauses,
  linearTime,
  OUTPUT_SCHEMA,
  SYSTEM_PROMPT,
  type InterpretationContext,
  type ModelTransport,
} from './interpreter';
import { openAiTransport } from '../server/openai';

// Fixture context only: no database, server or credential (the same pipeline the route and eval script use).
const ROSTER = ['Alex', 'Ben', 'Jess', 'Samuel'].map((name) => ({ id: `P_${name.toLowerCase()}`, name }));
const ctx = (text: string, o: Partial<{ self: string; end: string; start: string; dur: number }> = {}): InterpretationContext => ({
  day: {
    date: '2026-10-23',
    weekday: 'Friday',
    window_start: o.start ?? '18:00',
    window_end: o.end ?? '23:00',
    duration_minutes: o.dur ?? 180,
  },
  self_name: o.self ?? 'Ella',
  self_id: 'P_ella',
  roster: ROSTER,
  text,
});
const clause = (p: Record<string, unknown>) => ({
  source_text: '',
  kind: 'enforceable',
  type: null,
  people: [],
  count: null,
  includes_self: null,
  time: null,
  reason: null,
  assumption: null,
  ...p,
});
const out = (...clauses: Record<string, unknown>[]) => ({ clauses: clauses.map(clause) });
const model = (o: unknown): ModelTransport => vi.fn(async () => ({ ok: true as const, text: JSON.stringify(o) }));

describe('model contract', () => {
  it('sends names only (guest excluded) and the text verbatim with the strict schema', async () => {
    const t = model(out());
    await interpretCondition(ctx("I'll go if Jess or Sam comes, but only if the weather's good"), t);
    const req = (t as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const input = JSON.parse(req.user);
    expect(input.roster).toEqual(['Alex', 'Ben', 'Jess', 'Samuel']);
    expect(input.self_name).toBe('Ella');
    expect(input.text).toBe("I'll go if Jess or Sam comes, but only if the weather's good");
    expect(req.user).not.toContain('P_');
    expect(req.schema).toBe(OUTPUT_SCHEMA);
    expect(SYSTEM_PROMPT).toContain('mixed_or');
  });

  it('calls the Responses API with strict JSON schema, low reasoning, store false and no retries', async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'completed',
            output: [{ type: 'message', content: [{ type: 'output_text', text: '{"clauses":[]}' }] }],
          }),
          { status: 200 },
        ),
    );
    const r = await openAiTransport('sk-test', { fetchImpl: f as unknown as typeof fetch })({
      system: 's',
      user: 'u',
      schema: OUTPUT_SCHEMA,
    });
    expect(r).toEqual({ ok: true, text: '{"clauses":[]}' });
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(1);
    const sent = JSON.parse(String(calls[0]![1].body));
    expect(sent).toMatchObject({
      model: 'gpt-6-luna',
      reasoning: { effort: 'low' },
      max_output_tokens: 2000,
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
  });

  it('reports truncation, HTTP errors and timeouts as safe categories', async () => {
    const mk = (res: Response) => openAiTransport('k', { fetchImpl: (async () => res) as unknown as typeof fetch });
    expect(
      await mk(new Response(JSON.stringify({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } })))({
        system: '',
        user: '',
        schema: {},
      }),
    ).toEqual({ ok: false, category: 'truncated' });
    expect(await mk(new Response('{}', { status: 400 }))({ system: '', user: '', schema: {} })).toEqual({
      ok: false,
      category: 'http_error',
    });
    const slow = openAiTransport('k', {
      timeoutMs: 5,
      fetchImpl: ((_: string, init: RequestInit) =>
        new Promise((_r, rej) =>
          init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))),
        )) as unknown as typeof fetch,
    });
    expect(await slow({ system: '', user: '', schema: {} })).toEqual({ ok: false, category: 'timeout' });
  });
});

describe('validation and mapping', () => {
  it('maps requires-all and requires-any, resolving roster ids and pending names', () => {
    const r = mapClauses(
      ctx('only if Jess and Sam come'),
      out({
        source_text: 'if Jess and Sam come',
        type: 'requires',
        people: [
          { name: 'Jess', roster_match: 'Jess' },
          { name: 'Sam', roster_match: null },
        ],
      }),
    );
    expect(r.ok && r.value.conditions).toEqual([
      {
        type: 'requires',
        people: [
          { id: 'P_jess', name: 'Jess', pending: false },
          { name: 'Sam', pending: true },
        ],
      },
    ]);
    expect(r.ok && r.value.lines).toEqual([
      "You'll only count if Jess and Sam come.",
      "Sam hasn't joined yet; you'll count once they're in and coming.",
    ]);
    const any = mapClauses(
      ctx('if Jess or Ben comes'),
      out({
        source_text: 'if Jess or Ben comes',
        type: 'requires_any',
        people: [
          { name: 'Jess', roster_match: 'Jess' },
          { name: 'Ben', roster_match: 'Ben' },
        ],
      }),
    );
    expect(any.ok && any.value.lines[0]).toBe("You'll only count if Jess or Ben comes.");
  });

  it('keeps a mixed OR as one unresolvable condition, never AND', () => {
    const r = mapClauses(
      ctx('if Jess comes or at least 6 people go'),
      out({ source_text: 'if Jess comes or at least 6 people go', kind: 'unsupported', reason: 'mixed_or' }),
    );
    expect(r.ok && r.value.conditions).toEqual([{ type: 'unresolvable', summary: 'Depends on one of several different things' }]);
    expect(r.ok && r.value.lines[0]).toBe("'If Jess comes or at least 6 people go' can't be checked, so you'll show as tentative.");
  });

  it('accepts an alias only for a real roster participant, and says so', () => {
    const r = mapClauses(
      ctx('if Sammy comes'),
      out({ source_text: 'if Sammy comes', type: 'requires', people: [{ name: 'Sammy', roster_match: 'Samuel' }] }),
    );
    expect(r.ok && r.value.conditions[0]!.people).toEqual([{ id: 'P_samuel', name: 'Samuel', pending: false }]);
    expect(r.ok && r.value.lines).toContain('You said Sammy; we matched this to Samuel.');
    const fake = mapClauses(
      ctx('if Tommo comes'),
      out({ source_text: 'if Tommo comes', type: 'requires', people: [{ name: 'Tommo', roster_match: 'Thomas' }] }),
    );
    expect(fake.ok && fake.value.conditions[0]!.people).toEqual([{ name: 'Tommo', pending: true }]);
  });

  it('rejects self-references by name (case 15, one-character names) and by id, never saving name:<self>', () => {
    const r = mapClauses(
      ctx('only if Ella comes'),
      out({ source_text: 'if Ella comes', type: 'requires', people: [{ name: 'Ella', roster_match: null }] }),
    );
    expect(r.ok && r.value).toMatchObject({ status: 'self', conditions: [] });
    const one = mapClauses(
      ctx('only if J comes', { self: 'J' }),
      out({ source_text: 'if J comes', type: 'requires', people: [{ name: 'j', roster_match: null }] }),
    );
    expect(one.ok && one.value.status).toBe('self');
    const byId = mapClauses(
      { ...ctx('if Jess comes'), self_id: 'P_jess' },
      out({ source_text: 'if Jess comes', type: 'requires', people: [{ name: 'Jess', roster_match: 'Jess' }] }),
    );
    expect(byId.ok && byId.value.status).toBe('self');
  });

  it('computes headcount including or excluding the guest', () => {
    const six = mapClauses(
      ctx('if at least 6 people go'),
      out({ source_text: 'if at least 6 people go', type: 'min_attendees', count: 6, includes_self: true }),
    );
    const others = mapClauses(
      ctx('if 5 others come'),
      out({ source_text: 'if 5 others come', type: 'min_attendees', count: 5, includes_self: false }),
    );
    expect(six.ok && six.value.conditions).toEqual([{ type: 'min_attendees', n: 6 }]);
    expect(others.ok && others.value.conditions).toEqual([{ type: 'min_attendees', n: 6 }]);
    expect(six.ok && six.value.lines[0]).toBe("You'll only count if at least 6 people come, including you.");
  });

  it('converts times to linear minutes, including past midnight, and shows assumptions as lines', () => {
    expect(linearTime('01:00', { s: 1080, e: 1530 })).toBe(1500);
    expect(linearTime('20:00', { s: 1080, e: 1380 })).toBe(1200);
    const late = mapClauses(
      ctx('only if we finish before 1am', { end: '01:30' }),
      out({ source_text: 'only if we finish before 1am', type: 'latest_end', time: '01:00' }),
    );
    expect(late.ok && late.value.conditions).toEqual([{ type: 'time', latest_end: 1500 }]);
    const home = mapClauses(
      ctx('home by 10'),
      out({
        source_text: 'home by 10',
        type: 'latest_end',
        time: '22:00',
        assumption: "We read 'home by 10' as the event ending by 10pm, not counting travel time.",
      }),
    );
    expect(home.ok && home.value.lines).toEqual([
      'Only times ending by 10pm.',
      "We read 'home by 10' as the event ending by 10pm, not counting travel time.",
    ]);
    const start = mapClauses(
      ctx("can't get there before 8"),
      out({ source_text: "can't get there before 8", type: 'earliest_start', time: '20:00' }),
    );
    expect(start.ok && start.value.lines).toEqual(['Only times starting from 8pm.']);
  });

  it('flags limits that leave no full-length slot', () => {
    const r = mapClauses(
      ctx('after 9 and done by 10'),
      out(
        { source_text: 'after 9', type: 'earliest_start', time: '21:00' },
        { source_text: 'done by 10', type: 'latest_end', time: '22:00' },
      ),
    );
    expect(r.ok && r.value).toMatchObject({ status: 'no_fit', message: 'No time on this day fits these limits.' });
  });

  it('maps unsupported to unresolvable with fixed summaries (no raw text) and preferences to no_condition', () => {
    const w = mapClauses(
      ctx("only if the weather's good"),
      out({ source_text: "only if the weather's good", kind: 'unsupported', reason: 'weather' }),
    );
    expect(w.ok && w.value.conditions).toEqual([{ type: 'unresolvable', summary: 'Depends on the weather' }]);
    expect(w.ok && w.value.lines[0]).toBe("'Only if the weather's good' can't be checked, so you'll show as tentative.");
    const n = mapClauses(ctx('would be nice if Jess came'), out({ source_text: 'would be nice if Jess came', kind: 'not_a_condition' }));
    expect(n.ok && n.value).toMatchObject({
      status: 'no_condition',
      conditions: [],
      lines: ["Noted: 'Would be nice if Jess came' doesn't change how you're counted."],
    });
  });

  it('rejects bad schema, fabricated spans, empty dependency lists and invalid combinations', () => {
    expect(mapClauses(ctx('x'), { clauses: [{ ...clause({ source_text: 'x', kind: 'not_a_condition' }), extra: 1 }] })).toEqual({
      ok: false,
      category: 'schema',
    });
    expect(mapClauses(ctx('x'), { clauses: [{ source_text: 'x' }] })).toEqual({ ok: false, category: 'schema' });
    expect(
      mapClauses(
        ctx('if Jess comes'),
        out({ source_text: 'if Ben comes', type: 'requires', people: [{ name: 'Ben', roster_match: 'Ben' }] }),
      ),
    ).toEqual({ ok: false, category: 'semantic' });
    expect(mapClauses(ctx('if Jess comes'), out({ source_text: 'if Jess comes', type: 'requires', people: [] }))).toEqual({
      ok: false,
      category: 'schema',
    });
    expect(mapClauses(ctx('if 6 go'), out({ source_text: 'if 6 go', type: 'min_attendees', count: 6 }))).toEqual({
      ok: false,
      category: 'schema',
    });
    expect(
      mapClauses(
        ctx('if my boyfriend comes'),
        out({ source_text: 'if my boyfriend comes', type: 'requires', people: [{ name: 'my boyfriend', roster_match: null }] }),
      ),
    ).toEqual({ ok: false, category: 'semantic' });
    expect(mapClauses(ctx('weather'), out({ source_text: 'weather', kind: 'unsupported', type: 'requires' }))).toEqual({
      ok: false,
      category: 'schema',
    });
  });

  it('matches spans across case, curly quotes and whitespace', () => {
    const r = mapClauses(
      ctx('Only  if the weather’s GOOD.'),
      out({ source_text: "only if the weather's good", kind: 'unsupported', reason: 'weather' }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('fallback', () => {
  it('falls back (labelled) on missing key, transport failure, bad JSON and invalid output', async () => {
    const text = 'if Jess comes';
    expect(await interpretCondition(ctx(text), null)).toMatchObject({
      source: 'fallback',
      failure: 'no_key',
      conditions: [{ type: 'requires', people: [{ id: 'P_jess' }] }],
    });
    expect(await interpretCondition(ctx(text), async () => ({ ok: false, category: 'timeout' }))).toMatchObject({
      source: 'fallback',
      failure: 'timeout',
    });
    expect(await interpretCondition(ctx(text), async () => ({ ok: true, text: 'not json' }))).toMatchObject({
      source: 'fallback',
      failure: 'bad_json',
    });
    expect(await interpretCondition(ctx(text), model({ clauses: 'nope' }))).toMatchObject({ source: 'fallback', failure: 'schema' });
    expect(
      await interpretCondition(ctx(text), async () => {
        throw new Error('boom');
      }),
    ).toMatchObject({ source: 'fallback', failure: 'unavailable' });
  });

  it('keeps what it understood and adds an unresolvable remainder; never drops it', async () => {
    const r = await interpretCondition(ctx("if Jess comes and the weather's good"), null);
    expect(r.conditions.map((c) => c.type)).toEqual(['requires', 'unresolvable']);
    const none = await interpretCondition(ctx("only if the weather's good"), null);
    expect(none.conditions).toEqual([{ type: 'unresolvable', summary: "Part of what you said can't be checked offline" }]);
  });

  it('reports self-reference and empty text without conditions', async () => {
    expect(await interpretCondition(ctx('only if Ella comes'), null)).toMatchObject({ status: 'self', conditions: [] });
    expect(await interpretCondition(ctx('   '), model(out()))).toMatchObject({ status: 'no_condition', conditions: [] });
  });

  it('labels a validated model result as llm', async () => {
    const r = await interpretCondition(
      ctx('if Jess comes'),
      model(out({ source_text: 'if Jess comes', type: 'requires', people: [{ name: 'Jess', roster_match: 'Jess' }] })),
    );
    expect(r).toMatchObject({ status: 'ok', source: 'llm' });
    expect(r).not.toHaveProperty('failure');
  });
});
