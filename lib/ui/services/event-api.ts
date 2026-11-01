// Client calls to stored-event APIs. Credentials stay in guest-credential.ts, never in URLs.

export async function joinStoredEvent(eventId: string, name: string): Promise<{ ok: true; participantId: string; name: string; credential: string } | { ok: false; status: number; message: string; field?: string }> {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const j = await res.json().catch(() => null);
  if (res.ok && j && j.credential) return { ok: true, participantId: j.participantId, name: j.name, credential: j.credential };
  const err = j && j.error;
  return { ok: false, status: res.status, message: (err && err.message) || "We couldn't join this event.", field: err && err.field };
}

export async function fetchOwnResponse(eventId: string, credential: string): Promise<{ ok: true; body: unknown } | { ok: false; status: number }> {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/response`, {
    headers: { Authorization: `Bearer ${credential}` },
  });
  if (res.status === 401) return { ok: false, status: 401 };
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, body: await res.json() };
}

/** Live aggregates. Guests and viewers send no credential; only the organiser page sends its token, as a header. */
export async function fetchResults(eventId: string, organiserToken?: string | null): Promise<{ ok: true; body: unknown } | { ok: false; status: number }> {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/results`, {
    headers: organiserToken ? { Authorization: `Bearer ${organiserToken}` } : {},
    cache: 'no-store',
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, body: await res.json() };
}

export async function interpretConditionText(eventId: string, credential: string, date: string, text: string): Promise<{ ok: true; body: any } | { ok: false; status: number; message?: string }> {
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential}` },
      body: JSON.stringify({ date, text }),
      cache: 'no-store',
    });
    const j = await res.json().catch(() => null);
    if (res.ok && j && Array.isArray(j.conditions)) return { ok: true, body: j };
    return { ok: false, status: res.status, message: j && j.error && j.error.message };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function saveOwnResponse(eventId: string, credential: string, body: unknown): Promise<{ ok: true; body: unknown } | { ok: false; message: string; field?: string }> {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/response`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential}` },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (res.ok) return { ok: true, body: j };
  const err = j && j.error;
  return { ok: false, message: (err && err.message) || "We couldn't save your response.", field: err && err.field };
}

type DeleteResult = { ok: true } | { ok: false; status: number; message: string };

async function deleteWithBearer(url: string, token: string, fallback: string): Promise<DeleteResult> {
  try {
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (res.ok) return { ok: true };
    const j = await res.json().catch(() => null);
    return { ok: false, status: res.status, message: (j && j.error && j.error.message) || fallback };
  } catch {
    return { ok: false, status: 0, message: fallback };
  }
}

/** Organiser cancels the event for everyone. */
export function cancelStoredEvent(eventId: string, organiserToken: string): Promise<DeleteResult> {
  return deleteWithBearer(`/api/events/${encodeURIComponent(eventId)}`, organiserToken, "We couldn't cancel this event. Try again.");
}

/** Organiser edits the event. `scheduleChanged` means everyone's answers were cleared. */
export async function updateStoredEvent(eventId: string, organiserToken: string, body: unknown): Promise<{ ok: true; scheduleChanged: boolean } | { ok: false; status: number; message: string; field?: string }> {
  const fallback = "We couldn't save your changes. Try again.";
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${organiserToken}` },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const j = await res.json().catch(() => null);
    if (res.ok && j) return { ok: true, scheduleChanged: j.scheduleChanged === true };
    const err = j && j.error;
    return { ok: false, status: res.status, message: (err && err.message) || fallback, field: err && err.field };
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection and try again." };
  }
}

/** Guest removes themselves and their availability. */
export function leaveStoredEvent(eventId: string, credential: string): Promise<DeleteResult> {
  return deleteWithBearer(`/api/events/${encodeURIComponent(eventId)}/response`, credential, "We couldn't remove you from this event. Try again.");
}

// ---- Propose a time, vote, confirm -----------------------------------------------------------------------------

export type ProposalResult = { ok: true; proposal: any } | { ok: false; status: number; message: string };

async function proposalCall(url: string, init: RequestInit, token: string | null, fallback: string): Promise<ProposalResult> {
  try {
    const headers: Record<string, string> = { ...(init.body ? { 'Content-Type': 'application/json' } : {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { ...init, headers, cache: 'no-store' });
    const j = await res.json().catch(() => null);
    if (res.ok && j && 'proposal' in j) return { ok: true, proposal: j.proposal };
    return { ok: false, status: res.status, message: (j && j.error && j.error.message) || fallback };
  } catch {
    return { ok: false, status: 0, message: fallback };
  }
}

const proposalUrl = (eventId: string, tail = '') => `/api/events/${encodeURIComponent(eventId)}/proposal${tail}`;

/** Organiser token or guest credential; the server returns the same body either way, plus the caller's own vote. */
export function fetchProposal(eventId: string, token: string | null): Promise<ProposalResult> {
  return proposalCall(proposalUrl(eventId), { method: 'GET' }, token, "Couldn't load the proposal.");
}

export function createProposal(eventId: string, organiserToken: string, body: unknown): Promise<ProposalResult> {
  return proposalCall(proposalUrl(eventId), { method: 'POST', body: JSON.stringify(body) }, organiserToken, "We couldn't propose that time. Try again.");
}

export function closeProposal(eventId: string, organiserToken: string): Promise<ProposalResult> {
  return proposalCall(proposalUrl(eventId, '/close'), { method: 'POST' }, organiserToken, "We couldn't close the poll. Try again.");
}

export function castVote(eventId: string, credential: string, vote: 'in' | 'out'): Promise<ProposalResult> {
  return proposalCall(proposalUrl(eventId, '/vote'), { method: 'PUT', body: JSON.stringify({ vote }) }, credential, "We couldn't save your answer. Try again.");
}

export function withdrawProposal(eventId: string, organiserToken: string): Promise<ProposalResult> {
  return proposalCall(proposalUrl(eventId), { method: 'DELETE' }, organiserToken, "We couldn't cancel the proposed time. Try again.");
}
