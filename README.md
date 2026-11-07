# showup.

Group plans that actually happen. The organiser picks candidate days. Everyone marks when they're free, whether they'd actually go, and what it depends on ("if Sam's going and there's at least 5 of us"). showup then shows the time most people would really turn up for.

This is the hackathon frontend, ported from the original HTML prototype to **Next.js 16 (App Router) + TypeScript**. Events and their share links are stored in Neon Postgres; responses, conditions and the Anthropic API are not built yet. A tested coordination engine exists, but the UI still uses its characterised legacy recommendation policy until the ranking and backend contracts are agreed.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint         # TypeScript check
npm run build        # production build
npm run start        # serve the production build
npm run smoke        # after a build: loads every route in Chromium, fails on any console error
npm run test:wheel   # after a build: cross-midnight Create/Respond flow at 390px and 1440px
```

Requires Node 20.9+. Browser tests need Playwright's Chromium once: `npx playwright install chromium`.

### Database

Copy `.env.example` to `.env.local` (gitignored) and set `DATABASE_URL` to the Neon connection string. Then:

```bash
npm run db:setup     # creates missing tables and indexes; safe to re-run, never drops or alters data
npm run test:server  # strict typecheck + server tests against an in-memory Postgres (PGlite), not Neon
```

`db:setup` stops without changing anything if an existing table doesn't match the expected schema. Local, Preview and Production currently share one database.

| API route              |                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /api/health`      | `{"ok":true}` (200) if `SELECT 1` succeeds, else `{"ok":false}` (503)                                     |
| `POST /api/events`     | Creates an event and its days. 201 `{id, guestPath, organiserPath}`; 400 `{error:{code, message, field}}` |
| `GET /api/events/{id}` | The public event (title, organiser name, duration, timezone, days); 404 if unknown                        |

| Route                                                                      | What it is                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                                                        | The whole flow: Landing → Create → Respond → Event, plus Join, the conditions sheet and the propose sheet. It's one state machine, so screens change without changing the URL. |
| `/example`                                                                 | Sample event page with fixed, fictional responses ("See an example")                                                                                                           |
| `/preview/create` · `respond` · `fresh` · `join` · `guest` · `participant` | The flow opened at a seeded start screen (the old canvas boards). Unknown values return 404.                                                                                   |
| `/e/{id}`                                                                  | Guest link for a stored event                                                                                                                                                  |
| `/e/{id}/admin?k={token}`                                                  | Organiser link; 404 unless the token matches. Sent with `Referrer-Policy: no-referrer`                                                                                         |

Links between `/` and `/example` are deliberately plain `<a href>`, not `next/link`. The two pages' CSS defines some of the same selectors differently, and a full page load keeps them apart (see `app/(flow)/layout.tsx`).

## Folder structure

```
app/
  layout.tsx                 <html>, fonts, shared CSS (variables, reset, fonts)
  (flow)/layout.tsx          the flow's CSS
  (flow)/page.tsx            /
  (flow)/preview/[startAt]/  /preview/<startAt>
  example/                   /example (+ its own CSS)
  (flow)/e/[eventId]/        /e/<id> (guest) and /e/<id>/admin (organiser)
  api/                       health, events
components/
  flow/                      FlowClient (client-only entry; props: startAt, event, initialState), FlowView
  flow/screens/              Landing, Create, Join, Respond, EventPage
  flow/sheets/               ConditionsSheet, ProposeSheet
  sample/                    the /example page and its propose sheet
  shared/                    DotRows, ReminderPanel, ProposalNotice, TimeWheels
lib/
  ui/dc-runtime.tsx          the component runtime the logic was written for (see the note in the file)
  ui/flow/, ui/sample/       page logic: one mixin per screen or feature, plus main.ts (the page class)
  ui/utils/                  helpers, formatting, dates, recommend (the current "engine"), conditions parser
  ui/services/storage.ts     localStorage persistence (the seam for the backend)
  ui/data/, ui/config.ts     constants, fixtures, storage keys
  engine/                    tested coordination engine (not yet wired to the UI)
  server/                    server-only: Neon access, schema setup, validation, credentials, event storage
  supabase/                  PLACEHOLDER: Supabase client
styles/                      the original CSS, unchanged
public/fonts/                Manrope (offline fallback for Google Fonts)
scripts/                     smoke.mjs, visual-diff.mjs
docs/                        DESIGN_SYSTEM.md, SCREENS.md, BACKEND_REQUIREMENTS.md, design-references/, archive/
archive/                     the original prototype (runnable) and handoff files; not part of the app
docs/archive/MIGRATION_AUDIT.md  how the old code was audited and mapped to this structure
```

## Done vs placeholder

**Done (ported, matches the original):** every screen and sheet, the Your-events list, the sample event page, View Transitions, reduced motion, clipboard copy, and the return trip from the sample page.

**Still simulated in the frontend.** The backend will replace these. `docs/BACKEND_REQUIREMENTS.md` lists what has to be decided first.

| Simulated                                                                   | Where                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Responses (and prototype events) are stored in `localStorage` on one device | `lib/ui/services/storage.ts`                                                          |
| Condition "AI" is a regex parser                                            | `lib/ui/utils/conditions-parser.ts`                                                   |
| Best-time calculation                                                       | `lib/ui/utils/recommend.ts`                                                           |
| Fake 700 ms save; fixed invite link and QR code on prototype events         | `lib/ui/flow/respond.ts`, `lib/ui/config.ts`, `components/flow/screens/EventPage.tsx` |
| Demo fixtures (Alex, Jess, the 8-person sample)                             | `lib/ui/data/fixtures.ts`, `lib/ui/sample/constants.ts`                               |
| Recommendation UI still uses the characterised legacy ranking policy        | `lib/ui/utils/recommend.ts`                                                           |

**Empty placeholders:** `lib/supabase/`.

## Working on the code

- Most ported logic (`lib/ui/**`) remains mechanically split from the original JavaScript and is marked `// @ts-nocheck`. The supplied wheel picker and its cross-midnight adapters are typed additions.
- **Don't swap `lib/ui/dc-runtime.tsx` for plain React state.** Its `setState` updates `this.state` immediately, and the logic depends on that. The file explains why.
- To check you haven't changed anything visible, run `npm run build && npm run start`, then `npm run visual -- all`. This captures the original (`archive/showup-standalone`) and the port at 1440px and 390px and pixel-diffs them into `.visual/`. Use `ONLY=<regex>` to run a subset.
