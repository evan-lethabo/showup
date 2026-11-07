# SHOWUP — SCREENS.md

> **Note (18 Oct 2026, Next.js migration):** behaviour, copy, data model and fixtures below still match the code. Two things are out of date:
>
> - Defect D1 is fixed in the code the app now runs. Screen changes scroll to the top and focus the heading, sheets take focus (so Escape works), and the flow's event page fills its red dots. Text describing the D1 effects as current is historical.
> - Defect D3 is also fixed in the live app: Create and Respond use the supplied three-column wheel picker. Its CSS is scoped under `twp-*`, and adapters preserve SHOWUP's linear cross-midnight values.
> - The screenshots in `docs/design-references/screenshots/` predate that fix.
>
> Path mapping: `Main.dc.html` → `components/flow/**` (markup) + `lib/ui/flow/**` (logic). `Event.dc.html` → `components/sample/**` + `lib/ui/sample/**`. The originals are in `archive/showup-standalone/`.

Document 3 of 4 · Read-only extraction · Source version `1792166501-1cda`

> **Paths:** this document uses the original handoff layout. See "Where things are now" at the top of `SOURCE_MANIFEST.md` for where each path lives today, and `SOURCE_MANIFEST.md` §16 for how the standalone copy is now split into files.

Every screen and behaviour below was taken from `project/Main.dc.html` and `project/Event.dc.html`, then confirmed by driving the build with the canvas's own runtime (React 18.3.1 + the canvas template layer, run locally in Chromium). Reference screenshots are in `screenshots/`, as 42 states × 3 widths; §11 lists them.

**Status labels used throughout:**

- **REAL**: works fully in this frontend.
- **SIMULATED**: plausible behaviour with fake internals: regex parsing, a fixed link, a fake delay, data in browser storage only.
- **FIXTURE**: hard-coded demo data.
- **INCOMPLETE**: present but not finished, or broken (see §0).

**File key:** M = `Main.dc.html`, E = `Event.dc.html`.

---

## 0. Defects visible in the approved build

These were observed in the canvas runtime and reproduced in the standalone copy. **D1 is now fixed** in `src/showup-standalone/` and in the canvas copy (`src/showup-source/`); D2 and D3 are unchanged. The screenshots in `design-reference/screenshots/` were captured before the D1 fix.

| #   | Defect                                                                                                                                                                                | Effect on screens                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `componentDidUpdate` receives no `prevState` and throws on every update (M and E). Manifest §15. **Fixed in the standalone copy.** The effects below are what the approved build did. | No scroll-to-top or heading focus on screen change. Focus never moves into the conditions or propose sheets, so **Escape does nothing until the user clicks inside the sheet**. **Flow event page: red "would go" dots never fill** when reached through the flow (they do on frames that start on that screen). Participant "Saved" block isn't scrolled to or focused. Stand-in wheels aren't re-synced after timeline taps while open. |
| D2  | The wordmark is an `inline-flex` button (M) or link (E) with children `showup` + `<span class="dot">.</span>`, so the "." becomes its own flex item                                   | The red dot renders slightly detached and lower than in plain text (visible in every screenshot)                                                                                                                                                                                                                                                                                                                                          |
| D3  | The approved build used a stand-in picker. **Fixed in the live app.**                                                                                                                 | Create "What time?" and Respond range editing                                                                                                                                                                                                                                                                                                                                                                                             |

---

## 1. Global shell (all flow screens)

- **Structure:** `div.su` > `div.ambient` (fixed blush wash) > `div.layer` > one screen at a time (`state.screen`). Overlays render after the screen.
- **Header:** the wordmark **`showup.`** is a `<button aria-label="showup. home">` that goes to Landing and resets the flow state. REAL.
  - Event pages add the status label on the right at ≥720px, or under the wordmark on mobile: "Collecting responses", or "Time proposed (prototype)" once the organiser has saved a proposal.
- **Screen transitions:** `go(patch)` uses `document.startViewTransition` when supported (the event name morphs over 400ms via `view-transition-name: su-title`). Otherwise the old screen fades out over 160ms and the new screen fades in, with the heading first and the rest 60ms later. REAL. Because of D1, the page does not scroll to the top afterwards.
- **Responsive switch points:** 720px and 1024px (Document 2 §6). At ≥1024px the flow screens use a 12-column grid with content in columns 2–8; the Respond screen adds a right rail in columns 10–12.

---

## 2. Landing (M, `screen: 'landing'`)

**Purpose:** name a new event, open the example, or reopen saved events. **Route:** the default start of `Main.dc.html` (canvas launch file). Screenshots 01, 02, 24.

**Visible text, top to bottom:**

1. `showup.` (wordmark)
2. H1 **"What are you planning?"**
3. Label **"Event name"** over a text input (placeholder "Weekend plans", maxlength 60, `id="event-name"`)
4. Error (conditional): **"Give it a name to continue."**
5. Primary button **"Next"**
6. Text link **"See an example"**
7. Conditional section **"Your events"** (label style) with up to 5 rows. Each row shows the event name, a role ("Organising" or "Invited") and a status ("Collecting responses" or "Time proposed")

**Layout:**

- Mobile: single column, 20px gutters, 40px top padding.
- ≥720px: content up to 680px wide, 64px top padding.
- ≥1024px: columns 2–8, 128px top padding.
- The input, the Your-events list and the actions are capped at 520px wide; actions are left-aligned.

| Action                                                                                                                      | Result                                                                                                                                | Status                   |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Next / Enter in the input, name empty                                                                                       | inline error                                                                                                                          | REAL                     |
| Next with a name                                                                                                            | trims the name and goes to Create, carrying the name over                                                                             | REAL                     |
| See an example                                                                                                              | saves flow state to `sessionStorage['showup-proto-flow']`, then navigates to `Event.dc.html` (`EventMobile.dc.html` in mobile frames) | REAL (prototype link)    |
| Your events row (an event created or joined in the flow)                                                                    | loads `localStorage['showup-ev-<id>']` and opens the Event page as organiser or guest. If the data is gone, the row is removed        | REAL, single device only |
| Your events row "Weekend plans / Invited" (written after a participant-mode response, then leaving via "Continue to event") | `<a>` to the sample event page                                                                                                        | REAL link to FIXTURE     |

**Data in:** `localStorage['showup-events']`, plus the sessionStorage flow snapshot when returning from the sample page.
**Data out:** `state.name`.
**Hidden when:** the list is empty, or `localStorage` is unavailable.

---

## 3. Create (M, `screen: 'create'`)

**Purpose:** pick candidate days and a shared time window. **Entry:** Next from Landing (or the seeded `Create.dc.html` frame). Screenshots 03, 04, 05, 30.

**Visible text, top to bottom:**

1. **The event name as the title.** It is an editable input styled at display size (44/56/64px), labelled "Event name" for screen readers only. If it is cleared and Create is pressed, the error **"Give your event a name."** appears.
2. H2 **"Which days?"** with a live count on the right: "1 day selected" / "N days selected".
3. **Glass month calendar.** It shows `October 2026`, a previous-month text link (hidden in the current month), a next-month text link (e.g. "Nov"), and the weekday header **M T W T F S S** (Monday first). Day cells are 42px circles:
   - past days are disabled and greyed;
   - today (17 Oct, hard-coded) is bold;
   - selected days use the silver material and are bold;
   - each day's `aria-label` reads "Friday 23 October" ("…, today" for today).
4. H2 **"What time?"**. Two supplied three-column wheels, **"From"** and **"Until"**, in 15-minute steps. They default to **5:00 pm and 12:00 am**. Below them, live text: **"7 hr window"** (format: "N hr", "N min" or "N hr M min", followed by "window"). Until values at or before From are stored on the following day (for example 5pm–1am is `1020–1500`).
5. Label **"Your name"** over a text input (maxlength 30).
6. Text toggle **"More options"** (`aria-expanded`). When open it shows **"Note"** and a textarea.
7. Primary button **"Create event"**. It is disabled until there are at least 2 days _and_ a name; the hint underneath reads **"Pick at least two days."**, otherwise **"Add your name."**

**Layout:** the same column as Landing. The calendar is at most 400px wide, the wheels at most 360px, and the name field at most 360px. "Create event" is full-width on mobile.

| Action              | Result                                                                                                                                                              | Status       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Tap a day           | toggles selection. There is no maximum, and selections in other months are kept                                                                                     | REAL         |
| Month links         | move by one month; you can't go before Oct 2026                                                                                                                     | REAL         |
| Wheels              | scroll, click or use Arrow Up/Down. Until is kept ≥ From + 60 minutes (the other wheel moves)                                                                       | REAL         |
| More options → Note | stored in `event.note`; **never displayed anywhere**                                                                                                                | INCOMPLETE   |
| Create event        | builds the event (`id` = 6 random base36 characters; days sorted). Saves `showup-ev-<id>`, adds a "Your events" entry (Organising) and goes to Respond as organiser | REAL locally |

**Data out:** `Event {name, organiser, slots, win {s: from, e: until}, note}`.

---

## 4. Respond (M, `screen: 'respond'`): four modes

**Purpose:** give per-day availability, time ranges, willingness and private conditions. Screenshots 06–11, 16, 21, 23, 31, 35, 36.

| Mode                             | How you get here                                      | Differences                                                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Organiser**                    | after Create; or Event → Edit my response             | kicker = event name; eyebrow **"Start with yours."** (hidden while editing)                                                                                                          |
| **Guest**                        | Join → Continue; or guest Event → Edit my response    | kicker = event name, no eyebrow                                                                                                                                                      |
| **Editing** (organiser or guest) | Edit my response                                      | **"Back to event"** text link above the kicker; primary button reads **"Save changes"**                                                                                              |
| **Participant** (FIXTURE)        | `Participant.dc.html` frame, `startAt: 'participant'` | uses the fixed sample days (Fri 23, Sat 24, 5pm–12am). Saving shows an in-page **Saved** block instead of an event page. **Disconnected:** answers never reach the sample event page |

**Visible text, top to bottom:**

1. "Back to event" (editing only)
2. Kicker: event name (it carries the title morph)
3. "Start with yours." (organiser, not editing)
4. H1 **"Which times work for you?"**
5. Day cards, one per candidate day (details below)
6. Conditional notice **"You're letting the organiser know none of these times work."** with **"Undo"**
7. Form error (role alert)
8. Primary button, which reads **"Submit response"**, **"Save changes"** (when editing) or **"Saving…"** (busy, 700ms)
9. Text link **"None of these work for me"** (hidden while the notice is shown)
10. Participant only: **"You've changed your answers since saving."**; then the Saved block (`Saved` / **"Your response is in."**, a summary sentence, **"Continue to event"** (primary link) and **"Edit response"** (secondary), and the note _"Prototype: the event page shows a fixed sample with fictional responses. Your answers here don't change it."_)
11. **Desktop rail** (≥1024px, columns 10–12, sticky): "How this works" with three steps:
    - **01 "Mark when you're free"**: "Every time you could physically make."
    - **02 "Say if you'd actually go"**: "Being free isn't the same as wanting to go."
    - **03 "Add what it depends on"**: "Optional, and only you can see it."

### 4.1 Day card

| State                     | Composition                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Not free** (`.is-slim`) | One row: the day label on the left (full "Friday 23 Oct"; on mobile the short form "Fri 23 Oct") and the availability control on the right (222px on mobile, 300px at ≥720px) |
| **Free / Favourite**      | The title "Friday 23 Oct", then 16px, then the full-width availability control (max 420px), then the reveal area (it opens over 260ms with a height-and-opacity transition)   |

The reveal area contains:

- **Timeline** (`button.tl`, `aria-label` "Friday timeline. Tap an hour to move the nearest end of your time. Currently 7pm – 11pm."): a 32px track across the organiser's window, with fills (clear glass for Free, red glass for Favourite) and hour ticks underneath ("5p 6p … 12a"; every other hour if the window is longer than 10 hours).
- **Range pills**, one per range, e.g. **"7pm – 11pm"**. Tapping a pill opens two supplied wheels (From / Until, limited to the organiser's window, 15-minute steps) plus **"Done"**. Cross-midnight windows stay on SHOWUP's linear minute axis. With two ranges, each pill gets a **"Remove"**.
- **"Add another time"**: shown only when a second range can be created.
- **"Would you actually go?"** with the willingness control **Yes / If… / No**.
- Error **"Let us know whether you'd actually go."**
- Conditions summary: **"Only you see this: "** followed by the chips joined with " · " (e.g. "Sam goes · 5+ people"), then **"Edit"** and **"Use this for my other times too"**. After using the latter: "Also applied to Saturday."

**Controls:**

| Control                                            | Behaviour                                                                                                                                                                                                                                                                                                                                                                         | Status |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Availability control (Not free / Free / Favourite) | A silver thumb slides over 220ms; Favourite switches the thumb to red glass with white text. Going from Not free to Free or Favourite fills the **whole window** with a single range. Switching between Free and Favourite keeps the ranges. Going back to Not free collapses the card (the ranges are kept but hidden; returning to Free resets them)                            | REAL   |
| Timeline tap                                       | Snaps to the nearest whole hour (or a window edge). If the tap lands inside a range, the **nearer end** moves there (on a tie, the **end** moves). Outside all ranges, the nearest range extends to the tap (ties favour extending an end). The minimum range is 60 minutes; overlapping ranges merge. No dragging. Keyboard activation (`detail === 0`) opens the wheels instead | REAL   |
| "Add another time"                                 | With one range: if the window has ≥120 minutes free before or after it, adds a 1-hour range at that edge; otherwise splits the range into its first and last thirds (snapped to hours) when each part and the gap are ≥60 minutes. Maximum of 2 ranges                                                                                                                            | REAL   |
| Willingness (Yes / If… / No)                       | Unselected by default (thumb hidden). If… opens the conditions sheet and sets `will = 'if'` straight away                                                                                                                                                                                                                                                                         | REAL   |
| Edit (summary)                                     | Reopens the sheet with the saved text and chips (editing mode)                                                                                                                                                                                                                                                                                                                    | REAL   |
| Use this for my other times too                    | Copies the chips and text to every other day that is Free or Favourite and not "No", and sets those days to If…                                                                                                                                                                                                                                                                   | REAL   |
| None of these work for me                          | Sets every day to Not free and shows the notice; any later Free or Favourite clears it                                                                                                                                                                                                                                                                                            | REAL   |

**Submit validation:**

- No day is free and "none" isn't chosen: **"Mark at least one day, or let us know none of them work."**
- A free day has no willingness: that card shows its error, the form shows **"Tell us whether you'd actually go on Friday."** (a joined list of days), and focus moves to that day.
- Otherwise the button shows "Saving…" for 700ms (SIMULATED delay). The organiser or guest response is then written into the event in localStorage, "Your events" is updated, and the app goes to the Event page. In participant mode the Saved block appears instead (participant data goes nowhere).

**Participant summary sentence:** e.g. "You're free Friday 5pm – 12am. You'd go on Friday." The full template also covers favourites, If…, No and none-work variants.

---

## 5. Conditions sheet (overlay in M)

**Purpose:** capture private conditions in natural language. **Opened by:** If… or Edit. Screenshots 12–15.

**Contents (exactly, in this order):**

1. H2 **"What would make you go?"**
2. **"Only you see this. In small groups, the final group may hint at it."**
3. A textarea with no visible label (`aria-label` "What would make you go"), placeholder **"e.g. if Sam's going and there's at least 5 of us"**
4. **Either** the chips **or** one quiet line:
   - Unsupported input: **"That kind of condition isn't supported yet. Try who needs to be there, or how many."**
   - Nothing recognised: **"We couldn't find a condition there. Try who needs to be there, or how many."**
5. A right-aligned row with **"Cancel"** (text link) followed by **"Looks right"** (primary; disabled until at least one valid chip exists)

**Layout and motion:**

- **Mobile:** a bottom sheet with a 20px radius on the top corners, max-height 92vh, padding 28/20/24px.
- **≥720px:** a centred 500px glass panel.
- **Scrim:** `rgba(20,0,0,0.08)`. Opening fades and rises 24px over 280ms; closing reverses over 200ms.

**Interpretation (SIMULATED: regex rules, not AI). Runs 600ms after typing stops:**

- **Unsupported** if the text contains `n't`, not, never, unless, without, nobody, no one, except, avoid*, **or**, either.
- **Names:**
  - Participant mode: matches the 8 sample names.
  - Guest mode: matches the names of people who have already responded (except yourself); other capitalised names followed by going/goes/go/comes/coming/come/attends/attending/there/in (optionally "'s", is, are, will, be) become **unknown** chips, shown as **"Sam?"**.
  - Organiser mode: every such name is accepted.
- **Minimum:** "at least / a minimum of / minimum of / more than / over" + number or number word (two to ten), or a number followed by people/persons/others/friends/of us/guests/come/attend/show/going/turn, or "or more"/"+". "More than N" becomes N+1. The value is clamped to 2–20. Only the first match counts.
- **Chip labels:** "Sam goes", "Sam?" for unknown names, "5+ people".

**Chip editing (tap a chip):**

| Chip                            | Edit UI                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Name, participant or guest mode | Buttons for each group name (the current one bold), plus "Remove". Picking a name resolves "Sam?"        |
| Name, organiser mode            | Text input (`aria-label` "Name") plus "Remove"                                                           |
| Minimum                         | Stepper "−" / "N+ people" / "+" (`aria-label` "Fewer people" / "More people"), range 2–20, plus "Remove" |

| Action                  | Result                                                                                                                                                                                      | Status                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Looks right             | Keeps only valid chips; **unknown "Sam?" chips are dropped silently**; duplicates are removed. Saves the conditions and raw text to the day, closes the sheet and returns focus to that day | REAL (but see the drop)                                                                                           |
| Cancel, scrim or Escape | If this wasn't an edit of saved conditions, willingness goes back to unselected; when editing, the saved conditions are kept                                                                | REAL; in the approved build Escape only worked once focus was inside the sheet (D1, fixed in the standalone copy) |

---

## 6. Join (M, `screen: 'join'`): guest entry

**Purpose:** what the shared link would open. **Entry:** "Preview as a guest" on the organiser's Event page (same tab), or the `Join.dc.html` frame. The real link `showup.example/e/…` does not resolve (SIMULATED). Screenshots 19, 20, 33.

**Text:**

- H1: event name (the morph target)
- **"Organised by {organiser}"**
- Label **"Your name"** + input (maxlength 30)
- Primary **"Continue"** (Enter also submits)

**Errors:**

- **"Add your name to continue."**
- **"Someone with that name has already responded. Try adding an initial."** (case-insensitive match against existing responses)

**Result:** Respond in guest mode with empty answers. REAL locally. There is no identity beyond the typed name.

---

## 7. Event page (M, `screen: 'event'`): three states

**Purpose:** status and next steps, for the organiser or a guest. Screenshots 17, 18, 22, 25–29, 32, 34.

### 7.1 Organiser, only their own response ("fresh")

- Header status **"Collecting responses"**
- H1 event name; **"Just you so far."**
- **Glass invite panel:** the link as plain text **"showup.example/e/N8R2VQ"** (`title` "Prototype URL, not a live link"), a secondary **"Copy link"** button with a status message, and a 136px QR (152px at ≥720px). At ≥720px the panel is a row with the QR on the right.
- Quiet line **"The best time shows up once people respond."**
- Bottom links: **"Edit my response" · "Plan something else" · "Preview as a guest" · "Preview with sample responses"** (the last is a link to `Event.dc.html`)

### 7.2 Organiser, two or more responses (`.ev-grid.is-full`)

Desktop layout: the left column (1–7) holds Best so far, the dot rows and Responses; the right column (9–12) holds the actions and invite panel. On mobile everything stacks in DOM order: best, dots, invite, actions, responses, links.

- Count line **"N responses"**.
- **Best so far** (red label), then the day name at display size, a comma and the time in secondary grey (stacked on mobile), the short date ("Fri 23 Oct"), and **"N people could make this work."** ("1 person …" for one). If no day has anyone who would go, the quiet line shows instead.
- **Dot rows**, one per day in date order:
  - **Label:** "Friday 23 Oct" with the window in grey ("5pm – 12am").
  - **Dots:** 12px (14px at ≥720px) with an 8px gap. Red glass marks people who would go; silver marks people who are free but wouldn't. They wrap.
  - **Count:** the would-go number (28px; red on the best day), then "of N free".
  - **Empty or zero:** a row with 0 would-go is dimmed to 60%; a day nobody is free shows **"Nobody free"**.
  - **Accessibility:** `aria-label` e.g. "Friday 23 Oct, 5pm to 12am: 1 of 1 free would go".
  - **Bug in the approved build:** the red fill never showed when this page was reached through the flow (D1; fixed in the standalone copy).
- **Responses:** overlapping 44px silver circles with initials. Hover, focus or tap shows a name tooltip; tap toggles it.
- **Actions:** primary **"Propose a time"** (or **"Change proposal"**) and secondary **"Draft reminder"**.
  - **Reminder panel** (glass): "Reminder message" textarea (read-only) containing _"Hey, we're trying to lock in a time for {event name}. Add your availability when you get a chance!"_, the note "Nothing is sent automatically. Paste it wherever your group chats.", **"Copy reminder"**, "Done", and a status message.
  - **Proposal notice:** "Proposal saved in this prototype", e.g. "Friday 23 Oct. Replies by 22/10. Goes ahead if at least 2 people commit.", "Nothing has been sent. Collecting final commitments is designed in the next phase.", then **"Edit"** and **"Withdraw"**.
- **Compact invite panel:** link text, "Copy link" and a 96px QR.
- The same bottom links as 7.1.

### 7.3 Guest view (`mode: 'guest'`)

- H1, then **"N responses"**, then **"You're in. We'll let you know when a time is proposed."**
- Best so far, dot rows and Responses, as in 7.2.
- **No organiser controls:** no Propose, no reminder and no invite panel or QR.
- Bottom links: **"Edit my response" · "Plan your own"**.

### 7.4 Propose sheet (flow)

- H2 **"Propose a time"**; "Pick a time and a reply deadline. People will be asked to commit, subject to their conditions."
- **Time:** a select of event days; the best day gets the suffix " (best so far)".
- **Reply by:** a date input (min 2026-10-17; max the day before the chosen day; default the day before the best day, or today if that is earlier).
- **Minimum attendance:** "Go ahead if at least [2] people commit."
- Note: "Prototype: saving only updates this page. No one is notified and no confirmation round starts."
- Buttons: **Cancel** (text link) and **Save proposal**.
- Errors: **"Choose a reply-by date between today and the day before the event."** / **"Choose a minimum of at least 2 people."**
- On save, `event.proposal` is stored, the header status becomes "Time proposed (prototype)" and the "Your events" status becomes "Time proposed".
- Status: SIMULATED; there is no confirmation round.

### 7.5 Other behaviours

| Action             | Result                                                                                                                                                                                                                                                                                 | Status                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Copy link          | Tries `navigator.clipboard.writeText('https://showup.example/e/N8R2VQ')`; on failure, selects the link text and uses `execCommand('copy')`. Shows **"Link copied."** for 2.4 seconds, or **"Couldn't copy automatically. The link is selected, so copy it from there."** for 6 seconds | REAL copy, fixed fake URL         |
| QR                 | Static SVG encoding the same fixed URL                                                                                                                                                                                                                                                 | SIMULATED (every event shares it) |
| Preview as a guest | Switches this tab to Join for the same event                                                                                                                                                                                                                                           | REAL (single device)              |

---

## 8. Sample event page (E, `Event.dc.html`): fixed data

**Purpose:** show a populated event. **Entry:** See an example, Preview with sample responses, Continue to event, or the "Weekend plans / Invited" row. **Exit:** the wordmark or "Back" (to `Main.dc.html`, where the flow state is restored from sessionStorage). Screenshots 37–42. **Everything is FIXTURE and never changes from Respond input.**

**Top to bottom:**

- Header: wordmark link + status ("Collecting responses" / "Time proposed (prototype)")
- **"Sample event"** · H1 **"Weekend plans"** · **"8 responses"**
- **Best so far:** Saturday, **7 – 11pm**, Sat 24 Oct, "6 people could make this work."
- **Dot rows:**
  - Friday 23 Oct, 7 – 11pm: 4 red + 4 silver, "4 of 8 free"
  - Saturday 24 Oct, 7 – 11pm: 6 red, "**6** of 6 free" (the 6 in red)
  - On first view per session, the red dots fill in left to right, 40ms apart.
- **Invite panel:** "showup.example/e/7Q4KX2", Copy link, 96px QR
- **Actions:**
  - "Propose a time": inline at ≥720px; **on mobile it sits in a fixed glass bar at the bottom**
  - "Draft reminder": the reminder text is fixed to _"Hey, we're trying to lock in a time for Weekend plans. Add your availability when you get a chance!"_
- **Responses:** initials A S J D M N L K. The canvas Tweak `showRoster` adds faded P and T circles ("Priya · not yet", "Tom · not yet").
- **Footer:** "Prototype: a sample event with fixed, fictional responses. Answers on the Respond screen don't change it." and **"Back"**.

**Propose sheet (differs from the flow's):**

- A head row with "Weekend plans" and "Close".
- Fixed options: "Saturday 24 Oct, 7 – 11pm (best so far)" and "Friday 23 Oct, 7 – 11pm".
- Reply by, with the helper "Replies close at the end of this day, Sydney time." (default 2026-10-22).
- Minimum 2–8 (default 4).
- Buttons: **Save proposal** (primary) and **Cancel** (secondary button).
- Errors: "Choose a reply-by date." / "Choose a reply-by date between today and Friday 23 October, before the event starts." / "Choose a minimum from 2 to 8 people."
- The saved proposal lives in component state only; it is gone after a reload.

---

## 9. Implemented data model

The source is plain JavaScript; there is no TypeScript in the project. These interfaces describe the shapes the code actually reads and writes.

```ts
type Minutes = number; // minutes since local midnight; 1440 = 12am end-of-day. No time zone handling.
type SlotId = string; // 'd20261023' for created events; 'fri' | 'sat' in fixtures

interface Slot {
  // one candidate DAY (not a time slot)
  id: SlotId;
  iso?: string; // 'YYYY-MM-DD' (absent in participant fixture)
  day: string; // 'Friday'
  title: string; // 'Friday 23 Oct'
  short?: string; // 'Fri 23 Oct'
}
interface Window {
  s: Minutes;
  e: Minutes;
} // organiser's shared window, same for every day
interface Range {
  s: Minutes;
  e: Minutes;
} // ≥ 60 min, inside Window, merged when overlapping

type Avail = 0 | 1 | 2; // 0 Not free, 1 Free, 2 Favourite (whole day)
type Will = 'yes' | 'if' | 'no' | null;
type Condition =
  | { type: 'person'; name: string; known?: boolean } // known:false = unresolved "Sam?" (never saved)
  | { type: 'min'; n: string }; // numeric string, 2–20

interface Response {
  // stored per respondent inside the event
  who: string; // display name only; no id
  role: 'organiser' | 'guest';
  avail: Record<SlotId, Avail>;
  ranges: Record<SlotId, Range[]>; // kept even when avail is 0
  will: Record<SlotId, Will>;
  conds: Record<SlotId, Condition[] | null>;
  condText: Record<SlotId, string>; // raw text typed in the sheet
}
interface Proposal {
  slotId: SlotId;
  deadline: string /* YYYY-MM-DD */;
  min: string;
}
interface Event {
  // localStorage['showup-ev-<id>']
  id: string; // 6 random base36 chars ('demo' for fixtures)
  name: string;
  organiser: string;
  slots: Slot[]; // sorted by date
  win: Window;
  note: string; // captured, never shown
  responses: Response[];
  proposal: Proposal | null;
  demo?: true;
}
interface MyEventEntry {
  // localStorage['showup-events'] (≤20 kept, 5 shown)
  id: string;
  name: string;
  role: 'organising' | 'invited';
  who: string;
  status: 'Collecting responses' | 'Time proposed';
  updated: number;
  sample?: true;
}
```

**Flow component state (M, `baseState()`):**

- **Navigation:** `screen`, `mode`
- **Create:** `name`, `nameError`, `orgName`, `pickDays[]`, `calMonth`, `from`, `until`, `moreOpen`, `note`
- **Current event:** `event`, `myName`, `editing`, `joinName`, `joinError`
- **Respond draft:** `slots`, `win`, `avail`, `ranges`, `openWheel`, `will`, `conds`, `condText`, `applied`, `errors`, `formError`, `noneWork`, `phase` (`editing | saving | saved`), `dirty`
- **Conditions sheet:** `sheet {slotId, editing, text, chips[], status: 'empty'|'ok'|'unsupported'|'none', editIdx}`, `sheetClosing`
- **Event page:** `linkMsg`, `remMsg`, `reminderOpen`, `proposeOpen`, `proposeClosing`, `propForm`, `propError`, `activePerson`
- **Other:** `myEvents`, `discsGrown`, `dotsSettled`, `leaving`, `anim`, `liveMsg`

### 9.1 Derived results (frontend logic, REAL but provisional)

- **`dayStats(ev, day)`** works out who would go on a day:
  - free = responses with `avail > 0`;
  - candidates = free people with will `yes` or `if`;
  - then it **repeatedly removes** any `if` person whose conditions fail, until nothing changes. A person condition needs that name (case-insensitive) among the remaining candidates; a minimum condition needs the remaining count ≥ n.
  - This is an iterative greatest-fixed-point reduction **per day, ignoring time ranges**.
- **`bestWindow(ev, day, people)`**: over 15-minute steps of the window, finds the steps where the most of `people` are free and returns the longest contiguous run at that count (the earliest wins on ties).
- **`summarise(ev)`**: the best day has the most would-go; ties go to more free, then the earlier day. If nobody would go on any day, there is no "Best so far".
- **`dayDots(ev, day)`**: window = `bestWindow` over the people who would go (or over the free people if nobody would go). Dots and counts include **only people whose range covers that whole window**.

### 9.2 Mismatches with the intended days-and-windows model (flagged, not changed)

1. **Conditions ignore time.** Willingness and conditions are judged per day; whether people's ranges overlap is only used afterwards to choose the displayed window and counts. A person counted as "would go" may not share the chosen window, which explains why the dot count can be lower than `dayStats.go`.
2. **One window per event.** There is no per-day window.
3. **Identity is a typed name.** Organiser permissions are just a mode flag on this device.
4. **Event status is never stored.** It is derived from `proposal` (Collecting or Time proposed). There is no confirmed or failed state.
5. **No time zone.** Minutes are local; the sample's "Sydney time" is text only.
6. **The sample page doesn't use this model.** It hard-codes aggregate numbers (DOT_DAYS, best so far) with no per-person records.
7. **Proposal minimum** is ≥2 with no upper bound in the flow, but 2–8 on the sample page.

---

## 10. Fixtures and disconnected flows

| Fixture                                                                               | Where                       | Used by                                                  |
| ------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| `SAMPLE_SLOTS` (Fri 23 Oct `fri`, Sat 24 Oct `sat`), `SAMPLE_WINDOW` 1020–1440        | M                           | seeds `respond`, `fresh`, `join`, `guest`, `participant` |
| `ORG_RESP`: Alex (organiser). Fri Free 7–11pm Yes; Sat Favourite 7–11pm Yes           | M                           | seeds `fresh`, `join`, `guest`                           |
| `GUEST_RESP`: Jess (guest). Fri Free 6–10pm If… (at least 3); Sat Free 8pm–12am Yes   | M                           | seed `guest` (result: Sat best, 8 – 11pm, 2 people)      |
| `NAMES`: Alex Sam Jess Drew Maya Nina Leo Kai                                         | M                           | participant-mode condition names                         |
| Create seed: name "Weekend plans", organiser "Alex", days 23 and 24 Oct               | M                           | seed `create`                                            |
| `DOT_DAYS`, best so far, 8 initials, roster Priya and Tom, `SLOT_INFO`, reminder text | E                           | sample event page                                        |
| `TODAY = '2026-10-17'`                                                                | M (and E's `min` attribute) | calendar, deadlines                                      |

**Disconnected:**

- (a) Participant-mode Respond never updates the sample event.
- (b) The sample event never reflects anything entered in the flow.
- (c) Each seeded canvas frame is its own component instance; frames share only browser storage.
- (d) The shared link is fake, so guests can only be simulated on the same device ("Preview as a guest").

---

## 11. Screenshot checklist (captured)

**How these were captured:**

- Captured in `screenshots/` by `capture.py`-style automation against the **canvas runtime** run locally (Chromium, Manrope served locally, full-page captures).
- **Widths:** 390×844, 768×1024 and 1440×900.
- **Naming:** `NN-state--WIDTH.png`; `index.json` maps each state to its files.

**Capture caveats:**

- Fixed elements (the sample page's mobile bar) appear at their viewport position partway down full-page captures.
- Clipboard writes are refused in headless Chromium, so the copy fallback (link text selected) is what's shown.
- Captures 32–36 come from separate seeded frames.

| #   | State                                     | #   | State                                              |
| --- | ----------------------------------------- | --- | -------------------------------------------------- |
| 01  | Landing                                   | 22  | Event, guest view                                  |
| 02  | Landing, empty-name error                 | 23  | Respond, editing ("Back to event", "Save changes") |
| 03  | Create, initial (button disabled)         | 24  | Landing with Your events                           |
| 04  | Create, 2 days + name + More options open | 25  | Event, organiser with 2 responses                  |
| 05  | Create, calendar on November              | 26  | Event, reminder open                               |
| 06  | Respond organiser, all days slim          | 27  | Propose sheet (flow)                               |
| 07  | Day Free, expanded                        | 28  | Propose error (minimum)                            |
| 08  | Day Favourite, 7pm – 11pm                 | 29  | Proposal saved notice                              |
| 09  | Range wheels open (historical stand-in)   | 30  | Seed: Create                                       |
| 10  | Two ranges on one bar                     | 31  | Seed: Respond                                      |
| 11  | Submit error, missing willingness         | 32  | Seed: Event fresh                                  |
| 12  | Conditions sheet, empty                   | 33  | Seed: Join                                         |
| 13  | Conditions sheet, unsupported line        | 34  | Seed: Event guest view                             |
| 14  | Conditions sheet, chips                   | 35  | Respond, participant mode                          |
| 15  | Chip editing (stepper)                    | 36  | Participant Saved block                            |
| 16  | Conditions summary + reuse link           | 37  | Sample event                                       |
| 17  | Event fresh (organiser)                   | 38  | Sample: initial tapped (tooltip)                   |
| 18  | After Copy link                           | 39  | Sample: reminder open                              |
| 19  | Join                                      | 40  | Sample: propose sheet                              |
| 20  | Join error (duplicate name)               | 41  | Sample: propose error (deadline)                   |
| 21  | Respond, guest                            | 42  | Sample: proposal saved                             |

**Not captured (recapture once fixed or supplied):**

- The flow event page with red dots filled (was blocked by D1, now fixed in the standalone copy; seed frame 34 shows the intended look).
- The `showRoster` tweak on the sample page.
- Reduced-motion variants.
- The supplied wheel picker (the reference screenshots predate its integration).
