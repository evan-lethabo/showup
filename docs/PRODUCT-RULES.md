# SHOWUP — Product Rules

**Status: SETTLED, 18 Oct 2026 (conditions revised, see §10).** This file is the source of truth for how SHOWUP decides who will come and what it recommends. It wins over `CHECKLIST.md` and over the code. If the code disagrees with this file, fix one of them deliberately and log the change in §10.

---

## 1. Glossary

| Term | Meaning |
|---|---|
| Event | A plan with candidate days, a time window on each day, an optional fixed duration (the organiser may set none) and one timezone. |
| Organiser | Creates the event; sees respondent names, per-slot counts and the recommendation. Identified by the secret organiser link. |
| Participant (guest) | Responds through the share link with a name only, no account. Identified by a device token. |
| Window | The time range on a candidate day during which the event could happen. May cross midnight. |
| Slot | Day + start time (+ the event's duration, when it has one) (§2). The app shows and proposes the start time only. |
| Availability range | A time range when a participant is available. |
| Favourite range | A preferred range, inside availability. Used only for ranking (§6). |
| Willingness | One value per participant per day: **Yes**, **If…** or **No**. |
| Condition | A private, confirmed interpretation of what a participant said about attending on an **If…** day (§4). |
| Condition class | How SHOWUP can act on a condition: **group**, **time** or **unresolvable** (§4). |
| Available | One of the participant's availability ranges (after merging their touching or overlapping ranges) covers the whole slot. Internal only; not shown in the UI. |
| Free | Available, willingness for that day is not **No**, and the slot satisfies the participant's time conditions for that day (§3). This is the "free" count shown in the UI. |
| Viable ("will come") | Free, every group condition is satisfied by the final attendee set, and no unresolvable condition (§5). |
| Tentative | Free, every group condition is satisfied by the final attendee set, but at least one unresolvable condition (§5). |
| Recommendation | The top slot under §6. |

---

## 2. Event setup and time

- **Duration:** fixed per event, set by the organiser. Default 2 h.
- **Slots:** start times in 30-minute steps; a slot must fit entirely inside that day's window.
- **Cross-midnight:** a window such as 22:00–01:00 belongs to the day it starts on. Times are stored as minutes from that day's start, so an end past midnight is stored as > 1440.
- **Timezone:** one per event. All times are wall-clock in that timezone; nothing is converted anywhere.

---

## 3. Responses and "free"

- A participant sets, per candidate day: willingness (Yes / If… / No), availability ranges and optional Favourite ranges.
- Ranges must sit inside the day's window, have start < end after cross-midnight normalisation, and Favourites must sit inside availability. Validated on the server.
- **Free for a slot** = willingness for that day is not **No**, **and** one availability range covers the **whole** slot, **and** the slot satisfies every confirmed time condition for that day (§4).
  - **With no fixed duration** there is no end to cover: a person is free at a start time when a range covers its first 15 minutes, however soon they leave. Any 30-minute start with room to begin inside the window is offered.
  - Example: A available 19–21, B available 21–23, duration 2 h → no slot has both free.
  - One person's touching or overlapping ranges count as one range: 19–20 plus 20–21 covers a 19–21 slot. A real gap (19–20 plus 20:15–21) is never bridged, and different people's ranges never combine.
  - People who said **No** are excluded from the "free" count on purpose: on When2meet they would have left that day blank, so this keeps the When2meet comparison honest.
- Responses are editable at any time. An edit replaces the previous response; it never duplicates it.
- A duplicate name in the same event is refused: "That name's taken, add an initial."

---

## 4. Conditions

**Intent.** A participant can state any condition on attending, in their own words. The LLM interprets it; the deterministic engine acts only on what it can evaluate. The participant always sees exactly how their condition will be counted before it takes effect. The AI never decides attendance.

**Scope.**
- Conditions belong to a **(participant, day)** pair and apply only when that day's willingness is **If…**.
- **If…** cannot be saved without at least one confirmed condition. A participant with no condition chooses Yes.
- Several conditions on one day are combined with **AND**.

**Condition classes.** The LLM splits what the participant said into one or more conditions, each in exactly one class:

| Class | What it covers | Stored as | How it is used |
|---|---|---|---|
| **Group** | Depends on who or how many attend | `{ "type": "requires", "people": [id, …] }` (all must come)<br>`{ "type": "requires_any", "people": [id, …] }` (at least one must come)<br>`{ "type": "min_attendees", "n": 7 }` (count includes self) | Evaluated in the fixed point (§5). Can cascade. |
| **Time** | About the plan's timing ("only if it's done by 10", "not before 8") | `{ "type": "time", "earliest_start": minutes?, "latest_end": minutes? }` | Narrows when the participant is Free (§3). Does not depend on anyone else. |
| **Unresolvable** | Anything the system cannot evaluate: external events ("depends on the weather"), personal circumstances ("if I finish my assignment"), plan attributes the event doesn't have (venue, cost), people outside the event, and negative conditions ("only if Tom isn't coming") | `{ "type": "unresolvable", "summary": "depends on the weather" }` | Makes the participant **tentative** instead of viable (§5). |

**Rejected, with a plain message and nothing saved:** self-reference ("only if I come"), empty or meaningless input. Everything else maps to a class.

**Why negatives are unresolvable, not group conditions:** every group condition is positive, so adding people never breaks anyone's condition and the fixed point is unique (§5). A negative condition breaks that guarantee, so SHOWUP is honest that it can't plan around it.

**Interpretation pipeline:**
1. Free text → LLM on the server, constrained to a JSON schema of the classes above. The API key is server-only.
2. Validate on the server against the schema.
3. Resolve names to participant IDs within the event. An ambiguous name → the participant picks from the participant list. A name not in the event → unresolvable condition ("Sam isn't in this event, so I can't check").
4. Show a plain-English read-back covering every part, e.g. *"You'll come on Friday if Jess comes. I can't check the weather, so you'll show as tentative."*
5. The participant confirms, edits or retries. **Only confirmed conditions affect results.**
6. Store the structured conditions and the read-back. Discard the raw text.

**Fallback:** if the LLM times out (8 s) or errors, the existing regex parser interprets the text, its output goes through the same validation, and the same confirm screen is shown with a small "interpreted offline" note. The parser handles group conditions only. If it cannot interpret the text, the participant can retry, rephrase, or choose "count me as tentative" (stored as an unresolvable condition with their own short summary). We never present the parser's output as the LLM's.

---

## 5. Viability

**Algorithm (greatest fixed point), per slot:**
1. **S** = everyone free for the slot (§3, which already applies time conditions).
2. Remove, all at once, everyone whose **group** conditions are not satisfied by the **viable** members of S.
3. Repeat step 2 until nothing changes.
4. Of those remaining: anyone with an unresolvable condition is **tentative**; everyone else is **viable**.

Tentative participants never count toward anyone else's group conditions: a `requires` or `min_attendees` rule is only satisfied by people who will definitely come. In step 2, "viable members of S" means members of S with no unresolvable condition for that day.

**Consequences:**
- **Cascades:** one person dropping can make others drop in later rounds.
- **Mutual conditions** (A requires B, B requires A, both free) → **both viable**: we keep the largest group in which everyone's conditions hold.
- **Non-respondents:** someone who hasn't responded counts as not attending.
- **Order independence:** every group condition is positive (including `requires_any`), so adding people can never break anyone's condition. There is therefore always exactly one largest group in which everyone's conditions hold, and the loop finds it whatever order people are checked in.
- **Framing:** this is the same idea as finding the largest stable coalition in game theory. Describe it as *related to* coalition formation, not as a full coalition-formation game (there are no payoffs).

---

## 6. Ranking

The engine is the **only** code that ranks slots. The UI displays the engine's output and never computes its own ranking (`lib/ui/utils/recommend.ts` is deleted).

Order:
1. Viable count, highest first.
2. Tentative count, highest first.
3. Number of viable people whose Favourite range covers the slot, highest first.
4. Earliest start, first.
5. Creation order.

If the best slot has 0 viable people → show **"No viable plan yet"** instead of a recommendation. If it also has tentative people, show the tentative count alongside.

A day with no viable slot is represented by its slot with the most tentative, then most free, then earliest.

The dashboard shows the best slot per day with free, will-come and tentative counts, the recommendation, a privacy-safe reason line, and "Most free: X" next to "Most will come: Y" whenever they differ.

---

## 7. Privacy

| Data | Author | Organiser | Other guests |
|---|---|---|---|
| Respondent names | Yes | Yes | Yes |
| Own availability and willingness | Yes | Counts only | Counts only |
| Condition content, class and read-back | Yes | **Never** | **Never** |
| Per-slot free / will-come / tentative counts | Yes | Yes | Yes |
| Who is viable, tentative or neither | **Never shown to anyone** | **Never** | **Never** |
| Raw condition text | Sent to the LLM, then discarded | — | — |

Showing that a specific free person is not viable, or is tentative, would reveal they have a condition, so individual status is never exposed. API responses return per-slot counts and the recommendation only, nothing per person. Reason lines stay generic ("some people depend on others or on things outside the group"). With very small groups, counts can still hint at individuals; don't promise perfect anonymity.

---

## 8. Canonical example (demo seed and engine test)

Fri + Sat, window 18:00–23:00, duration 3 h. Every seeded person is available 19:00–22:00 on their ✓ days.

| Person | Fri | Sat | Condition |
|---|---|---|---|
| Alex, Ben, Chloe | Yes | Yes | — |
| Dan | Yes | No | — |
| Finn | If… | If… | requires Ella (both days) |
| Grace | If… | No | min_attendees 7 |
| Harry | If… | No | requires Finn |
| Jess | No | Yes | — |
| Ella | joins live: Yes on both days, available 19:00–22:00 on both days | | |

**Stage 1 — before Ella joins**
- Friday: free = Alex, Ben, Chloe, Dan, Finn, Grace, Harry (7). Round 1: Finn fails (no Ella) → 6. Round 2: Grace fails (6 < 7), Harry fails (no Finn) → 4. **7 free / 4 viable.**
- Saturday: free = Alex, Ben, Chloe, Finn, Jess (5). Finn fails → **5 free / 4 viable.**

**Stage 2 — Ella joins with Yes on both days**
- Friday: 8 free, all conditions hold → **8 / 8.** Saturday: **6 / 6.** → **Friday** recommended.

**Stage 3 — Ella sets Friday to If… "I'll only come if Jess is coming"**
- Friday: Round 1: Ella fails (Jess not free) → 7. Round 2: Finn fails → 6. Round 3: Grace fails (6 < 7), Harry fails → 4. **8 free / 4 viable.**
- Saturday: unchanged, **6 / 6.** → **Saturday 7–10pm** recommended.

Both slots are 19:00–22:00, the only 3-hour slot inside everyone's 19:00–22:00 availability. No seeded participant is tentative, so all tentative counts are 0.

---

## 9. Edge cases (each one is a test)

| Case | Expected |
|---|---|
| A available 19–21, B 21–23, duration 2 h | No slot has both free |
| A requires B, B requires A, both free | Both viable |
| A requires B, B requires A, B not free | Neither viable |
| `min_attendees` 5, exactly 5 viable in S including self | Viable |
| `min_attendees` 5, 4 viable in S | Not viable |
| A `requires_any` [B, C], only C free | A viable |
| A `requires_any` [B, C], neither free | A not viable |
| Time condition latest_end 22:00, slot 20:00–23:00 | Not free for that slot |
| Time condition latest_end 22:00, slot 19:00–22:00 | Free (if otherwise eligible) |
| Unresolvable condition only, free | Tentative, not viable |
| Group condition holds + unresolvable condition | Tentative |
| Group condition fails + unresolvable condition | Neither viable nor tentative |
| A `min_attendees` 3; S = A, B (viable) and C (tentative) | A not viable (tentative people don't count) |
| A `requires` B; B is tentative | A not viable |
| "Only if Tom isn't coming" | Stored as unresolvable → tentative |
| Condition names someone outside the event | Stored as unresolvable → tentative |
| Window 22:00–01:00 on Friday | All its slots count as Friday |
| Condition names a roster member who hasn't responded | Treated as not attending |
| If… with no confirmed condition | Cannot be saved |
| Unconfirmed condition | No effect on counts |
| Self-reference or empty input | Rejected with a message; nothing saved |
| Second participant named "Sam" | Refused |
| No slot has any viable person | "No viable plan yet" |
| Two slots tie on viable count | Broken by §6 steps 2–5 |
| §8 seed, all three stages | Exactly the §8 numbers, tentative 0 |

**Parser tests (LLM and fallback):** at least one phrasing per type in each class, one mixed sentence (group + unresolvable), one negative, one ambiguous name, one outsider, one self-reference.

---

## 10. Changelog

| Date | Change | Why |
|---|---|---|
| 18 Oct 2026 | Rules settled from checklist v2 §1 | Replaces the draft skeleton |
| 18 Oct 2026 | Added "Available" term, the reason "free" excludes No, the "interpreted offline" fallback note, and the coalition framing | Review feedback; this file is now the only place the rules and the seed are defined |
| 18 Oct 2026 | A person's touching or overlapping availability ranges are merged before checking that one range covers the slot (§1, §3) | Someone who enters 19–20 and 20–21 is available 19–21; without merging, how they used the picker would change the result |
| 18 Oct 2026 | Conditions rewritten (§4) around the product intent: any condition in the participant's own words, classified as group / time / unresolvable. Added `requires_any` and `time` types, the **tentative** status and counts, tentative people excluded from others' conditions, If… requires a condition, outsiders and negatives become tentative instead of rejected. Knock-on edits to §1, §3, §5, §6, §7, §9. | The previous version limited the LLM to two fixed rule types, which didn't match the intent and made the AI look performative. Settled: `requires_any`; tentative people don't count toward anyone else's conditions; If… can't be saved without a confirmed condition. |
