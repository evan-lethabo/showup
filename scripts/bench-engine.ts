// npm run bench:engine
// 10,000 synthetic events (8–30 participants, 7–14 slots). Times one full recommendation per event:
// rankSlots (viable group + elimination trace for every slot) plus slotWindow (display window and dots)
// for every slot. Events are generated up front so generation isn't timed.
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { rankSlots, slotWindow } from '../lib/engine';
import { rng, randomEvent } from '../lib/engine/__tests__/gen';

const N = 10_000;
const rand = rng(1);
const events = Array.from({ length: N }, () => randomEvent(rand, { minPeople: 8, maxPeople: 30, minSlots: 7, maxSlots: 14 }));

let sink = 0;
function run(ev: (typeof events)[number]) {
  const r = rankSlots(ev);
  for (const d of r.days) sink += slotWindow(ev.win, d.slot, d).go;
  sink += r.best ? r.best.go : 0;
}

for (let i = 0; i < 500; i++) run(events[i]!); // warm-up (JIT)

const times = new Float64Array(N);
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  const a = performance.now();
  run(events[i]!);
  times[i] = performance.now() - a;
}
const total = performance.now() - t0;
const sorted = Array.from(times).sort((x, y) => x - y);
const q = (p: number) => sorted[Math.min(N - 1, Math.floor(p * N))]!;
const people = events.reduce((s, e) => s + e.responses.length, 0) / N;
const slots = events.reduce((s, e) => s + e.slots.length, 0) / N;

console.log(`engine benchmark: ${N.toLocaleString()} events (avg ${people.toFixed(1)} participants, ${slots.toFixed(1)} slots)`);
console.log(`  total   ${total.toFixed(1)} ms`);
console.log(`  mean    ${((total / N) * 1000).toFixed(1)} µs/event`);
console.log(`  p50     ${(q(0.5) * 1000).toFixed(1)} µs/event`);
console.log(`  p95     ${(q(0.95) * 1000).toFixed(1)} µs/event`);
console.log(`  p99     ${(q(0.99) * 1000).toFixed(1)} µs/event`);
console.log(`  max     ${(sorted[N - 1]! * 1000).toFixed(1)} µs/event`);
console.log(`  (${os.cpus()[0]?.model ?? 'unknown CPU'}, Node ${process.version}; checksum ${sink})`);
