-- SHOWUP usage metrics. Read-only: one SELECT inside a READ ONLY transaction that is rolled back.
-- Returns counts and dates only. Never selects titles, names, condition payloads/readbacks, tokens or IDs.
--
--   psql "$DATABASE_URL" -f scripts/metrics.sql      (or paste into the Neon SQL editor)
--
-- Scope: events whose created_at is on or after the cutoff. Everything else (guests, conditions, proposals)
-- is counted only for those events. The cutoff is a date at 00:00 in the session time zone (UTC on Neon).
--
-- Definitions (from lib/server/schema.ts and the app code):
--   responding guest  a participants row with at least one day_willingness row. Same rule the app uses for
--                     "responded" (lib/server/events.ts). The organiser is not a participant and isn't counted.
--   response          one responding guest on one event.
--   finalised         proposals.status = 'confirmed' (the minimum was met). 'failed' = closed without enough people.
--
-- Caveats: this is current state, not history. Deleted participants and events (ON DELETE CASCADE) are gone, and an
-- organiser editing an event's days or length clears guests' answers, so those guests stop counting as responders.
--
-- Not answerable from this schema: "finalised proposals whose slot wasn't the one with the most free people".
-- See docs/metrics.md for what would need to be logged.

BEGIN TRANSACTION READ ONLY;

WITH params AS (
  SELECT DATE '2026-01-01' AS cutoff                      -- <<< set the cutoff here
),
ev AS (
  SELECT e.id, e.created_at
    FROM events e, params
   WHERE e.created_at >= params.cutoff
),
responders AS (
  SELECT p.event_id, count(*) AS n
    FROM participants p
    JOIN ev ON ev.id = p.event_id
   WHERE EXISTS (SELECT 1 FROM day_willingness w WHERE w.participant_id = p.id)
   GROUP BY p.event_id
),
with_conditions AS (
  SELECT DISTINCT c.event_id FROM conditions c JOIN ev ON ev.id = c.event_id
),
props AS (
  SELECT pr.status FROM proposals pr JOIN ev ON ev.id = pr.event_id
),
days AS (
  SELECT d.date FROM event_days d JOIN ev ON ev.id = d.event_id
)
SELECT
  (SELECT cutoff FROM params)                                                        AS cutoff,
  (SELECT count(*) FROM ev)                                                          AS events_created,
  (SELECT count(*) FROM responders WHERE n >= 2)                                     AS events_with_2plus_responding_guests,
  (SELECT coalesce(sum(n), 0) FROM responders)                                       AS total_responses,
  round((SELECT coalesce(sum(n), 0) FROM responders)::numeric
        / nullif((SELECT count(*) FROM ev), 0), 2)                                   AS avg_responses_per_event,
  round((SELECT coalesce(sum(n), 0) FROM responders)::numeric
        / nullif((SELECT count(*) FROM responders), 0), 2)                           AS avg_responses_per_event_with_any,
  (SELECT count(*) FROM with_conditions)                                             AS events_with_a_condition,
  round(100.0 * (SELECT count(*) FROM with_conditions)
        / nullif((SELECT count(*) FROM ev), 0), 1)                                   AS pct_events_with_a_condition,
  (SELECT count(*) FROM props)                                                       AS proposals_created,
  (SELECT count(*) FROM props WHERE status = 'confirmed')                            AS proposals_finalised,
  (SELECT count(*) FROM props WHERE status = 'failed')                               AS proposals_failed,
  (SELECT count(*) FROM props WHERE status = 'open')                                 AS proposals_still_open,
  (SELECT min(created_at)::date FROM ev)                                             AS first_event_created_on,
  (SELECT max(created_at)::date FROM ev)                                             AS latest_event_created_on,
  (SELECT min(date) FROM days)                                                       AS earliest_scheduled_day,
  (SELECT max(date) FROM days)                                                       AS latest_scheduled_day;

ROLLBACK;
