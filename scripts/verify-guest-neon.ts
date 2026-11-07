// Non-destructive Neon check: create → join → save → reload → edit. Adds new rows only.
import { loadEnvConfig } from '@next/env';
import { getDb } from '../lib/server/db';
import { createEvent } from '../lib/server/events';
import {
  authenticateGuest,
  joinEvent,
  loadEngineResponses,
  loadOwnResponse,
  pendingRef,
  resolveRefs,
  saveResponse,
} from '../lib/server/responses';

loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing (.env.local)');
    process.exit(1);
  }
  const db = getDb();
  const tag = `b35-${Date.now().toString(36)}`;
  const { id: eventId } = await createEvent(db, {
    title: `Guest verify ${tag}`,
    organiserName: 'Verify Bot',
    timezone: 'Australia/Sydney',
    durationMin: 120,
    days: [
      { date: '2031-03-01', start: 1080, end: 1380 },
      { date: '2031-03-02', start: 1080, end: 1380 },
    ],
  });
  const guest = await joinEvent(db, eventId, `Guest ${tag}`);
  if (guest.status !== 'ok') throw new Error(`join failed: ${guest.status}`);
  const auth = await authenticateGuest(db, eventId, guest.credential);
  if (auth.status !== 'ok') throw new Error('auth failed');
  const body1 = {
    days: [
      {
        date: '2031-03-01',
        willingness: 'if',
        available: [{ start: 1140, end: 1320 }],
        favourite: [{ start: 1140, end: 1320 }],
        conditions: [{ type: 'requires', source: 'fallback', people: [{ name: 'Ella' }] }],
      },
    ],
  };
  const s1 = await saveResponse(db, eventId, auth.participant, body1);
  if (s1.status !== 'ok') throw new Error('save1 failed');
  const loaded = await loadOwnResponse(db, eventId, auth.participant);
  if (!loaded.responded || loaded.days.length !== 1) throw new Error('reload failed');
  const body2 = {
    days: [
      { date: '2031-03-01', willingness: 'yes', available: [{ start: 1140, end: 1320 }], favourite: [], conditions: [] },
      { date: '2031-03-02', willingness: 'no', available: [], favourite: [], conditions: [] },
    ],
  };
  const s2 = await saveResponse(db, eventId, auth.participant, body2);
  if (s2.status !== 'ok' || s2.response.days.length !== 2) throw new Error('edit save failed');
  const ella = await joinEvent(db, eventId, 'Ella');
  if (ella.status !== 'ok') throw new Error('ella join failed');
  const engine = await loadEngineResponses(db, eventId);
  const people = await db.query<{ id: string; display_name: string; normalised_name: string }>(
    'SELECT id, display_name, normalised_name FROM participants WHERE event_id = $1',
    [eventId],
  );
  const resolved = resolveRefs(
    [pendingRef('ella')],
    people.map((p) => ({ id: p.id, displayName: p.display_name, normalisedName: p.normalised_name })),
  );
  if (!resolved.some((r) => people.some((p) => p.id === r && p.normalised_name === 'ella')))
    throw new Error('ella pending ref did not resolve');
  console.log(`OK event=${eventId} guest=${guest.participant.id} engineResponses=${engine.length}`);
}

void main().catch((e) => {
  console.error('verify-guest-neon failed', e instanceof Error ? e.message : e);
  process.exit(1);
});
