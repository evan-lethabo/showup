# showup.

Group plans that actually happen. Tools like When2meet only ask when people are _free_, so a time can look perfect and still collapse, because half of those people really mean "I'll come if Sam does". showup asks when you're free, whether you'd actually go, and what it depends on, then shows the time most people would really turn up for.

## How it works

**Organiser**

1. Pick the candidate days, the time window, the event length and a title, then create the event.
2. You get two links: a **guest link** to share (`/e/<id>`) and a private **organiser link** (`/e/<id>/admin?k=<token>`). Keep the organiser link to yourself, because anyone holding it can edit or cancel the event.
3. Watch responses come in. The page shows the best time so far, who has replied, and how many are coming or maybe.
4. When one time stands out, propose it. Guests vote "I'm in" or "Can't make it", and you close the poll to confirm.

**Guest**

1. Open the guest link and enter your name. Your browser keeps a private credential for that event.
2. For each day, mark when you're free and pick Yes, If… or No. For If…, type what it depends on in your own words ("if Sam's going and there's at least 5 of us").
3. showup reads that back to you ("Needs Sam, and at least 5 people") and you confirm before it is saved. You can edit or leave later.

## Privacy

Everyone with the guest link sees **counts and names only**: who has joined and replied, and how many people are free or coming for each time. They never see anyone's answers.

Conditions stay private. Only the person who wrote a condition can read it back. The organiser and other guests never see it. The engine's elimination trace (who dropped out because of whose absence) stays on the server and is never returned by any API. Raw condition text is sent to the AI model to be interpreted. It is not logged, and only the condition the guest confirms is saved.

Small groups can still hint at individuals through counts. The rules are in [docs/PRODUCT-RULES.md](docs/PRODUCT-RULES.md) §7.

## The coordination engine, in plain English

For each time slot on each day, the engine works out who would really go together:

1. Start with everyone who is free for the whole slot and answered Yes or If….
2. Remove anyone whose condition fails ("if Priya comes" fails if Priya isn't in the group, "at least 4 of us" fails if fewer than 4 remain). Repeat until nobody else drops out.
3. Whoever is left is the group that will come.

This works because positive conditions can only be satisfied by _more_ people, so there is exactly one largest group where everyone's conditions hold. Conditions the engine can't safely check, including anything negative ("only if Sam _isn't_ going") or outside the group ("if it's sunny"), are never counted as a yes. Those people show up as **maybe**.

Slots are then ranked: the largest group first, then the most maybes, then the most favourite times, then the earliest. Details and the reasoning are in [docs/ENGINE.md](docs/ENGINE.md).

## Tech stack

- **Next.js 16** (App Router) and **React 19**, written in **TypeScript**
- **Neon** serverless Postgres (`@neondatabase/serverless`)
- **OpenAI** Responses API to interpret conditions, with an offline fallback parser
- **Vitest** for tests, with PGlite (in-memory Postgres) for the server tests, and **Playwright** for browser checks
- Hosted on **Vercel**, with Vercel Web Analytics

## Folder map

```
app/                  routes: pages (/, /example, /preview/*, /e/<id>, /e/<id>/admin) and API routes under api/
components/
  flow/               the main flow: screens (Landing, Create, Join, Respond, EventPage) and sheets
  sample/             the /example page
  shared/             pieces used by both
lib/
  engine/             the coordination engine: pure TypeScript, no I/O, heavily tested
  conditions/         turns a guest's typed condition into structured conditions (OpenAI + offline fallback)
  server/             server-only code: database, schema, events, responses, results, proposals, route handlers
  ui/                 page logic and helpers for the screens, plus dc-runtime.tsx (see "Working on the code")
styles/               CSS
public/fonts/         Manrope (offline fallback for Google Fonts)
scripts/              db-setup, smoke test, visual diff, benchmarks
docs/                 PRODUCT-RULES, ENGINE, BACKEND_REQUIREMENTS, DESIGN_SYSTEM, SCREENS, and archive/
archive/              the original prototype, used only as the baseline for `npm run visual`
```

## Run it locally

Requires Node 20.9 or newer and a Neon database.

```bash
npm install
cp .env.example .env.local      # then fill in DATABASE_URL (and OPENAI_API_KEY if you have one)
npm run db:setup                # creates the tables; safe to re-run, never drops or alters data
npm run dev                     # http://localhost:3000
```

`db:setup` stops without changing anything if an existing table doesn't match the expected schema. Local, Preview and Production may share one database, so check which `DATABASE_URL` you are using before running anything that writes.

## Tests

```bash
npm run lint           # TypeScript check (tsc --noEmit)
npm test               # all unit tests
npm run test:engine    # engine only (strict typecheck, then tests)
npm run test:server    # server only, against in-memory Postgres
npm run build && npm run smoke   # loads every route in Chromium and fails on any console error
npm run test:wheel     # after a build: cross-midnight Create/Respond flow
npm run visual -- all  # after a build: pixel-diffs the app against the original prototype
npm run format:check   # Prettier
```

Browser tests need Chromium once: `npx playwright install chromium`. The server tests run a Postgres in memory and can time out when the whole suite runs in parallel on a slow machine. Run `npm run test:server` on its own if that happens.

## Deploy

1. Create a **Neon** project and copy its pooled connection string.
2. Import the repo into **Vercel**.
3. Under Project → Settings → Environment Variables, set `DATABASE_URL`, and optionally `OPENAI_API_KEY` and `OPENAI_INTERPRETER_MODEL`, for Production (and Preview if you want it).
4. From your machine, run `npm run db:setup` once with `DATABASE_URL` pointing at that database. The app does not create tables itself.
5. Deploy. Check `GET /api/health`, which returns `{"ok":true}` when the database is reachable.
6. To see visitor numbers, turn on Web Analytics for the project in Vercel.

## Working on the code

- **Don't swap `lib/ui/dc-runtime.tsx` for plain React state.** Its `setState` updates `this.state` immediately, and the screen logic depends on that. The file explains why.
- Most of `lib/ui/**` is the original prototype logic, split mechanically and marked `// @ts-nocheck`. Prefer small, careful changes there.
- Links between `/` and `/example` are plain `<a href>` on purpose. The two pages' CSS defines some of the same selectors differently, and a full page load keeps them apart (see `app/(flow)/layout.tsx`).
- The `/preview/*` routes and the local-only events in the browser are prototype features that don't use the server.
- Server code never returns conditions or the elimination trace to clients. Keep it that way when adding endpoints (see `lib/server/results.ts`).

## Contributing

1. Branch from `main` and keep changes small and focused.
2. Run `npm run format`, `npm run lint`, `npm test` and `npm run build` before opening a PR.
3. Don't commit `.env.local` or any real keys. Add new environment variables to `.env.example` with a one-line explanation.
4. If you change engine behaviour, update `docs/PRODUCT-RULES.md` and `docs/ENGINE.md` and add a test.
