// Route handler logic, kept free of Next.js so it can be tested against an isolated database.
import { isUnavailable, logDbError, pgCode, type Db } from './db';
import { authoriseOrganiser, createEvent, deleteEvent, updateEvent, getPublicEvent, guestPath, organiserPath } from './events';
import { authenticateGuest, eventPeople, joinEvent, leaveEvent, loadOwnResponse, saveResponse } from './responses';
import { interpretCondition, MAX_TEXT_CHARS, type InterpretationContext, type ModelTransport } from '../conditions/interpreter';
import { castVote, closeNow, createProposal, getProposal, withdrawProposal, type Caller } from './proposals';
import { computeResults } from './results';
import { validateCreateEvent } from './validate';

export const MAX_BODY_BYTES = 16_384;
const NO_STORE = { 'Cache-Control': 'no-store' };

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function error(status: number, code: string, message: string, field?: string): Response {
  return json(status, { error: field ? { code, message, field } : { code, message } });
}

function failure(context: string, err: unknown): Response {
  logDbError(context, err);
  return isUnavailable(err)
    ? error(503, 'unavailable', "We couldn't reach the database. Try again in a moment.")
    : error(500, 'server_error', 'Something went wrong on our side. Try again in a moment.');
}

export async function checkHealth(getDb: () => Db): Promise<Response> {
  try {
    const rows = await getDb().query<{ ok: number }>('SELECT 1 AS ok');
    if (Number(rows[0]?.ok) === 1) return json(200, { ok: true });
    return json(503, { ok: false });
  } catch (err) {
    logDbError('health', err);
    return json(503, { ok: false });
  }
}

export async function handleCreateEvent(req: Request, getDb: () => Db, now: Date = new Date()): Promise<Response> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return error(415, 'unsupported_media_type', 'Send the event as JSON.');
  }
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return error(413, 'too_large', 'That request is too large.');
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return error(413, 'too_large', 'That request is too large.');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, 'invalid_json', 'Send the event as valid JSON.');
  }
  const v = validateCreateEvent(body, now);
  if ('error' in v) return error(400, 'invalid_input', v.error.message, v.error.field);
  try {
    const { id, token } = await createEvent(getDb(), v.value);
    return json(201, { id, guestPath: guestPath(id), organiserPath: organiserPath(id, token) });
  } catch (err) {
    return failure('create-event', err);
  }
}

export async function handleGetEvent(id: string, getDb: () => Db): Promise<Response> {
  try {
    const event = await getPublicEvent(getDb(), id);
    return event ? json(200, event) : error(404, 'not_found', "We couldn't find that event.");
  } catch (err) {
    return failure('get-event', err);
  }
}

function guestCredential(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const c = auth.slice(7).trim();
    return c || null;
  }
  return null;
}

async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return { ok: false, res: error(415, 'unsupported_media_type', 'Send JSON.') };
  }
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return { ok: false, res: error(413, 'too_large', 'That request is too large.') };
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return { ok: false, res: error(413, 'too_large', 'That request is too large.') };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, res: error(400, 'invalid_json', 'Send valid JSON.') };
  }
}

export async function handleJoinEvent(eventId: string, req: Request, getDb: () => Db): Promise<Response> {
  const parsed = await readJson(req);
  if ('res' in parsed) return parsed.res;
  const body = parsed.body as { name?: unknown };
  try {
    const result = await joinEvent(getDb(), eventId, body.name);
    switch (result.status) {
      case 'ok':
        return json(201, { participantId: result.participant.id, name: result.participant.name, credential: result.credential });
      case 'invalid':
        return error(400, 'invalid_input', result.error.message, result.error.field);
      case 'name_taken':
        return error(409, 'name_taken', "That name's taken. Try adding an initial.");
      case 'full':
        return error(503, 'full', 'This event has reached its participant limit.');
      case 'not_found':
        return error(404, 'not_found', "We couldn't find that event.");
    }
  } catch (err) {
    return failure('join-event', err);
  }
}

export async function handleGetOwnResponse(eventId: string, req: Request, getDb: () => Db): Promise<Response> {
  const cred = guestCredential(req);
  if (!cred) return error(401, 'unauthorised', 'Sign in with your guest link first.');
  try {
    const auth = await authenticateGuest(getDb(), eventId, cred);
    if (auth.status !== 'ok') return error(401, 'unauthorised', 'Your guest access is not valid.');
    const response = await loadOwnResponse(getDb(), eventId, auth.participant);
    return json(200, response);
  } catch (err) {
    return failure('get-response', err);
  }
}

/**
 * Public aggregates for anyone with the event link (names and whether each person has responded, never answers). A credential that is
 * neither this event's organiser token nor one of its guests is refused rather than downgraded.
 */
export async function handleGetResults(eventId: string, req: Request, getDb: () => Db): Promise<Response> {
  const header = req.headers.get('authorization');
  const cred = guestCredential(req);
  try {
    const db = getDb();
    const access = await authoriseOrganiser(db, eventId, cred);
    if (access.status === 'not_found') return json(404, { error: 'not_found' });
    if (header !== null && access.status !== 'ok') {
      if (!cred || (await authenticateGuest(db, eventId, cred)).status !== 'ok') return json(403, { error: 'forbidden' });
    }
    const event = access.status === 'ok' ? access.event : await getPublicEvent(db, eventId);
    if (!event) return json(404, { error: 'not_found' });
    const body = await computeResults(db, event);
    return json(200, body);
  } catch (err) {
    return failure('get-results', err);
  }
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Interprets a guest's condition text for one day. Never persists anything; the guest confirms the result and saves
 * it through PUT /response. Event context comes from the database, never the client. Text is never logged.
 */
export async function handleInterpret(eventId: string, req: Request, getDb: () => Db, getTransport: () => ModelTransport | null): Promise<Response> {
  const cred = guestCredential(req);
  if (!cred) return error(401, 'unauthorised', 'Sign in with your guest link first.');
  const parsed = await readJson(req);
  if ('res' in parsed) return parsed.res;
  const body = parsed.body as { date?: unknown; text?: unknown };
  if (typeof body.text !== 'string' || !body.text.trim()) return error(400, 'invalid_input', 'Enter what it depends on, then check it.', 'text');
  if ([...body.text].length > MAX_TEXT_CHARS) return error(400, 'invalid_input', `Keep it under ${MAX_TEXT_CHARS} characters.`, 'text');
  if (typeof body.date !== 'string') return error(400, 'invalid_input', "That day isn't one of this event's days.", 'date');
  let ctx: InterpretationContext;
  try {
    const db = getDb();
    const auth = await authenticateGuest(db, eventId, cred);
    if (auth.status !== 'ok') return error(401, 'unauthorised', 'Your guest access is not valid.');
    const [event, people] = await Promise.all([getPublicEvent(db, eventId), eventPeople(db, eventId)]);
    const day = event?.days.find((d) => d.date === body.date);
    if (!event || !day) return error(400, 'invalid_input', "That day isn't one of this event's days.", 'date');
    const me = auth.participant;
    ctx = {
      day: { date: day.date, weekday: WEEKDAYS[new Date(`${day.date}T00:00:00Z`).getUTCDay()]!, window_start: hhmm(day.start), window_end: hhmm(day.end), duration_minutes: event.durationMin ?? 0 },
      self_name: me.displayName,
      self_id: me.id,
      roster: people.filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.displayName })),
      text: body.text,
    };
  } catch (err) {
    return failure('interpret', err);
  }
  const { failure: why, ...result } = await interpretCondition(ctx, getTransport());
  if (why && why !== 'no_key') console.warn(`interpret: fell back (${why})`);
  return json(200, result);
}

export async function handleSaveResponse(eventId: string, req: Request, getDb: () => Db): Promise<Response> {
  const cred = guestCredential(req);
  if (!cred) return error(401, 'unauthorised', 'Sign in with your guest link first.');
  const parsed = await readJson(req);
  if ('res' in parsed) return parsed.res;
  try {
    const auth = await authenticateGuest(getDb(), eventId, cred);
    if (auth.status !== 'ok') return error(401, 'unauthorised', 'Your guest access is not valid.');
    const result = await saveResponse(getDb(), eventId, auth.participant, parsed.body);
    if (result.status === 'invalid') return error(400, 'invalid_input', result.error.message, result.error.field);
    return json(200, result.response);
  } catch (err) {
    // The guest left (or the event was cancelled) while this save was in flight.
    if (pgCode(err) === '23503') return error(401, 'unauthorised', 'Your guest access is not valid.');
    return failure('save-response', err);
  }
}

/** Organiser-only: changes the title, organiser name, length or days. Schedule changes clear everyone's answers (see updateEvent). */
export async function handleUpdateEvent(eventId: string, req: Request, getDb: () => Db, now: Date = new Date()): Promise<Response> {
  const cred = guestCredential(req);
  const parsed = await readJson(req);
  if ('res' in parsed) return parsed.res;
  try {
    const db = getDb();
    const access = await authoriseOrganiser(db, eventId, cred);
    if (access.status === 'not_found') return error(404, 'not_found', "We couldn't find that event.");
    if (access.status === 'forbidden') return error(403, 'forbidden', 'Only the organiser can edit this event.');
    const v = validateCreateEvent(parsed.body, now, { timezone: access.event.timezone, keepDates: new Set(access.event.days.map((d) => d.date)) });
    if ('error' in v) return error(400, 'invalid_input', v.error.message, v.error.field);
    const { scheduleChanged } = await updateEvent(db, access.event, v.value);
    return json(200, { ok: true, scheduleChanged });
  } catch (err) {
    return failure('update-event', err);
  }
}

/** Organiser-only: cancels the event for everyone. */
export async function handleDeleteEvent(eventId: string, req: Request, getDb: () => Db): Promise<Response> {
  const cred = guestCredential(req);
  try {
    const db = getDb();
    const access = await authoriseOrganiser(db, eventId, cred);
    if (access.status === 'not_found') return error(404, 'not_found', "We couldn't find that event.");
    if (access.status === 'forbidden') return error(403, 'forbidden', 'Only the organiser can cancel this event.');
    await deleteEvent(db, eventId);
    return json(200, { ok: true });
  } catch (err) {
    return failure('delete-event', err);
  }
}

/** Guest-only: removes the caller and their availability from the event. */
export async function handleLeaveEvent(eventId: string, req: Request, getDb: () => Db): Promise<Response> {
  const cred = guestCredential(req);
  if (!cred) return error(401, 'unauthorised', 'Sign in with your guest link first.');
  try {
    const db = getDb();
    const auth = await authenticateGuest(db, eventId, cred);
    if (auth.status !== 'ok') return error(401, 'unauthorised', 'Your guest access is not valid.');
    await leaveEvent(db, eventId, auth.participant.id);
    return json(200, { ok: true });
  } catch (err) {
    return failure('leave-event', err);
  }
}

// ---- Propose a time, vote, confirm ------------------------------------------------------------------------------

/** Same body for everyone; a guest also gets their own vote. A credential that is neither organiser nor guest is refused. */
export async function handleGetProposal(eventId: string, req: Request, getDb: () => Db, now: Date = new Date()): Promise<Response> {
  const cred = guestCredential(req);
  try {
    const db = getDb();
    const event = await getPublicEvent(db, eventId);
    if (!event) return error(404, 'not_found', "We couldn't find that event.");
    let caller: Caller = { kind: 'anon' };
    if (req.headers.get('authorization') !== null) {
      if ((await authoriseOrganiser(db, eventId, cred)).status === 'ok') caller = { kind: 'organiser' };
      else {
        const g = cred ? await authenticateGuest(db, eventId, cred) : null;
        if (!g || g.status !== 'ok') return error(403, 'forbidden', 'Your access is not valid.');
        caller = { kind: 'guest', id: g.participant.id };
      }
    }
    return json(200, { proposal: await getProposal(db, event, caller, now) });
  } catch (err) {
    return failure('get-proposal', err);
  }
}

export async function handleCreateProposal(eventId: string, req: Request, getDb: () => Db, now: Date = new Date()): Promise<Response> {
  const parsed = await readJson(req);
  if ('res' in parsed) return parsed.res;
  try {
    const db = getDb();
    const access = await authoriseOrganiser(db, eventId, guestCredential(req));
    if (access.status === 'not_found') return error(404, 'not_found', "We couldn't find that event.");
    if (access.status === 'forbidden') return error(403, 'forbidden', 'Only the organiser can propose a time.');
    const b = (parsed.body ?? {}) as Record<string, unknown>;
    const result = await createProposal(db, access.event, { date: b.date, startMin: b.startMin, deadline: b.deadline, minAttendees: b.minAttendees }, now);
    if (result.status === 'invalid') return error(400, 'invalid_input', result.message, result.field);
    if (result.status === 'conflict') return error(409, 'proposal_exists', 'A time is already proposed or confirmed for this event.');
    return json(201, { proposal: await getProposal(db, access.event, { kind: 'organiser' }, now) });
  } catch (err) {
    return failure('create-proposal', err);
  }
}

export async function handleCloseProposal(eventId: string, req: Request, getDb: () => Db, now: Date = new Date()): Promise<Response> {
  try {
    const db = getDb();
    const access = await authoriseOrganiser(db, eventId, guestCredential(req));
    if (access.status === 'not_found') return error(404, 'not_found', "We couldn't find that event.");
    if (access.status === 'forbidden') return error(403, 'forbidden', 'Only the organiser can close the poll.');
    if ((await closeNow(db, access.event)) === 'none') return error(409, 'no_open_proposal', 'There is no open poll to close.');
    return json(200, { proposal: await getProposal(db, access.event, { kind: 'organiser' }, now) });
  } catch (err) {
    return failure('close-proposal', err);
  }
}

/** Organiser-only: cancels the proposed time (open or confirmed) and clears its answers. */
export async function handleWithdrawProposal(eventId: string, req: Request, getDb: () => Db): Promise<Response> {
  try {
    const db = getDb();
    const access = await authoriseOrganiser(db, eventId, guestCredential(req));
    if (access.status === 'not_found') return error(404, 'not_found', "We couldn't find that event.");
    if (access.status === 'forbidden') return error(403, 'forbidden', 'Only the organiser can cancel the proposed time.');
    await withdrawProposal(db, eventId);
    return json(200, { proposal: null });
  } catch (err) {
    return failure('withdraw-proposal', err);
  }
}

export async function handleVote(eventId: string, req: Request, getDb: () => Db, now: Date = new Date()): Promise<Response> {
  const cred = guestCredential(req);
  if (!cred) return error(401, 'unauthorised', 'Sign in with your guest link first.');
  const parsed = await readJson(req);
  if ('res' in parsed) return parsed.res;
  const vote = (parsed.body as { vote?: unknown } | null)?.vote;
  if (vote !== 'in' && vote !== 'out') return error(400, 'invalid_input', 'Choose "I\'m in" or "Can\'t make it".', 'vote');
  try {
    const db = getDb();
    const auth = await authenticateGuest(db, eventId, cred);
    if (auth.status !== 'ok') return error(401, 'unauthorised', 'Your guest access is not valid.');
    const event = await getPublicEvent(db, eventId);
    if (!event) return error(404, 'not_found', "We couldn't find that event.");
    if ((await castVote(db, event, auth.participant.id, vote, now)) === 'closed') return error(409, 'poll_closed', 'This poll has closed.');
    return json(200, { proposal: await getProposal(db, event, { kind: 'guest', id: auth.participant.id }, now) });
  } catch (err) {
    if (pgCode(err) === '23503') return error(401, 'unauthorised', 'Your guest access is not valid.');
    return failure('vote', err);
  }
}
