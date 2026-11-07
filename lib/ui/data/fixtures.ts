// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/data/fixtures.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { clone } from '../utils/helpers';
export var SAMPLE_SLOTS = [
  { id: 'fri', iso: '2026-10-23', day: 'Friday', title: 'Friday 23 Oct', short: 'Fri 23 Oct' },
  { id: 'sat', iso: '2026-10-24', day: 'Saturday', title: 'Saturday 24 Oct', short: 'Sat 24 Oct' },
];
export var SAMPLE_WINDOW = { s: 1020, e: 1440 };
export var ORG_RESP = {
  who: 'Alex',
  role: 'organiser',
  avail: { fri: 1, sat: 2 },
  ranges: { fri: [{ s: 1140, e: 1380 }], sat: [{ s: 1140, e: 1380 }] },
  will: { fri: 'yes', sat: 'yes' },
  conds: { fri: null, sat: null },
  condText: { fri: '', sat: '' },
};
export var GUEST_RESP = {
  who: 'Jess',
  role: 'guest',
  avail: { fri: 1, sat: 1 },
  ranges: { fri: [{ s: 1080, e: 1320 }], sat: [{ s: 1200, e: 1440 }] },
  will: { fri: 'if', sat: 'yes' },
  conds: { fri: [{ type: 'min', n: '3' }], sat: null },
  condText: { fri: 'if at least 3 of us go', sat: '' },
};
export function demoEvent(responses) {
  return {
    id: 'demo',
    name: 'Weekend plans',
    organiser: 'Alex',
    slots: clone(SAMPLE_SLOTS),
    win: clone(SAMPLE_WINDOW),
    note: '',
    responses: responses || [],
    proposal: null,
    demo: true,
  };
}
