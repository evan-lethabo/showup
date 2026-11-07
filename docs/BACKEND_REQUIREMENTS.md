# SHOWUP: backend requirements

> Extracted on 18 Oct 2026 from `docs/archive/BUILD_STAGES.md` (§3 Integration readiness, §4 Missing requirements, and the expected values from stage A6), with the text unchanged. Code paths in the original text refer to the old single-file source. They now map as follows:
>
> | Original reference                                                                            | Now                                                                                                                                                              |
> | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `Main.dc.html` recommendation functions                                                       | The UI's characterised policy remains in `lib/ui/utils/recommend.ts`; a tested replacement exists in `lib/engine/` but is not wired in pending ranking decisions |
> | `parseConditions`, `STOPWORDS`, `NUMWORDS`                                                    | `lib/ui/utils/conditions-parser.ts`, `lib/ui/data/constants.ts`                                                                                                  |
> | `store`, `loadMyEvents`, `recordMyEvent`, `saveEventData`, `loadEventData` (the storage seam) | `lib/ui/services/storage.ts` (future: `lib/supabase/`)                                                                                                           |
> | `dotRowsFrom`                                                                                 | `lib/ui/utils/dot-rows.ts`                                                                                                                                       |
> | Fixtures `ORG_RESP`, `GUEST_RESP`, `SAMPLE_SLOTS`, `SAMPLE_WINDOW`                            | `lib/ui/data/fixtures.ts`                                                                                                                                        |
> | `TODAY`, `FRESH_LINK`                                                                         | `lib/ui/config.ts`                                                                                                                                               |
> | `SCREENS.md`, `DESIGN_SYSTEM.md`                                                              | `docs/`                                                                                                                                                          |
> | `SOURCE_MANIFEST.md`                                                                          | `docs/archive/`                                                                                                                                                  |
>
> Entry points for real data already exist: the flow root (`components/flow/FlowClient.tsx`) accepts `startAt`, `event` and `initialState` props, so a future `/e/[eventId]` route can load an event and render `<FlowClient startAt="join" event={ev} />`.

---

## Characterisation values for the engine (from stage A6)

Re-checked on 18 Oct 2026 by running the unchanged functions against the fixtures: `summarise`/`dayDots` give exactly the values below.

- **Implementation instructions:**
  1. Move these functions unchanged into pure modules.
  2. Write characterisation tests from the fixtures (`ORG_RESP`, `GUEST_RESP`, `SAMPLE_SLOTS`, `SAMPLE_WINDOW`). Expected results, obtained by running the unchanged functions:
     - **Alex alone:** `summarise` best = **fri**. Both days have go 1 and free 1, and on a full tie the earlier day wins. `dayDots` gives fri 7 – 11pm 1/1 and sat 7 – 11pm 1/1.
     - **Alex + Jess:** best = **sat**.
       - fri: go 1, free 2. Jess's "at least 3" fails, so she is eliminated. Dots show 7 – 11pm, 1 of 1, because Jess's 6–10pm range doesn't cover the window.
       - sat: go 2, free 2, dots 8 – 11pm, 2 of 2.
  3. Write parser tests for every rule in `SCREENS.md` §5.
- **Preservation rules:** don't fix or improve the logic here, even where §4 flags it.
- **Acceptance tests:** tests pass against the unchanged functions, and the app behaves identically.
- **Completion boundary:** modules + tests. The tests record current behaviour, not intended behaviour.

---

## 3. Integration readiness

What exists now, where the seam is, and what has to be decided before each area can be built. "Blocked by" refers to §4.

| Area                                | Current state                                                                                                                            | Seam in the source                                                                                                                        | Ready to build?                                                                                                     | Blocked by |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Backend / API**                   | None. Everything is in the browser                                                                                                       | The storage module (A5 / B10)                                                                                                             | Only the seam. No API contract exists                                                                               | R7, R8     |
| **Persistence**                     | localStorage per device; event JSON in `showup-ev-<id>`; Your-events list                                                                | `saveEventData`, `loadEventData`, `recordMyEvent`, `loadMyEvents`                                                                         | Schema draft: the shapes in `SCREENS.md` §9 can be the _starting_ schema, but R3 may change `Range`/`Window`/`Slot` | R3, R7     |
| **Identity and permissions**        | A typed name; organiser rights = `mode === 'organiser'` on this device; responses keyed by `role + who`; anyone can "Preview as a guest" | `mode`, `myName`, `joinContinue`, `saveToEvent`                                                                                           | No                                                                                                                  | R6, R8     |
| **Shareable link / QR**             | One fixed fake URL and static QR for all events                                                                                          | `FRESH_LINK`, the QR SVG, `copy`                                                                                                          | Generating a per-event link is mechanical once ids are server-issued                                                | R8         |
| **AI interpretation of conditions** | Regex `parseConditions` returning `{status, chips}`; two condition types; unsupported phrasing blocked                                   | `parseConditions(raw, group)` → `{status: 'empty'\|'ok'\|'unsupported'\|'none', chips: Condition[]}`; the 600ms debounce in `onSheetText` | The contract can be kept, but its behaviour is undefined                                                            | R4         |
| **Recommendation calculations**     | The UI uses `dayStats`, `bestWindow`, `dayDots`, `summarise`; `lib/engine/` is implemented and tested separately                         | Pure functions and engine module                                                                                                          | Integration is blocked. The engine adds a Favourite tie-break, so wiring it in would change policy                  | R1, R2, R3 |
| **Private conditions**              | Stored in plain text inside the shared event object; only hidden in the UI ("Only you see this")                                         | `conds`, `condText` on `Response`                                                                                                         | No. Today any client holding the event can read them                                                                | R5         |
| **Proposal and confirmation**       | `proposal {slotId, deadline, min}` saved locally; nothing is sent; no commitment step; status is derived                                 | `saveProposal`, `withdraw`, propose sheet                                                                                                 | No                                                                                                                  | R6         |
| **Notifications / reminder**        | Reminder text to copy by hand                                                                                                            | `REMINDER` template                                                                                                                       | Out of scope until R6                                                                                               | R6         |
| **"Today" and time zone**           | `TODAY = '2026-10-17'` hard-coded; minutes are local; "Sydney time" is text only                                                         | `TODAY`, `dayBefore`, date inputs                                                                                                         | Swapping in the real date is mechanical; the time-zone rule is not                                                  | R6, R9     |

**Do not** write a complete backend or a coordination algorithm from this document. The rows marked "No" need the decisions in §4 first.

---

## 4. Missing requirements

These are open questions only; none of them has been answered here. They fall into two kinds:

- **Implementation gap:** the intended behaviour is known, but the code doesn't do it.
- **Documentation gap:** nobody has specified the behaviour, so it can't be built without a decision.

### R1 · Greatest-fixed-point algorithm (documentation gap; partial implementation)

- **Implemented:** `dayStats` keeps every Yes and If… person who is free that day, then repeatedly removes If… people whose conditions fail. A person condition needs that name to still be present; a minimum needs the remaining count ≥ n. It stops when nothing changes. This is the greatest fixed point **per day** for monotone conditions.
- **Undefined:**
  - Should it run per _window_ (people present at the same time) rather than per day?
  - Do conditions refer to presence in the final window, or anywhere that day?
  - How does a name condition match a person: by display name, or by identity?
  - Unknown names: they're currently dropped silently on confirm; is that right?
  - Can new condition types be added, and do they stay monotone?
  - Does "No" ever count?
  - How do Favourites weigh? They have **no effect** today (only `avail > 0` is checked).

### R2 · Ranking and tie-breaks (documentation gap)

- **Implemented:**
  - Best day = most would-go, then more free, then the earlier day.
  - Display window = the longest run of 15-minute steps with the most would-go free (or the most free if nobody would go); on equal length, the earliest.
  - Dots count only people covering that whole window, which is why they can show fewer than `go`.
- **Undefined:**
  - Should ranking use the window count instead of the day count?
  - Do Favourites or If… people rank lower than Yes?
  - Is there a minimum window length?
  - Should several good options be shown?
  - What appears when the best day's window covers fewer people than its `go`?

### R3 · Days-and-windows model (documentation gap; mismatch flagged in `SCREENS.md` §9.2)

- **Implemented:**
  - One window per event.
  - Availability per day (0/1/2), with up to 2 ranges ≥ 60 minutes inside the window.
  - Willingness and conditions per day.
- **Undefined:**
  - Should there be per-day windows?
  - Should willingness and conditions attach to a range rather than a day?
  - Windows can now cross midnight on a linear minute axis (for example 5pm–1am is `1020–1500`); the product and backend contracts still need to confirm this convention.
  - What are the maximum days and ranges?
  - Do ranges kept while a day is set back to Not free persist (today they are stored but ignored)?

### R4 · Natural-language interpretation (documentation gap)

- **Implemented:** regex rules (`SCREENS.md` §5) for "person goes" and "at least N", returning chips for the user to confirm. Negation, "or" and similar are refused with a fixed message.
- **Undefined:**
  - Which model or service to use, and with what latency budget (the UI assumes a 600ms debounce plus an immediate result)?
  - Which condition types are supported, and how is ambiguity resolved (e.g. two Sams)?
  - Which languages?
  - What is the failure or offline behaviour?
  - What may be sent to a third party (these conditions are private, see R5)?
  - Does the chip-confirmation step stay mandatory?

### R5 · Access control for private conditions (documentation gap; implementation gap)

- **Copy promises:** "Only you see this. In small groups, the final group may hint at it."
- **Implemented:** conditions are stored in the shared event object and only hidden in the UI, so the promise isn't enforced.
- **Undefined:**
  - Who can read raw text versus parsed conditions?
  - Must the server evaluate conditions without exposing them?
  - What exactly may "hint at it" reveal, and below what group size?
  - Can the organiser see that a condition exists?

### R6 · Confirmation rounds and deadlines (documentation gap)

- **Implemented:** a local proposal `{slotId, deadline, min}` with a reply-by date between today and the day before the event (the flow) or a fixed range (the sample page), and minimum ≥ 2 (flow) or 2–8 (sample). The copy says "Collecting final commitments is designed in the next phase."
- **Undefined:**
  - **How a round works:** how are people asked? Does a commitment re-check conditions? What happens at the deadline, and when the minimum isn't met?
  - **Changes during a round:** re-proposing, withdrawing mid-round, late responses and edits after a proposal.
  - **States:** event states beyond Collecting and Proposed (confirmed, cancelled, failed).
  - **Deadlines:** which time zone defines the end of the reply-by day?
  - **Notifications:** channel and content.

### R7 · Persistence (documentation gap)

- **Implemented:** one device only.
- **Undefined:**
  - Storage engine, ids and retention.
  - Concurrent edits: today the last write wins on one device only.
  - Offline behaviour.
  - Deleting an event or a response.
  - Whether "Your events" is per account or per device.

### R8 · Identity, links and permissions (documentation gap)

- **Implemented:** names only; anyone on the device can act as organiser or guest; one fake link.
- **Undefined:**
  - Account or anonymous token per invite? What stops a guest using someone else's name, and how are duplicates handled beyond "add an initial"?
  - Organiser transfer, co-organisers, and removing a respondent.
  - Link format, expiry and revocation.

### R9 · Smaller implementation and documentation gaps

| Item                                                                                               | Kind                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `componentDidUpdate` defect (D1): scroll and focus, sheet Escape, flow red dots, participant focus | Fixed in `src/showup-standalone/` (A2). Participant "Saved" focus and propose-sheet focus not yet re-checked; the fix is also in the canvas copy |
| Supplied wheel picker (D3)                                                                         | Integrated in Create and Respond with scoped CSS and cross-midnight adapters                                                                     |
| Wordmark dot detached (D2)                                                                         | Implementation gap, cosmetic; needs a decision whether to correct it                                                                             |
| `event.note` captured, never shown                                                                 | Documentation gap: where it appears and who sees it                                                                                              |
| `TODAY` hard-coded; no time zone                                                                   | Implementation gap (the real date) + documentation gap (time-zone rule)                                                                          |
| Participant mode and sample page disconnected from real data                                       | Documentation gap: keep as a demo or remove at integration?                                                                                      |
| Proposal minimum: no upper bound in the flow vs 2–8 on the sample page                             | Documentation gap: which rule applies?                                                                                                           |
| Firefox / Safari / touch devices not verified                                                      | Implementation gap (testing)                                                                                                                     |
