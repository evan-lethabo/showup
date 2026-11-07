// Organiser links for events created on this device. Device storage only; never sent to the server.
export const ORGANISER_EVENTS_KEY = 'showup:organiser-events';

export interface OrganiserEventEntry {
  eventId: string;
  title: string;
  adminUrl: string;
  createdAt: string;
}

const valid = (x: unknown): x is OrganiserEventEntry => {
  const e = x as OrganiserEventEntry;
  return (
    !!e &&
    typeof e.eventId === 'string' &&
    typeof e.title === 'string' &&
    typeof e.createdAt === 'string' &&
    typeof e.adminUrl === 'string' &&
    e.adminUrl.startsWith('/e/')
  );
};

export function loadOrganiserEvents(): OrganiserEventEntry[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(ORGANISER_EVENTS_KEY) || '[]');
    return Array.isArray(list) ? list.filter(valid) : [];
  } catch {
    return [];
  }
}

/** Newest first, one entry per event. */
export function saveOrganiserEvent(entry: OrganiserEventEntry): void {
  if (!valid(entry)) return;
  try {
    const rest = loadOrganiserEvents().filter((e) => e.eventId !== entry.eventId);
    localStorage.setItem(ORGANISER_EVENTS_KEY, JSON.stringify([entry, ...rest]));
  } catch {
    /* storage unavailable */
  }
}

export function removeOrganiserEvent(eventId: string): void {
  try {
    localStorage.setItem(ORGANISER_EVENTS_KEY, JSON.stringify(loadOrganiserEvents().filter((e) => e.eventId !== eventId)));
  } catch {
    /* storage unavailable */
  }
}
