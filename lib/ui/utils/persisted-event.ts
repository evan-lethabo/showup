// Maps a stored event (lib/server/events.ts PublicEvent) onto the flow's event shape, and formats its details.
import { slotFromIso } from './dates';
import { fmtCompact } from './format';

interface StoredEvent {
  id: string;
  title: string;
  organiserName: string;
  durationMin: number | null;
  timezone: string;
  days: { date: string; start: number; end: number }[];
  participants?: { name: string; responded: boolean }[];
}

export interface EventLinks {
  guestPath: string;
  organiserPath?: string;
}

interface FlowSlot {
  id: string;
  iso: string;
  day: string;
  title: string;
  short: string;
  win: { s: number; e: number };
}

/** Changes whenever the organiser edits the title, name, length or schedule. The results API sends the same string, so open pages can spot an edit. */
export function eventRev(e: {
  title: string;
  organiserName: string;
  durationMin: number | null;
  days: { date: string; start: number; end: number }[];
}): string {
  return JSON.stringify([e.title, e.organiserName, e.durationMin, e.days.map((d) => [d.date, d.start, d.end])]);
}

export function toFlowEvent(ev: StoredEvent, links: EventLinks) {
  const slots: FlowSlot[] = ev.days.map((d) => ({ ...(slotFromIso(d.date) as Omit<FlowSlot, 'win'>), win: { s: d.start, e: d.end } }));
  const first = slots[0];
  return {
    id: ev.id,
    name: ev.title,
    organiser: ev.organiserName,
    duration: ev.durationMin,
    timezone: ev.timezone,
    slots,
    win: first ? first.win : { s: 1020, e: 1440 },
    responses: (ev.participants || []).map((p) => ({ who: p.name, role: 'guest' })),
    participants: ev.participants || [],
    proposal: null,
    persisted: true,
    rev: eventRev(ev),
    links,
  };
}

function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}

/** "Fri 23 Oct, Sat 24 Oct · 5pm – 12am · 2 hr event", listing each day's window when they differ. No length set, no length label. */
export function eventDetails(ev: { slots: FlowSlot[]; duration: number | null }): string {
  const windows = ev.slots.map((s) => fmtCompact(s.win.s, s.win.e));
  const same = windows.every((w) => w === windows[0]);
  const days = same
    ? `${ev.slots.map((s) => s.short).join(', ')} · ${windows[0] ?? ''}`
    : ev.slots.map((s, i) => `${s.short} ${windows[i]}`).join(', ');
  return ev.duration ? `${days} · ${durationText(ev.duration)} event` : days;
}
