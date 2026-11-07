// Propose a time, collect I'm in / Can't make it, then confirm. Server-only.
// While a proposal is open, every viewer gets the same body (plus the caller's own vote); nothing says who voted what.
// Closing re-checks each "in" voter's stored conditions against the "in" group only (PRODUCT-RULES §5), using the engine.
import { slotStats, SLOT_STEP, START_COVER } from '../engine';
import type { Db } from './db';
import { pgCode } from './db';
import { newId } from './credentials';
import type { PublicEvent } from './events';
import { loadEngineResponses, slotIdFor } from './responses';
import { todayIn } from './validate';

export const ORGANISER_COUNTS = 1;
export const MAX_MIN_ATTENDEES = 201;

export type ProposalStatus = 'open' | 'confirmed' | 'failed';
export type Vote = 'in' | 'out';

interface ProposalRow {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  deadline: string | null;
  minAttendees: number;
  status: ProposalStatus;
  confirmedCount: number | null;
}

export type Caller = { kind: 'anon' } | { kind: 'organiser' } | { kind: 'guest'; id: string };

export interface ProposalView {
  status: ProposalStatus;
  date: string;
  startMin: number;
  endMin: number;
  deadline: string | null;
  minAttendees: number;
  /** Closed proposals only. Includes the organiser. */
  confirmedCount?: number;
  /** Organiser only: every person who has joined, with their answer or null while pending. Never sent to guests. */
  tally?: { name: string; vote: Vote | null }[];
  /** The caller's own answer; never anyone else's. */
  myVote?: Vote | null;
  /** Closed proposals only: whether the caller is in the confirmed group. */
  myStatus?: 'going' | 'not_going';
}

const SELECT = `SELECT id, to_char(date, 'YYYY-MM-DD') AS date, start_min, end_min, to_char(deadline, 'YYYY-MM-DD') AS deadline,
                       min_attendees, status, confirmed_count FROM proposals`;

type Raw = {
  id: string;
  date: string;
  start_min: number;
  end_min: number;
  deadline: string | null;
  min_attendees: number;
  status: ProposalStatus;
  confirmed_count: number | null;
};
const toRow = (r: Raw): ProposalRow => ({
  id: r.id,
  date: r.date,
  startMin: Number(r.start_min),
  endMin: Number(r.end_min),
  deadline: r.deadline,
  minAttendees: Number(r.min_attendees),
  status: r.status,
  confirmedCount: r.confirmed_count === null ? null : Number(r.confirmed_count),
});

async function latest(db: Db, eventId: string): Promise<ProposalRow | null> {
  const rows = await db.query<Raw>(`${SELECT} WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1`, [eventId]);
  return rows[0] ? toRow(rows[0]) : null;
}

const pastDeadline = (p: ProposalRow, event: PublicEvent, now: Date) => p.deadline !== null && todayIn(event.timezone, now) > p.deadline;

// ---- Create -----------------------------------------------------------------------------------------------------

/** The proposal is a start time; the end is derived from the event's length (one slot step when there is none). */
export interface CreateInput {
  date: unknown;
  startMin: unknown;
  deadline?: unknown;
  minAttendees: unknown;
}
export type CreateResult = { status: 'ok' } | { status: 'invalid'; field: string; message: string } | { status: 'conflict' };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isIso = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export async function createProposal(db: Db, event: PublicEvent, input: CreateInput, now: Date = new Date()): Promise<CreateResult> {
  const bad = (field: string, message: string): CreateResult => ({ status: 'invalid', field, message });
  const day = event.days.find((d) => d.date === input.date);
  if (!day) return bad('date', "That isn't one of this event's days.");
  const { startMin } = input;
  // Same rule as the engine: a fixed length must fit in the day's window; with none, the start just needs room to begin.
  const endMin = isInt(startMin) ? startMin + (event.durationMin ?? SLOT_STEP) : 0;
  const fitsBy = isInt(startMin) ? startMin + (event.durationMin ?? START_COVER) : 0;
  if (!isInt(startMin) || startMin < day.start || fitsBy > day.end || (startMin - day.start) % SLOT_STEP !== 0) {
    return bad('startMin', "That time doesn't fit this event.");
  }
  if (!isInt(input.minAttendees) || input.minAttendees < 2 || input.minAttendees > MAX_MIN_ATTENDEES)
    return bad('minAttendees', 'Choose a minimum of at least 2 people.');
  let deadline: string | null = null;
  if (input.deadline !== undefined && input.deadline !== null && input.deadline !== '') {
    if (!isIso(input.deadline)) return bad('deadline', 'Choose a valid reply-by date.');
    if (input.deadline < todayIn(event.timezone, now) || input.deadline > day.date)
      return bad('deadline', 'Choose a reply-by date between today and the day of the event.');
    deadline = input.deadline;
  }
  try {
    const rows = await db.query(
      `INSERT INTO proposals (id, event_id, date, start_min, end_min, deadline, min_attendees)
       SELECT $1, $2, $3::date, $4, $5, $6::date, $7
        WHERE NOT EXISTS (SELECT 1 FROM proposals WHERE event_id = $2 AND status IN ('open', 'confirmed'))
       RETURNING id`,
      [newId(), event.id, day.date, startMin, endMin, deadline, input.minAttendees],
    );
    return rows.length ? { status: 'ok' } : { status: 'conflict' };
  } catch (err) {
    if (pgCode(err) === '23505') return { status: 'conflict' };
    throw err;
  }
}

// ---- Resolve ----------------------------------------------------------------------------------------------------

/**
 * Confirms only the "in" voters whose own conditions still hold against the "in" group, then compares that group
 * (plus the organiser) with the minimum. One statement, so the status and each voter's result land together, and a
 * second caller finds nothing left to do.
 */
export async function resolveProposal(db: Db, event: PublicEvent, p: ProposalRow): Promise<void> {
  if (p.status !== 'open') return;
  const voters = await db.query<{ participant_id: string }>(
    `SELECT participant_id FROM proposal_votes WHERE proposal_id = $1 AND vote = 'in'`,
    [p.id],
  );
  const inIds = new Set(voters.map((v) => v.participant_id));
  const responses = (await loadEngineResponses(db, event.id)).filter((r) => inIds.has(r.id));
  const stats = slotStats(slotIdFor(p.date), responses, { s: p.startMin, e: p.endMin }, { duration: event.durationMin });
  const going = stats.group;
  const total = going.length + ORGANISER_COUNTS;
  await db.query(
    `WITH closed AS (
       UPDATE proposals SET status = $2, confirmed_count = $3, closed_at = now() WHERE id = $1 AND status = 'open' RETURNING id
     )
     UPDATE proposal_votes SET confirmed = (participant_id = ANY($4::text[])) WHERE proposal_id IN (SELECT id FROM closed)`,
    [p.id, total >= p.minAttendees ? 'confirmed' : 'failed', total, going],
  );
}

export async function closeNow(db: Db, event: PublicEvent): Promise<'ok' | 'none'> {
  const p = await latest(db, event.id);
  if (!p || p.status !== 'open') return 'none';
  await resolveProposal(db, event, p);
  return 'ok';
}

/** Resets the proposed time: removes every proposal for the event (their votes go with them) so the organiser starts over. */
export async function withdrawProposal(db: Db, eventId: string): Promise<void> {
  await db.query('DELETE FROM proposals WHERE event_id = $1', [eventId]);
}

// ---- Vote -------------------------------------------------------------------------------------------------------

export async function castVote(
  db: Db,
  event: PublicEvent,
  participantId: string,
  vote: Vote,
  now: Date = new Date(),
): Promise<'ok' | 'closed'> {
  const p = await latest(db, event.id);
  if (!p || p.status !== 'open') return 'closed';
  if (pastDeadline(p, event, now)) {
    await resolveProposal(db, event, p);
    return 'closed';
  }
  const rows = await db.query(
    `INSERT INTO proposal_votes (proposal_id, participant_id, event_id, vote)
     SELECT p.id, $2, $3, $4 FROM proposals p WHERE p.id = $1 AND p.status = 'open'
     ON CONFLICT (proposal_id, participant_id) DO UPDATE SET vote = EXCLUDED.vote, voted_at = now()
     RETURNING vote`,
    [p.id, participantId, event.id, vote],
  );
  return rows.length ? 'ok' : 'closed';
}

// ---- Read -------------------------------------------------------------------------------------------------------

export async function getProposal(db: Db, event: PublicEvent, caller: Caller, now: Date = new Date()): Promise<ProposalView | null> {
  let p = await latest(db, event.id);
  if (!p) return null;
  if (p.status === 'open' && pastDeadline(p, event, now)) {
    await resolveProposal(db, event, p);
    p = (await latest(db, event.id)) ?? p;
  }
  const view: ProposalView = {
    status: p.status,
    date: p.date,
    startMin: p.startMin,
    endMin: p.endMin,
    deadline: p.deadline,
    minAttendees: p.minAttendees,
  };
  if (p.status !== 'open') view.confirmedCount = p.confirmedCount ?? 0;
  if (caller.kind === 'guest') {
    const [row] = await db.query<{ vote: Vote; confirmed: boolean | null }>(
      'SELECT vote, confirmed FROM proposal_votes WHERE proposal_id = $1 AND participant_id = $2',
      [p.id, caller.id],
    );
    view.myVote = row?.vote ?? null;
    if (p.status !== 'open') view.myStatus = row?.confirmed === true ? 'going' : 'not_going';
  } else if (caller.kind === 'organiser') {
    if (p.status === 'confirmed') view.myStatus = 'going';
    const rows = await db.query<{ name: string; vote: Vote | null }>(
      `SELECT pa.display_name AS name, v.vote FROM participants pa
         LEFT JOIN proposal_votes v ON v.participant_id = pa.id AND v.proposal_id = $1
        WHERE pa.event_id = $2 ORDER BY pa.created_seq`,
      [p.id, event.id],
    );
    view.tally = rows.map((r) => ({ name: r.name, vote: r.vote ?? null }));
  }
  return view;
}
