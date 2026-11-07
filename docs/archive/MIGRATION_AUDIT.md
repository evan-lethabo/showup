# SHOWUP: Next.js migration audit (Phase 1)

Branch `nextjs-migration`, based on `evan-branch` @ `1e4e797`. This audit only reads the repo; nothing outside this file was changed.

**Status (18 Oct 2026):** approved and carried out. Q1–Q4 as recommended, with Next 14.2.35 + React 18.3.1 (not Next 15) and the archive layout in §7. See `README.md` for the result. §7's `lib/ui/utils/*.ts` etc. are as built. The page logic lives in `lib/ui/flow/` and `lib/ui/sample/`.

---

## 0. Headline findings

1. **The app is not vanilla JS. It is already a React 18.3.1 app.** `standalone-support.js` loads vendored React/ReactDOM, compiles the `{{hole}}` / `<sc-if>` / `<sc-for>` template in each `.dc.html` into `React.createElement` calls, and drives a class component (`class Component extends DCLogic`) through `setState` and the React lifecycle. The JS in `js/` contains no `querySelector`, no `addEventListener` and no direct DOM mutation. Everything goes through `renderVals()`, which returns plain values and handlers, plus callback refs.
   **This makes the port easier and safer than a DOM-to-React port.** The template maps to JSX one-to-one, and the logic class can be kept almost verbatim. Wrapping things in `useEffect` is not needed.
2. **There are only two real pages:** `Main.dc.html` (one component that runs the whole flow as a state machine: Landing → Create → Respond → Join → Event, plus two sheets) and `Event.dc.html` (a fixed sample event). Each of the 16 canvas files in `src/showup-source/project/` is one of these two with a different start screen, title, preview size or link target.
3. **Main's CSS and Event's CSS conflict.** 12 selectors are defined differently in each (`.header`, `.wordmark`, `.display`, `.comp-h`, `.input-line,.select`, `.rec-time`, `.reminder`, `.proposal`, `.sheet`, `.sheet-actions`, plus keyframe names). **Importing both globally in `app/layout.tsx` would visibly break one page.** Today they never coexist because each is its own HTML document. → Question Q1.
4. **The "screens" share in-memory state and cannot be split into separate routes without rewriting logic.** Create builds an `event` object in state and hands it to Respond. Respond hands it to Event. Join reads it. All screen changes go through `go(patch)` with View Transitions. One folder per screen means moving this state across routes, which hard rule 1 forbids. → Question Q2.
5. **`setState` in the original runtime is synchronous for reads.** `DCLogic.setState` replaces `this.state` immediately and then re-renders. The code depends on this. For example, picking a name chip calls `editChip(...)` and then `patchSheet({editIdx:null})`, and the second call reads `this.state.sheet`. Under plain `React.Component` the second call would read stale state and silently drop the chip edit. **The port must keep the DCLogic/Host pair from `standalone-support.js`** (about 40 lines). The template compiler is dropped.
6. **The global mixin registry would cross-contaminate pages in Next.js.** `window.Showup.register()` keeps one module-level list. Both pages register mixins with the same method names (`AppMixin.renderVals`, `ProposeSheetMixin.openPropose`, …). In a single Next.js bundle with client-side navigation, the second page's `Component` could receive the first page's methods. Fix: each page's `main` passes an explicit mixin list to `mix()`. This is a 2-line change and the logic stays the same.
7. **The design-reference screenshots no longer match current behaviour in places.** They were captured before the `componentDidUpdate` fix (defect D1). Example: the flow's event page now fills red dots and scrolls to top/focuses headings, which the screenshots don't show. **The Phase 3 baseline must be fresh Playwright captures of `src/showup-standalone/`, not the PNGs.**
8. **Everything in `archives/` is a byte-identical duplicate of `src/`.** Verified by unzipping and running `diff -r`, which reports no differences. The two CSS files in `design-reference/styles/` are verbatim copies of the canvas CSS. The standalone CSS differs only by one rule, `#best-label{margin-top:0}`, which was moved out of an inline `style=`.

---

## 1. File tree (one line per file)

```
.gitignore                                    ignores .DS_Store only
showup-handoff/
├── archives/
│   ├── SHA256SUMS.txt                        checksums of the 17 canvas files (identical to src/showup-source/SHA256SUMS.txt)
│   ├── showup-source.zip                     DUPLICATE: zip of src/showup-source/ (diff -r clean)
│   └── showup-standalone.zip                 DUPLICATE: zip of src/showup-standalone/ (diff -r clean)
├── design-reference/
│   ├── screenshots/                          42 states × 3 widths (390/768/1440) captured from the canvas BEFORE the D1 fix (table below)
│   │   └── index.json                        state id → note + 3 filenames
│   └── styles/
│       ├── main.css                          verbatim copy of canvas Main.dc.html <style> (reference only, not loaded)
│       └── event.css                         verbatim copy of canvas Event.dc.html <style> (reference only, not loaded)
├── docs/
│   ├── SOURCE_MANIFEST.md                    handoff doc 1: runtime, tree, routing, storage, defects, standalone restructure (§16)
│   ├── DESIGN_SYSTEM.md                      handoff doc 2: tokens, type, glass, layout, motion, main-vs-event CSS diffs (§9)
│   ├── SCREENS.md                            handoff doc 3: every screen, copy, states, data model, fixtures
│   └── BUILD_STAGES.md                       handoff doc 4: prompts for an implementing agent (Routes A/B), integration readiness, missing reqs R1–R9
└── src/
    ├── showup-source/                        the original Claude Design canvas project (needs the canvas's support.js, which is absent, so it can't run here)
    │   ├── SHA256SUMS.txt                    checksums
    │   └── project/
    │       ├── canvas.json                   canvas board layout: 16 boards, titles, preview sizes, launch = Main.dc.html
    │       ├── Main.dc.html                  AUTHORED flow page (inline CSS + template + script), desktop family, starts Landing
    │       ├── MainMobile.dc.html            derived: FAMILY='mobile', links → EventMobile, 390px preview
    │       ├── Create.dc.html / CreateMobile.dc.html             derived: startAt=create
    │       ├── Respond.dc.html / RespondMobile.dc.html           derived: startAt=respond
    │       ├── Fresh.dc.html / FreshMobile.dc.html               derived: startAt=fresh
    │       ├── Join.dc.html / JoinMobile.dc.html                 derived: startAt=join
    │       ├── Guest.dc.html / GuestMobile.dc.html               derived: startAt=guest
    │       ├── Participant.dc.html / ParticipantMobile.dc.html   derived: startAt=participant
    │       ├── Event.dc.html                 AUTHORED sample event page, desktop family
    │       └── EventMobile.dc.html           derived: links → MainMobile, 390px preview
    └── showup-standalone/                    ★ THE RUNNING APP (source of truth for the port)
        ├── README.txt                        how to run (python3 -m http.server), contents (accurate)
        ├── Main.dc.html                      flow template only: <link>s, <script>s, <x-dc> markup (618 lines)
        ├── Event.dc.html                     sample-event template only (185 lines)
        ├── standalone-support.js             runtime: loads React, compiles template → React elements, DCLogic + Host, local font fallback
        ├── vendor/
        │   ├── react.production.min.js       React 18.3.1 UMD
        │   ├── react-dom.production.min.js   ReactDOM 18.3.1 UMD
        │   └── LICENSE-react*.txt            MIT licences
        ├── fonts/
        │   ├── manrope-latin-wght-normal.woff2   Manrope variable (offline fallback for Google Fonts)
        │   └── LICENSE-Manrope-OFL.txt       OFL licence
        ├── css/
        │   ├── variables.css                 :root tokens (colours, spacing, radii, easing): both pages
        │   ├── reset.css                     box-sizing, body bg/colour/font, link colour: both pages
        │   ├── base.css                      .su shell, .ambient, .layer, .sr, .wrap, header, wordmark, type styles: Main only
        │   ├── layout.css                    12-col .col-grid / .col-main / .col-intro: Main only
        │   ├── transitions.css               screen enter/leave + View Transition rules: Main only
        │   ├── event.css                     ALL CSS for the sample event page (own shell, type, glass, buttons, sheet): Event only
        │   ├── components/materials.css      .glass / .glass-control / .glass-silver / .glass-red: Main
        │   ├── components/buttons.css        .btn, .btn-primary/-secondary/-sm, .text-btn, .btn-row: Main
        │   ├── components/fields.css         .field, .input-line, .input, .select, errors: Main
        │   ├── components/segmented.css      .seg / .seg-thumb / .seg-opt (Not free/Free/Favourite, Yes/If…/No): Main
        │   ├── components/wheels.css         stand-in time wheels: Main
        │   ├── screens/landing.css           .l-*, .my-events, .my-row: Main
        │   ├── screens/create.css            .name-title, .cal*, .c-*, .more: Main
        │   ├── screens/respond.css           .day, .reveal, .tl*, .ranges, .will-row, .cond-sum, .saved, .r-rail: Main
        │   ├── screens/join.css              .j-org, .j-form: Main
        │   ├── screens/event-flow.css        .ev-grid, .f-invite, .dotrows/.dot, .avatars, .e-share, #best-label: Main
        │   └── screens/sheets.css            .overlay, .scrim, .sheet, chips, stepper, propose fields: Main
        └── js/                               classic scripts sharing globals (no modules); load order matters
            ├── config.js                     FAMILY, DEFAULT_START, storage keys, TODAY='2026-10-17', FRESH_LINK, ITEM_H
            ├── registry.js                   window.Showup.register/mix: copies mixin methods onto Component (both pages)
            ├── state.js                      baseState(), respondFor(), seed(startAt)
            ├── main.js                       Main entry: DCMeta (startAt prop), Component ctor/lifecycle, sessionStorage restore
            ├── data/constants.js             NAMES, NUMWORDS, STATE_LABELS, DAYS, DOW, MON, MONTHS, STOPWORDS
            ├── data/fixtures.js              FIXTURE: SAMPLE_SLOTS, SAMPLE_WINDOW, ORG_RESP (Alex), GUEST_RESP (Jess), demoEvent()
            ├── services/storage.js           localStorage: store, loadMyEvents, recordMyEvent, saveEventData, loadEventData
            ├── utils/helpers.js              clone, cloneConds, sameConds, steps, mergeRanges, emptyMaps, newId
            ├── utils/format.js               joinList, chipLabel, describe, pad2, fmtShort/Num/Compact/Wheel/Tick, rangeText
            ├── utils/dates.js                dateFromIso, isoFromDate, slotFromIso
            ├── utils/recommend.js            ENGINE-LIKE: dayStats (condition elimination), bestWindow, coverCount, dayDots, summarise
            ├── utils/dot-rows.js             dotRowsFrom(): dot-row view model (both pages)
            ├── utils/conditions-parser.js    SIMULATED AI: regex parseConditions(raw, group) → {status, chips}
            ├── components/app.js             AppMixin: reduced/motion, go() (View Transitions), goHome, saveForReturn, renderVals merge
            ├── components/wheels.js          WheelsMixin: makeWheel, registerWheel, wheelScrolled, syncWheels
            ├── components/landing.js         LandingMixin: next, openMyEvent, landingVals
            ├── components/create.js          CreateMixin: calendar, from/until, createEvent, createVals
            ├── components/join.js            JoinMixin: joinContinue, previewGuest, joinVals
            ├── components/respond.js         RespondMixin: avail, timeline taps, ranges, willingness, submit (700ms fake save), respondVals
            ├── components/conditions-sheet.js ConditionsSheetMixin: sheet open/close, 600ms parse debounce, chips, reuse
            ├── components/event-page.js      EventPageMixin: flash/copy (clipboard), eventContext, eventVals, withdraw
            ├── components/propose-sheet.js   ProposeSheetMixin (flow): open/close/save proposal
            └── sample/                       Event.dc.html's own copies (separate globals)
                ├── constants.js              REMINDER, LINK, DOTS_KEY (dup), DOT_DAYS, SLOT_INFO, PEOPLE, WAITING, DAYS/MONTHS (dup)
                ├── helpers.js                dayBefore, prettyDate, reducedMotion
                ├── main.js                   Event entry: DCMeta (showRoster prop), ctor, dot-grow timers, lifecycle
                └── components/
                    ├── app.js                AppMixin (sample): statusLabel, renderVals merge
                    ├── results.js            ResultsMixin: dotRows, people/avatars, proposal text, withdraw
                    ├── invite.js             InviteMixin: flash/copy (dup of event-page.js logic), reminder toggle
                    └── propose-sheet.js      ProposeSheetMixin (sample): different validation (2–8, prettyDate message)
```

Not tracked: `.DS_Store` (ignored). The repo has no root README, no package.json and no tests.

<details><summary>Design-reference screenshots (42 states)</summary>

| Files | State |
|---|---|
| `01-landing--{390,768,1440}.png` | Landing, empty |
| `02-landing-name-error--…` | Landing, Next with empty name |
| `03-create-initial--…` | Create, no days picked, Create event disabled |
| `04-create-filled-more-options--…` | Create, two days selected, name filled, More options open |
| `05-create-calendar-november--…` | Create, calendar moved to November |
| `06-respond-organiser-initial--…` | Respond (organiser), all days Not free = slim rows |
| `07-respond-day-free--…` | Day 1 Free: card expanded |
| `08-respond-day-favourite-7-11--…` | Day 1 Favourite, 7pm – 11pm |
| `09-respond-wheels-open--…` | Stand-in From/Until wheels open |
| `10-respond-split-ranges--…` | Second range on the same bar |
| `11-respond-error-missing-willingness--…` | Submit with missing Yes/If…/No |
| `12`–`15` conditions sheet | empty / unsupported / chips / chip stepper |
| `16-respond-conditions-summary--…` | Conditions summary + reuse link |
| `17`–`18` event fresh | organiser alone / after Copy link |
| `19`–`20` join | empty / duplicate-name error |
| `21-respond-guest--…` | Respond as guest |
| `22-event-guest--…` | Event, guest view |
| `23-respond-editing--…` | Edit my response |
| `24-landing-your-events--…` | Landing with Your events |
| `25`–`29` event organiser | full / reminder / propose sheet / propose error / proposal saved |
| `30`–`34` seeds | create / respond / event-fresh / join / event-guest |
| `35`–`36` participant | respond / saved block |
| `37`–`42` sample event | default / initial tapped / reminder / propose / propose error / saved |

</details>

---

## 2. Pages and screens → dependencies

There are two documents. Every "screen" lives inside one of them.

| Page (original URL) | Screen / state | Template section | CSS | JS |
|---|---|---|---|---|
| **Main.dc.html** | Landing (`screen:'landing'`) | `<sc-if isLanding>` L57–106 | variables, reset, base, materials, buttons, fields, layout, transitions, **landing** | config, constants, storage, state, app, **landing** |
| | Create (`'create'`) | `isCreate` L108–205 | + **create**, wheels, segmented | + dates, helpers, **create**, wheels |
| | Join (`'join'`) | `isJoin` L207–229 | + **join** | + **join** |
| | Respond (`'respond'`; modes organiser / guest / participant) | `isRespond` L231–396 | + **respond**, segmented, wheels | + fixtures, format, **respond**, wheels |
| | Event (`'event'`; organiser-fresh / organiser-full / guest) | `isEvent` L398–523 | + **event-flow** | + recommend, dot-rows, **event-page** |
| | Conditions sheet (overlay) | `sheetOpen` L525–572 | + **sheets** | + conditions-parser, **conditions-sheet** |
| | Propose sheet (overlay) | `proposeOpen` L574–612 | + **sheets** | + **propose-sheet** |
| **Event.dc.html** | Sample event (fixed data; `showRoster` prop) | whole template | variables, reset, **event.css** only | dot-rows, registry, sample/* |

All Main CSS files are loaded for every Main screen. They are not split per screen at runtime. Event uses only `variables` + `reset` + `event.css`.

Entry seeds (the `startAt` prop, which picks the canvas boards): `landing` (default), `create`, `respond`, `fresh`, `join`, `guest`, `participant`. In the standalone you can only reach these by editing `DCMeta`. The canvas boards were the only way to open them directly.

---

## 3. Shared / repeated markup (component candidates)

| Markup | Occurrences | Identical? | Notes |
|---|---|---|---|
| Header + wordmark `showup<span class="dot">.</span>` | Main ×5 (one per screen, `<button onClick=goHome>`), Event ×1 (`<a href="Main.dc.html">`) | Main copies identical, except the Event screen adds `header-ev` + status `<p>` | Event's is a link, not a button |
| QR code inline SVG | Main ×2 (`f-qr` and `qr`, same N8R2VQ path), Event ×1 (`qr`, different 7Q4KX2 path) | path differs by page | big SVG strings; move into a `QrCode` component with the `d` string as data |
| Share panel `.e-share` (link + Copy + msg + QR) | Main org side, Event side | identical except link text | |
| Fresh invite panel `.f-invite` | Main only | — | different layout from `.e-share` |
| Dot rows `<ul.dotrows>` | Main event, Event | **identical markup** | `dotRowsFrom` already shared |
| Avatars `.avatars` | Main event, Event | almost (Event uses `p.aria` / `p.tip`, Main uses `p.name`) | |
| Reminder panel `.reminder.glass` | Main, Event | identical | |
| Proposal notice `.proposal` | Main, Event | identical | |
| Propose sheet | Main, Event | **different**: Event has `.sheet-head` + Close, static `<option>`s, a "Sydney time" hint, `max=8` vs `50`, buttons reversed | keep as two components |
| Overlay shell (`.overlay` > `.scrim` + `.sheet.glass[role=dialog]`) | Main ×2, Event ×1 | identical | |
| Wheel column (`.wheel-col` … `.wheel-scroll` …) | Create ×1 (`createWheels`), Respond ×1 (`r.wheels`) | identical | |
| Segmented control with thumb (`.seg` + `.seg-thumb`) | Respond ×2 per day (availability, willingness) | same pattern, different options | |
| "Your events" row | Landing ×2 (`<a>` for sample, `<button>` for others) | same inner spans | |

---

## 4. How the JS works

**Runtime model.** Each page defines `Component extends DCLogic`. Mixins (one per screen or feature) are copied onto it by `Showup.mix`. `renderVals()` merges each mixin's `*Vals(state)` into one flat object of values, class strings, aria strings and closures. The template reads it through `{{path}}`. `standalone-support.js`'s Host React component owns re-rendering. `logic.setState(patch, cb)` updates `logic.state` **synchronously**, then calls `Host.setState({__v+1}, cb)`. `componentDidUpdate` receives only `prevProps`, so the code tracks `_prev` itself (the D1 fix).

**Globals.** Every top-level `var` / `function` in `js/` is a window global, so load order matters. The page globals are `window.Showup`, `window.DCMeta`, `window.DCComponentFactory`, `window.DCLogic` and `window.StreamableLogic`. `sample/constants.js` redefines `DAYS`, `MONTHS` and `DOTS_KEY`. That's harmless today because the two pages never share a window, but it matters for modules.

**DOM access.** No `querySelector` or `getElementById` in app code. Elements come from callback refs: `headingEl`, `sheetEl`, `propEl`, `savedEl`, `linkEl`, `remEl`, `slotEls[id]`, `wheelEls[key]`. The code does focus and `scrollIntoView` on screen change, sheet open and save. Wheels set `scrollTop` / `scrollTo` directly. `tapBar` uses `getBoundingClientRect` + `clientX`, and wheel click uses `clientY`. Copy uses `navigator.clipboard`, with a fallback to `select()` / Range + `execCommand('copy')`.

**Event listeners.** All are React props: `onClick`, `onChange`, `onKeyDown` (Enter on Landing/Join, Escape in sheets, arrows/PageUp/PageDown on wheels), `onScroll` (wheels), `onFocus` (select-all on the reminder). There is no `addEventListener`.

**Timers.** Dot grow is 80 ms then 1200 ms (Main) and 60 ms then 900 ms (Event). Screen fade is 160 ms. View Transition fallback is 250 ms. Sheet close is 200 ms (150 ms with reduced motion). The parse debounce is 600 ms. Fake save is 700 ms. Wheel settle is 120 ms. Copy flash is 2400 / 6000 ms. All of them are cleared in `componentWillUnmount`.

**Navigation.**
- Inside Main: the `state.screen` state machine through `go(patch)`. It uses `document.startViewTransition` when available, otherwise a 160 ms fade. There is no URL change.
- Main → Event: `<a href="Event.dc.html" onClick=saveForReturn>` at four places ("See an example", the sample "Your events" row, "Preview with sample responses", "Continue to event"). `saveForReturn` writes the full flow state to `sessionStorage['showup-proto-flow']` with a `family` tag. In participant-saved state it also records the sample in Your events.
- Event → Main: wordmark `<a href="Main.dc.html">` and footer "Back". Main's constructor (when starting at landing) restores and removes `showup-proto-flow` if the family matches.
- These are **full page loads**, which is why the CSS conflict never shows.

**Storage.**

| Key | Store | Written by | Read by |
|---|---|---|---|
| `showup-events` | localStorage | `recordMyEvent` (≤20, newest first, dedup by id+role) | `loadMyEvents` → Landing "Your events" (top 5) |
| `showup-ev-<id>` | localStorage | `saveEventData` (create, submit, propose, withdraw) | `loadEventData` (open from Your events) |
| `__su_t` | localStorage | `store()` availability probe (set + removed) | — |
| `showup-proto-flow` | sessionStorage | `saveForReturn` | Main ctor (once, then deleted) |
| `showup-dots-seen` | sessionStorage | dot-grow animation (both pages) | both ctors (skip the animation once seen) |

**Fake / mock data (everything a backend will later replace).**
- FIXTURE: `SAMPLE_SLOTS`, `SAMPLE_WINDOW`, `ORG_RESP`, `GUEST_RESP`, `demoEvent`, `NAMES`, the create seed (Weekend plans / Alex / 23–24 Oct), all of `sample/constants.js` (8 people, DOT_DAYS, SLOT_INFO, Priya/Tom roster, reminder).
- SIMULATED: `parseConditions` (regex instead of AI), the 700 ms "Saving…" delay, `newId()` via Math.random, fixed links `showup.example/e/N8R2VQ` / `7Q4KX2`, static QR SVGs, `TODAY = '2026-10-17'` (hard-coded; real today is 18 Oct and it doesn't matter), `min="2026-10-17"` hard-coded in Event, "Preview as a guest" on the same device.
- ENGINE-LIKE (future `lib/engine`): `dayStats`, `bestWindow`, `coverCount`, `dayDots`, `summarise` in `utils/recommend.js`.

---

## 5. Docs: accurate vs outdated (checked against the code)

| Doc | Verdict | Details |
|---|---|---|
| `src/showup-standalone/README.txt` | **Accurate** | Contents, run steps and script-order note all match. It becomes obsolete once Next.js replaces the runtime. |
| `DESIGN_SYSTEM.md` | **Accurate** (values) | I spot-checked §9's main-vs-event difference table against the CSS and it is correct. It refers to `styles/main.css` / `event.css`, which still match the standalone CSS (+ `#best-label`). Still useful as the design reference. |
| `SCREENS.md` | **Mostly accurate** | Behaviour, copy, data model (§9) and fixtures (§10) match the code. Outdated parts: §0/§1/§7 describe D1 effects as the approved build ("does not scroll to top"), which the current code no longer does. §11: the screenshots predate the D1 fix. Paths use the old layout. |
| `SOURCE_MANIFEST.md` | **Partly outdated** (a handoff artefact) | Accurate: §0.1–0.4, §3 navigation tables, §3.3 derived-file rules (I verified by diff), §4 construct mapping, §8–9, §11, §15, §16. Outdated: §2 tree (canvas only, says "no separate component files"), §5 "all inline; there are no component files", §6.2 "one inline `<style>` per file", §10 (unzip steps; the folders are now unpacked in `src/`), §12–14 (export/transfer checklists for a handoff that was scrapped). |
| `BUILD_STAGES.md` | **Outdated as a plan** | Written as prompts for another agent. A2 is done. A5 is mostly done already (`services/storage.js`, but no async interface). A6 is half done (functions are already in `utils/`, no tests). A4(b) is effectively this migration. **Still valuable:** §3 Integration readiness and §4 Missing requirements R1–R9 (the backend/engine open questions) and the A6 expected test values. |
| `design-reference/screenshots/` | **Partly outdated** | Captured from the canvas before the D1 fix. Fine for layout and appearance. Not valid for focus, scroll or flow red-dot states. |

---

## 6. Duplicates, dead files, risks

**Duplicates / dead (to archive, never delete):**
- `archives/showup-source.zip`, `archives/showup-standalone.zip`, `archives/SHA256SUMS.txt`: identical to `src/`.
- `src/showup-source/project/*` (all 16 + canvas.json): the canvas originals. They can't run without the absent `support.js`. All 14 derived boards collapse into `startAt` values plus responsive CSS.
- `design-reference/styles/*.css`: reference copies of the CSS already in `css/`.
- After the port: `standalone-support.js`, `vendor/` (React UMD), `js/registry.js` (global form) and the `.dc.html` templates are superseded. **Keep `src/showup-standalone/` runnable in the archive.** It is the Phase 3 baseline.
- Code duplicates (leave alone, per the no-refactor rule): `flash`/`legacyCopy`/`copy` in `event-page.js` and `sample/components/invite.js`. Also `DAYS`, `MONTHS` and `DOTS_KEY` in `sample/constants.js`.

**Risks for the port (and the mitigation I'd use):**

| # | Risk | Mitigation |
|---|---|---|
| R1 | Global CSS conflict between Main and Event (§0.3) | Q1 |
| R2 | Synchronous-read `setState` semantics (§0.5) | Port DCLogic + Host into `lib/ui/dc-runtime.tsx`. Same contract, no template compiler. |
| R3 | Global mixin registry cross-contamination (§0.6) | Pass an explicit mixin list to `mix()` per page |
| R4 | SSR: constructors read `sessionStorage`/`localStorage`/`matchMedia`. On the server these fall back to defaults, which causes hydration mismatches (Your events, dots-seen). | Render the page client-only (`next/dynamic` with `ssr:false`), as the original is |
| R5 | Template quirks: text holes render in `<span class="sc-interp">`; whitespace-only text nodes containing spaces are kept; wrapper `div#dc-root > div.sc-host[data-sc-name]` | No CSS targets `sc-*`, there are no `:first-child`/`:empty`-type selectors, and the action rows are flex. So I'll drop the `sc-interp` spans, keep the two wrapper divs, and check with screenshots. I'll add `{' '}` only where a diff shows a gap. |
| R6 | Attribute quirks in the source: `tabindex`, `readonly=""` and `crossorigin=""` are passed lowercase (React prod warns silently) | Use `tabIndex` / `readOnly`. The DOM result is the same and there are no dev console errors. |
| R7 | React 18.3.1 → React 19 (Next 15 requires 19) | Code uses only class lifecycle, callback refs and controlled inputs, which behave the same. Fallback if the screenshot diff disagrees: Next 14.2 + React 18.3.1. |
| R8 | Two `id="best-label"` and two `id="reminder-text"`/`p-time` inside conditional branches | They're mutually exclusive, as in the original. I'll keep them. |
| R9 | View Transitions + `setState` callback timing in `go()` | Preserved by the Host's `setState(cb)` |
| R10 | Fonts: Google Fonts `<link>` hoisted from `<helmet>`, plus a local `@font-face` fallback injected by JS | Put the same `<link>`s in `<head>` and the same `@font-face` in a small `styles/fonts.css`, with the woff2 in `public/fonts/`. Don't use `next/font`, because it changes the family name. |
| R11 | Hard-coded `TODAY = '2026-10-17'` drives the calendar minimum, the start month and the deadline bounds | Unchanged (it's fixture behaviour) |
| R12 | Missing wheel picker (`time-wheel-picker.html`) | Out of scope. The stand-in is ported as-is. |

---

## 7. Proposed Next.js structure and file mapping

Assumes the recommended answers to Q1–Q4. `git mv` is used for every move, so history is kept.

```
app/
  layout.tsx                 <html lang="en-AU">, Google Fonts <link>s, imports styles/variables.css + reset.css + fonts.css (shared, non-conflicting)
  (flow)/layout.tsx          imports Main's CSS set (base … sheets) in original order
  (flow)/page.tsx            "/"  → <FlowApp startAt="landing"/>   (= Main.dc.html)
  (flow)/preview/[startAt]/page.tsx   "/preview/create|respond|fresh|join|guest|participant" (= canvas boards; also used for screenshot baselines)
  example/layout.tsx         imports styles/event.css
  example/page.tsx           "/example" → <SampleEventApp/>        (= Event.dc.html)
  api/                       EMPTY placeholder (.gitkeep)
components/
  flow/FlowApp.tsx           client wrapper: Host + Main Component; JSX = Main.dc.html template
  flow/screens/{Landing,Create,Join,Respond,EventPage}.tsx    the five <sc-if> sections, taking `v` (renderVals)
  flow/sheets/{ConditionsSheet,ProposeSheet}.tsx
  sample/SampleEventApp.tsx  JSX = Event.dc.html template (+ sample ProposeSheet)
  shared/{Header,QrCode,DotRows,Avatars,ReminderPanel,ProposalNotice,Wheel}.tsx   only where markup is identical (§3)
lib/ui/
  dc-runtime.tsx             DCLogic + Host from standalone-support.js §4 (template compiler dropped)
  registry.ts                mix(Target, mixins[])  (explicit list, no global)
  config.ts, state.ts        ← js/config.js, js/state.js
  data/{constants,fixtures}.ts
  services/storage.ts
  utils/{helpers,format,dates,recommend,dot-rows,conditions-parser}.ts
  flow/{main,app,wheels,landing,create,join,respond,conditions-sheet,event-page,propose-sheet}.ts
  sample/{main,constants,helpers}.ts, sample/components/{app,results,invite,propose-sheet}.ts
lib/engine/                  EMPTY placeholder (.gitkeep): recommend.ts moves here later, not now
lib/supabase/                EMPTY placeholder (.gitkeep)
styles/                      the 17 CSS files, unchanged, same sub-folders (+ fonts.css from standalone-support.js §1)
public/fonts/                manrope-latin-wght-normal.woff2 (+ licence)
docs/
  DESIGN_SYSTEM.md, SCREENS.md        (kept; SCREENS gets a dated note on D1/paths)
  design-references/screenshots/      (+ index.json)
  archive/                            SOURCE_MANIFEST.md, BUILD_STAGES.md, README-archive.md (what changed and why)
archive/
  showup-standalone/         the runnable original (Phase 3 baseline; unchanged)
  showup-source/             canvas project + SHA256SUMS
  zips/                      the two zips + SHA256SUMS
  design-reference-styles/   main.css, event.css
MIGRATION_AUDIT.md, README.md
```

**Mapping (old → new):**

| Old | New |
|---|---|
| `src/showup-standalone/css/**` | `styles/**` (contents unchanged; also kept in `archive/showup-standalone/` so the baseline runs, which makes it a copy rather than a move) |
| `src/showup-standalone/js/config.js`, `state.js` | `lib/ui/config.ts`, `lib/ui/state.ts` (adds `export`/`import`, nothing else) |
| `js/data/*`, `js/services/*`, `js/utils/*` | `lib/ui/data/*`, `lib/ui/services/*`, `lib/ui/utils/*` |
| `js/registry.js` | `lib/ui/registry.ts` (explicit mixin list) |
| `js/main.js`, `js/components/*.js` | `lib/ui/flow/*.ts` |
| `js/sample/**` | `lib/ui/sample/**` |
| `standalone-support.js` §4 (DCLogic/Host) | `lib/ui/dc-runtime.tsx`; §1 font-face → `styles/fonts.css`; rest obsolete |
| `Main.dc.html` `<x-dc>` markup | `components/flow/**` JSX |
| `Event.dc.html` `<x-dc>` markup | `components/sample/**` JSX |
| `<head>` `<link>`/`<script>` lists | `app/**/layout.tsx` CSS imports (scripts become imports) |
| `href="Event.dc.html"` / `href="Main.dc.html"` | `href="/example"` / `href="/"` as plain `<a>` (full load, as original) |
| `fonts/*.woff2` | `public/fonts/` |
| `vendor/*` | obsolete (npm `react`); archived with the standalone |
| `src/showup-source/**` | `archive/showup-source/**` |
| `archives/*` | `archive/zips/*` |
| `design-reference/screenshots/**` | `docs/design-references/screenshots/**` |
| `design-reference/styles/*` | `archive/design-reference-styles/*` |
| `docs/DESIGN_SYSTEM.md`, `docs/SCREENS.md` | `docs/` |
| `docs/SOURCE_MANIFEST.md`, `docs/BUILD_STAGES.md` | `docs/archive/` |

---

## 8. Open questions (need your call before Phase 2)

**Q1. CSS loading (blocks hard rule 3 as written).** Main's and Event's stylesheets can't both be global (§0.3).
- **Recommended:** the root layout imports only the shared, identical files (`variables`, `reset`, `fonts`). `(flow)/layout.tsx` imports Main's set and `example/layout.tsx` imports `event.css`. Links between the two stay plain `<a>` (full page load, same as today), so the two sets never coexist. No CSS file is edited.
- Alternative: prefix-scope `event.css` under a wrapper class. This edits the CSS, so I don't recommend it.

**Q2. Routes.** The five screens are one state machine sharing in-memory state (§0.4).
- **Recommended:** `/` = the whole flow, exactly as `Main.dc.html`. `/example` = the sample event. `/preview/[startAt]` = the six seeded entry points the canvas boards gave you, which are also handy for demos and screenshots. Screen components go in separate files under `components/flow/screens/`, so the "one folder per screen" structure lives in components rather than routes.
- Alternative: real routes per screen. This needs the flow state lifted into a context/store and is a logic rewrite. It's a candidate for "later, if time allows".

**Q3. Mobile variants.** The `*Mobile.dc.html` boards only differ in `FAMILY='mobile'` and link targets. The layout is the same responsive CSS. **Recommended:** drop them, with `FAMILY` fixed to `'desktop'`. A single family has nothing to mismatch.

**Q4. Source of truth.** **Recommended:** `src/showup-standalone/` (D1 fixed, `#best-label` rule) beats the canvas source and the PNGs. The Phase 3 baseline is fresh Playwright captures of it, served by `python3 -m http.server`. The design-reference PNGs are a secondary check only.

Smaller defaults I'll go with unless you object: Next 15 + React 19 (R7), client-only rendering (R4), dropping the `sc-interp` spans (R5), and keeping `src/showup-standalone/` runnable under `archive/`.
