// Shared plumbing for the route handlers in http.ts: JSON responses, error shapes, and reading the request.
import { isUnavailable, logDbError } from './db';

export const MAX_BODY_BYTES = 16_384;
const NO_STORE = { 'Cache-Control': 'no-store' };

export function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function error(status: number, code: string, message: string, field?: string): Response {
  return json(status, { error: field ? { code, message, field } : { code, message } });
}

/** Logs the real cause server-side and returns a generic message, so database details never reach the client. */
export function failure(context: string, err: unknown): Response {
  logDbError(context, err);
  return isUnavailable(err)
    ? error(503, 'unavailable', "We couldn't reach the database. Try again in a moment.")
    : error(500, 'server_error', 'Something went wrong on our side. Try again in a moment.');
}

/** The bearer token from the Authorization header, or null. Used for both organiser tokens and guest credentials. */
export function guestCredential(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const c = auth.slice(7).trim();
    return c || null;
  }
  return null;
}

/** Reads a size-limited JSON body, or returns the error response to send back. */
export async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
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
