// Live acceptance run for the condition interpreter: real OpenAI calls through the same shared pipeline as
// POST /api/events/{id}/interpret, with a fixture context. No database, server, credential or event records.
//   npx tsx scripts/eval-interpreter.ts            (model from OPENAI_INTERPRETER_MODEL, default gpt-6-luna)
// Prints only case numbers, verdicts, categories and latency: never the key or model output.
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

import {
  interpretCondition,
  type Interpretation,
  type InterpretationContext,
  type CanonicalCondition,
} from '../lib/conditions/interpreter';
import { INTERPRETER_MODEL, openAiTransport } from '../lib/server/openai';

const ROSTER = ['Alex', 'Ben', 'Chloe', 'Dan', 'Finn', 'Grace', 'Harry', 'Jess'].map((name) => ({ id: `P_${name.toLowerCase()}`, name }));
const ctx = (text: string, end = '23:00'): InterpretationContext => ({
  day: { date: '2026-10-23', weekday: 'Friday', window_start: '18:00', window_end: end, duration_minutes: 180 },
  self_name: 'Ella',
  self_id: 'P_ella',
  roster: ROSTER,
  text,
});

type Check = (r: Interpretation) => string | null;
const only =
  (types: string[]): Check =>
  (r) => {
    const got = r.conditions
      .map((c) => c.type)
      .sort()
      .join(',');
    return got === [...types].sort().join(',') ? null : `conditions ${got || 'none'}`;
  };
const find = (r: Interpretation, type: string) => r.conditions.find((c) => c.type === type);
const people = (c: CanonicalCondition | undefined) =>
  (c?.people ?? [])
    .map((p) => (p.pending ? `~${p.name}` : p.id))
    .sort()
    .join(',');
const all =
  (...checks: Check[]): Check =>
  (r) => {
    for (const c of checks) {
      const e = c(r);
      if (e) return e;
    }
    return null;
  };
const status =
  (s: string): Check =>
  (r) =>
    r.status === s ? null : `status ${r.status}`;
const ppl =
  (type: string, want: string): Check =>
  (r) =>
    people(find(r, type)) === want ? null : `${type} people ${people(find(r, type))}`;
const val =
  (type: string, key: keyof CanonicalCondition, want: unknown): Check =>
  (r) =>
    find(r, type)?.[key] === want ? null : `${type}.${String(key)}=${String(find(r, type)?.[key])}`;
const summary =
  (want: string): Check =>
  (r) =>
    r.conditions.some((c) => c.type === 'unresolvable' && c.summary?.toLowerCase().includes(want)) ? null : `no unresolvable "${want}"`;
const assumption: Check = (r) => (r.lines.length > r.conditions.length ? null : 'no assumption line');

const CASES: { n: number; text: string; end?: string; check: Check }[] = [
  { n: 1, text: "I'm in if Jess is, she's driving", check: all(status('ok'), only(['requires']), ppl('requires', 'P_jess')) },
  { n: 2, text: 'only if Jess and Sam come', check: all(status('ok'), only(['requires']), ppl('requires', 'P_jess,~Sam')) },
  { n: 3, text: 'if Jess or Ben comes', check: all(status('ok'), only(['requires_any']), ppl('requires_any', 'P_ben,P_jess')) },
  { n: 4, text: 'if at least 6 people go', check: all(status('ok'), only(['min_attendees']), val('min_attendees', 'n', 6)) },
  { n: 5, text: 'if 5 others come', check: all(status('ok'), only(['min_attendees']), val('min_attendees', 'n', 6)) },
  { n: 6, text: "as long as I'm done by 10", check: all(status('ok'), only(['time']), val('time', 'latest_end', 1320), assumption) },
  { n: 7, text: "can't get there before 8", check: all(status('ok'), only(['time']), val('time', 'earliest_start', 1200)) },
  { n: 8, text: 'only if we finish before 1am', end: '01:30', check: all(status('ok'), only(['time']), val('time', 'latest_end', 1500)) },
  { n: 9, text: "only if the weather's good", check: all(only(['unresolvable']), summary('weather')) },
  { n: 10, text: 'not if Tom comes', check: all(only(['unresolvable']), summary('not coming')) },
  { n: 11, text: 'would be nice if Jess came', check: all(status('no_condition'), only([])) },
  { n: 12, text: 'if Jess comes or at least 6 people go', check: all(only(['unresolvable']), summary('several')) },
  { n: 13, text: 'if Priya comes', check: all(status('ok'), only(['requires']), ppl('requires', '~Priya')) },
  { n: 14, text: 'if my boyfriend can come', check: all(only(['unresolvable']), summary("isn't named")) },
  { n: 15, text: 'only if Ella comes', check: all(status('self'), only([])) },
  {
    n: 16,
    text: "I'll go if Jess or Sam comes, but I need to be home by 10, and only if the weather's good",
    check: all(
      status('ok'),
      only(['requires_any', 'time', 'unresolvable']),
      ppl('requires_any', 'P_jess,~Sam'),
      val('time', 'latest_end', 1320),
      summary('weather'),
      assumption,
    ),
  },
  { n: 17, text: 'asdfgh', check: all(status('no_condition'), only([])) },
];

async function main() {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_INTERPRETER_MODEL || INTERPRETER_MODEL;
  if (!key) {
    console.error('FAIL: OPENAI_API_KEY is not set (.env.local or environment).');
    process.exit(1);
  }
  const transport = openAiTransport(key, { model });
  const runs = [...CASES, ...[1, 16].flatMap((n) => Array.from({ length: 5 }, () => ({ ...CASES.find((c) => c.n === n)!, repeat: true })))];
  let failed = 0;
  let base = 0;
  let reps = 0;
  const times: number[] = [];
  console.log(`model ${model}`);
  for (const c of runs) {
    const t0 = Date.now();
    const r = await interpretCondition(ctx(c.text, c.end), transport);
    const ms = Date.now() - t0;
    times.push(ms);
    const why = r.source !== 'llm' ? `fallback (${r.failure ?? 'unknown'})` : c.check(r);
    const repeat = 'repeat' in c;
    if (why) failed++;
    else if (repeat) reps++;
    else base++;
    console.log(`${why ? 'FAIL' : 'PASS'} case ${String(c.n).padStart(2)}${repeat ? ' (repeat)' : ''}  ${ms}ms${why ? `  ${why}` : ''}`);
  }
  times.sort((a, b) => a - b);
  console.log(
    `\n${base}/17 cases, ${reps}/10 repeats; latency median ${times[Math.floor(times.length / 2)]}ms, max ${times[times.length - 1]}ms`,
  );
  process.exit(failed ? 1 : 0);
}

void main();
