/* The A6 characterisation data (docs/BACKEND_REQUIREMENTS.md), with the same values as SAMPLE_SLOTS,
   SAMPLE_WINDOW, ORG_RESP and GUEST_RESP in lib/ui/data/fixtures.ts, in the engine's condition model. */
import type { EventData, Response } from '../types';

export const ALEX = (): Response => ({
  id: 'Alex',
  who: 'Alex',
  role: 'organiser',
  avail: { fri: 1, sat: 2 },
  ranges: { fri: [{ s: 1140, e: 1380 }], sat: [{ s: 1140, e: 1380 }] },
  will: { fri: 'yes', sat: 'yes' },
  conds: { fri: null, sat: null },
});

export const JESS = (): Response => ({
  id: 'Jess',
  who: 'Jess',
  role: 'guest',
  avail: { fri: 1, sat: 1 },
  ranges: { fri: [{ s: 1080, e: 1320 }], sat: [{ s: 1200, e: 1440 }] },
  will: { fri: 'if', sat: 'yes' },
  conds: { fri: [{ type: 'min_attendees', n: 3 }], sat: null },
});

export const a6Event = (responses: Response[]): EventData => ({
  slots: [
    { id: 'fri', iso: '2026-10-23', day: 'Friday', title: 'Friday 23 Oct', short: 'Fri 23 Oct' },
    { id: 'sat', iso: '2026-10-24', day: 'Saturday', title: 'Saturday 24 Oct', short: 'Sat 24 Oct' },
  ],
  win: { s: 1020, e: 1440 },
  responses,
});
