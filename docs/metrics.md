# Metrics

How to measure SHOWUP's usage and engineering numbers. This file explains how to get the numbers and doesn't store
any results. Keep results, and anything about production, out of the repo.

## Usage: `scripts/metrics.sql`

A single read-only query (`BEGIN TRANSACTION READ ONLY … ROLLBACK`) that returns only counts and dates. It never
selects titles, names, condition text, tokens or IDs. Set the cutoff on the `params` line at the top, then run:

```sh
psql "$DATABASE_URL" -f scripts/metrics.sql    # or paste it into the Neon SQL editor
```

The query covers events created on or after the cutoff. It reports:

- events created
- events with 2+ responding guests
- total and average responses
- events with at least one condition (count and %)
- proposals created, finalised, failed and still open
- the dates of the first and latest events

Definitions:

- **Responding guest:** a participant with at least one `day_willingness` row. This is the same rule the app uses
  for "responded". The organiser isn't a participant, so they're never counted.
- **Finalised:** `proposals.status = 'confirmed'`.
- **Current data only:** deleted participants are gone (`ON DELETE CASCADE`), and editing an event's days or length
  clears guests' answers.

Database dates come back as dates in UTC. Some JS drivers convert them to local midnight, so read the day carefully.

## Not yet measurable: "finalised proposals that didn't pick the slot with the most free people"

`proposals` stores only the slot that was chosen. Recomputing what was on offer at the time from current data would be
a guess, because answers, days and participants can all change after a proposal is made. To measure it, record a
snapshot when the proposal is created (on `proposals` or in a `proposal_snapshots` table, with no names):

| Column                        | Meaning                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `best_date`, `best_start_min` | the slot `rankSlots` ranked first                                                                          |
| `best_free`                   | how many people were free for that slot                                                                    |
| `max_free`                    | the highest raw free count across all slots (this can differ from the engine's pick once conditions apply) |
| `chosen_free`                 | how many people were free for the chosen slot                                                              |
| `chosen_rank`                 | where the chosen slot sat in the engine's ranking (1 = top)                                                |

Then count `count(*) FILTER (WHERE status = 'confirmed' AND chosen_free < max_free)`, and the same with
`chosen_rank > 1`.

## Engineering

| Measure              | Command                                                  | Notes                                                                                                                                |
| -------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Tests                | `npm test`                                               | Read the `Tests  N passed` line.                                                                                                     |
| Engine speed         | `npm run bench:engine`                                   | 10,000 synthetic events. Record mean, p50, p95 and p99 along with the machine and Node version.                                      |
| Interpreter accuracy | `npx tsx scripts/eval-interpreter.ts`                    | Needs `OPENAI_API_KEY` in `.env.local`. Makes 27 live calls (17 cases plus 10 repeats). The last line is `N/17 cases, M/10 repeats`. |
| TypeScript lines     | see below                                                | Leaves out `archive/`, `node_modules/` and the generated `next-env.d.ts`.                                                            |
| Commits / PRs        | `git rev-list --count HEAD`; `gh pr list --state merged` | Without `gh`, count merge commits: `git log --merges --grep='Merge pull request' --oneline \| wc -l`.                                |

```sh
git ls-files '*.ts' '*.tsx' ':!archive/**' ':!next-env.d.ts' | tr '\n' '\0' | xargs -0 cat | wc -l
```
