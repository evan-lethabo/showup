# Coordination engine (`lib/engine/`)

The engine works out who would actually go **together** in each fixed-duration slot of each candidate day, and which slot is best. It is pure strict TypeScript with no dependencies and no I/O. The rules it implements are in `docs/PRODUCT-RULES.md`, which wins over this file.

It is **not** the same as the prototype's `lib/ui/utils/recommend.ts`, which the UI still uses for now. The prototype works out viability per day over everyone free that day, ignoring their times, so six people free at six different hours count as six attendees.

```ts
import { viableGroup, slotStats, rankSlots, slotWindow } from '@/lib/engine';

viableGroup(day, responses, win, { duration })  // { group: ['Alex', ...], rounds: [{ removed: ['Jess'], reason, failed }] }
slotStats(day, responses, win, { duration })    // the day's chosen slot (free, go, favourites, window, ...) + every slot
rankSlots(event)                   // { days: [...per-day stats], best }; best = null is "No viable plan yet"
rankSlots(event, { favourites: false })  // skip the Favourites tie-break
slotWindow(event.win, day, stats)  // the prototype's display window + dot counts (legacy, see C1)
```

`win` falls back to the day's own `win`; one is required. `rankSlots` uses `day.win ?? event.win` and `event.duration` (default 120).

Inputs are `Response`, `Slot` and `Condition` in `lib/engine/types.ts`. In the engine a `Slot` is a candidate day; a time slot is `TimeSlotStats`. Each response has a stable `id`; conditions refer to people by id, never by display name (`who`), and `group` / `removed` are ids. The engine receives only confirmed conditions; filtering happens upstream. `Response.favs` (Favourite ranges per day) is optional: without it, a day marked Favourite (`avail = 2`) uses its availability ranges as Favourite ranges. An explicit `favs` list, even an empty one, is used as is.

## Supported conditions

Conditions apply only on days answered **If…**, combined with AND; conditions on a Yes day are ignored. If… with no conditions means not free for that day. **No**, Not free, or no answer means not free.

| Condition | Effect |
|---|---|
| `{ type: 'requires', people }` | holds when every listed id is viable |
| `{ type: 'requires_any', people }` | holds when at least one listed id is viable |
| `{ type: 'min_attendees', n }` | holds when at least `n` people are viable, counting the person |
| `{ type: 'time', earliest_start?, latest_end? }` | clips the person's ranges for the day before merging and coverage; ranges emptied by clipping are dropped |
| `{ type: 'unresolvable', summary }` | the person can be tentative, never viable |

## Slots and viability

Times are minutes since the day's midnight, end exclusive. Values past 1440 are after midnight, so a 10pm–1am window is 1320–1500 and its slots belong to the day it starts on.

- **Slots** start every 30 minutes from the day's window start and last the event duration. Every slot fits inside the window; a window shorter than the duration has no slots.
- **No fixed duration** (`duration: null`): there is no end to cover. A slot is a start time, offered every 30 minutes while a `START_COVER` (15 min) fits before the window end, and a person is free when a range covers those first 15 minutes. Everything else below is unchanged.
- **Free for a slot**: not marked Not free (`avail = 0`), Yes or If… with a condition, and one of their (time-clipped) ranges covers the whole slot. A person's touching or overlapping ranges are merged first (19–20 plus 20–21 covers 19–21). Gaps are never bridged, and different people's ranges never combine.
- **Viable**: the slot's free people without an unresolvable condition, minus everyone whose group conditions fail, all at once, repeated until nobody is removed.
- **Tentative** (`tentative`, `tentativeList`): free people with an unresolvable condition whose group conditions hold against the viable group plus themselves. They never satisfy anyone else's conditions.
- **Favourites**: viable people whose Favourite range covers the whole slot.

Each day's headline numbers (`free`, `go`, `tentative`, `group`, `rounds`, `favourites`, `window`) come from its chosen slot: most viable, then most tentative, then most Favourites, then earliest. If nobody is viable in any slot that day, it's the slot with the most tentative, then most free, then earliest. `slots` lists every slot.

So a condition is only met by people free for the **same slot**: "if Priya comes" fails while Priya isn't free then, and "at least 4 of us" counts only those free for that slot.

## Why this is the right answer: monotonicity

Both conditions are **monotone**: adding people to a group never makes one of them false. A named person who is present stays present, and a count can only go up. That has two consequences:

1. If two groups are each self-consistent (every member's conditions hold), so is their union. So there is exactly **one largest self-consistent group**.
2. Elimination never removes anyone in that largest group, because their conditions hold in it and therefore in any bigger group they're part of. So elimination stops exactly there: the **greatest fixed point**. It takes at most *n* rounds, and the result doesn't depend on order.

This holds separately for every slot, over that slot's free people. The tests check it directly. For events with up to 10 people they enumerate every subset in every slot, confirm the largest consistent one is unique and equals the engine's group, and check the day's chosen slot (2,000 random events, durations 30–180 minutes).

## Why negative dependencies are excluded

Conditions like "only if Sam *isn't* going", "fewer than 6 of us" or "unless…" are **not monotone**, and they break both properties above:

- *Several answers:* A goes only if B doesn't, and B goes only if A doesn't. {A} and {B} are both consistent, and nothing picks between them.
- *No answer:* A goes only if A doesn't. No group containing A is consistent, and elimination can flip back and forth.

So the engine never evaluates them: per PRODUCT-RULES §4 a negative condition is stored as `unresolvable`, which makes the person tentative.

## Ranking

A day where nobody would go is never best; if no day has anyone viable, `best` is null. Otherwise days are compared by their chosen slot on:

1. **Group size**: the most people who would actually go together.
2. **Tentative**: the most tentative people.
3. **Favourites**: how many of *that viable group* have a Favourite range covering the slot. `{ favourites: false }` skips this step, both here and when choosing each day's slot.
4. **The earliest start.** Days compare by `iso` date when every day has one, otherwise by event order (mixing the two isn't transitive). Then the slot's start time; after midnight is later than the same evening.
5. **Creation order**: on a full tie the first day is kept.

People free that day no longer break ties (the prototype used them as step 3). Example: Friday has 8 people free but only 4 would go together, and Saturday has 6 free who all go. Saturday wins.

Kept from the prototype:

- `slotWindow` (display window and dots) is unchanged: given the same people, it matches `recommend.ts`. It predates fixed slots and isn't used for ranking; C1 decides whether it stays.
- A reference to someone who isn't a candidate for the slot (not free, tentative, or never responded) fails.

## Privacy

The elimination trace (`rounds`, with each round's `removed`, `reason` and `failed`) is **server-only**. It shows who dropped out because of whose absence, and it quotes people's private conditions ("Only you see this"). It must **never be returned to participants or organisers of real events**, whether directly, inside an API response, or embedded in a page. Return only the outcome (best day, window, counts) to clients, and strip `rounds` from `viableGroup` / `slotStats` / `rankSlots` results before anything leaves the server. The trace is for server logs, debugging and tests.

## Tests (`npm run test:engine`)

The command runs a strict typecheck and then Vitest (88 tests, about 5 s):

- **Conditions** (`conditions.test.ts`): every engine case in PRODUCT-RULES §9, plus `requires_any` cascades and mutual dependencies, ids independent of display names, tentative people excluded from dependencies and thresholds, tentative-only events, the tentative tie-break, ranges emptied by time clipping and cross-midnight time conditions.
- **A6 values** from BACKEND_REQUIREMENTS, as named tests (`favourites: false`).
- **Slots** (`slots.test.ts`): slot generation and per-day windows, short windows, A 19–21 / B 21–23 never both free, whole-slot coverage, range merging without bridging gaps, No and missing willingness excluded, free counted per slot, cross-midnight slots, Favourite-range coverage and the legacy fallback, transitive date ordering, creation order, and the most-free pick for days with nobody viable.
- **Time-aware** (`time-aware.test.ts`), the Stage 1 cases on slots: the 8/4 Friday against the 6/6 Saturday, six non-overlapping people, partial and touching overlaps, the window boundary, cascading elimination, `min` counting only people free together, circular dependencies, the tie-breaks and cross-midnight overlaps.
- **Favourites tie-break**: size ties, size beating Favourites, Favourites outside the group not counting, and the fallback to the earlier slot.
- **Differential**, on events using only `requires` and `min_attendees`, translated to the prototype's shape. With every answered day's range set to the whole window and one window-long slot, the engine's group equals `recommend.ts` and its free count equals the prototype's Yes/If… people, on 1,000 seeded events. With real ranges, every slot's group is a subset of the prototype's day-level group. `slotWindow` matches the prototype's windows and dots.
- **Brute force** (n ≤ 10), as above, with its own 15-minute coverage scan instead of the engine's range merging, and time conditions checked against the slot instead of clipping ranges. It also checks each slot's tentative list.
- **Fixed point and trace** (up to 30 people, 2,000 events): slot starts and lengths, each slot's free and tentative lists, every group self-consistent and free of unresolvable conditions, and replaying each slot's rounds reproduces its group.

Breaking range merging, bridging gaps, counting No as free, ignoring an empty `favs` list, picking the earliest slot on a day with nobody viable, or restoring the old date comparison each makes at least one test fail. So do making `requires_any` always hold, excluding the person from `min_attendees`, letting tentative people count toward conditions, skipping the tentative group check, ignoring time clipping, or treating If… without conditions as Yes.

## Benchmark (`npm run bench:engine`)

The benchmark ran 10,000 synthetic events, averaging 19 participants (range 8–30) and 10.5 slots (range 7–14). Each event was a full recommendation: viable group and trace for every slot, display window and dots for every slot, and ranking. Measured on an Apple M1 with Node 24.11:

| total | mean | p50 | **p95** | p99 |
|---|---|---|---|---|
| 0.96–1.15 s | 96–115 µs | 85–94 µs | **180–210 µs** | 0.23–0.5 ms |

Ranges are across three runs, the last one with the Favourites tie-break. The worst single event was 2–5 ms, most likely a garbage-collection pause.

Time-aware viability runs one elimination per segment instead of one per day. On an Apple M3 with Node 20.19, back-to-back runs:

| engine | mean | p95 |
|---|---|---|
| day-level (before) | 103–107 µs | 184–192 µs |
| time-aware | 243–266 µs | 522–592 µs |

That is about 2.4× slower, and still well under 1 ms per event at p95.

Fixed-duration slots (default 2 h, the benchmark's events unchanged; 11% of their days have windows shorter than 2 h and so no slots, the rest average 7.8 slots), same machine, back-to-back runs:

| engine | mean | p95 |
|---|---|---|
| time-aware segments (Stage 1) | 244–249 µs | 527–538 µs |
| fixed-duration slots | 131–141 µs | 267–273 µs |

Expanded conditions, same machine, three back-to-back runs each. The generator now produces the new condition types, so the two workloads are not identical:

| engine | mean | p95 |
|---|---|---|
| fixed-duration slots (C7) | 126–147 µs | 256–293 µs |
| expanded conditions (C8) | 117–141 µs | 233–281 µs |
