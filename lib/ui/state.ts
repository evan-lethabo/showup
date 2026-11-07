// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/state.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { SAMPLE_SLOTS, SAMPLE_WINDOW, ORG_RESP, GUEST_RESP, demoEvent } from './data/fixtures';
import { clone, emptyMaps } from './utils/helpers';
import { todayIso } from './utils/dates';
import { loadMyEvents } from './services/storage';
export function baseState() {
  return {
    screen: 'landing',
    mode: 'organiser',
    name: '',
    nameError: '',
    orgName: '',
    duration: null,
    pickDays: [],
    calMonth: todayIso().slice(0, 7),
    from: 1020,
    until: 1440,
    moreOpen: false,
    note: '',
    event: null,
    myName: '',
    editing: false,
    joinName: '',
    joinError: '',
    slots: [],
    win: { s: 1020, e: 1440 },
    avail: {},
    ranges: {},
    openWheel: {},
    will: {},
    conds: {},
    condText: {},
    applied: {},
    errors: {},
    formError: '',
    noneWork: false,
    phase: 'editing',
    dirty: false,
    sheet: null,
    sheetClosing: false,
    liveMsg: '',
    linkMsg: '',
    remMsg: '',
    reminderOpen: false,
    proposeOpen: false,
    proposeClosing: false,
    confirmOpen: false,
    confirmClosing: false,
    confirmKind: '',
    confirmTarget: null,
    confirmBusy: false,
    confirmError: '',
    eventGone: false,
    round: null,
    roundChanging: false,
    roundSheetOpen: false,
    roundSheetClosing: false,
    roundForm: { slot: '', deadline: '', min: '2' },
    roundBusy: false,
    roundError: '',
    propForm: null,
    propError: '',
    activePerson: null,
    editingEvent: false,
    myEvents: [],
    leaving: false,
    anim: '',
  };
}
export function respondFor(ev, mode, myName) {
  var o = { event: ev, mode: mode, myName: myName, slots: clone(ev.slots), win: clone(ev.win) };
  return Object.assign(o, emptyMaps(ev.slots));
}
export function seed(startAt) {
  var s = baseState();
  if (startAt === 'landing') {
    s.myEvents = loadMyEvents() || [];
    return s;
  }
  s.name = 'Weekend plans';
  if (startAt === 'create') {
    s.screen = 'create';
    s.orgName = 'Alex';
    s.pickDays = ['2026-10-23', '2026-10-24'];
    return s;
  }
  if (startAt === 'participant') {
    s.screen = 'respond';
    s.mode = 'participant';
    s.slots = clone(SAMPLE_SLOTS);
    s.win = clone(SAMPLE_WINDOW);
    return Object.assign(s, emptyMaps(s.slots));
  }
  if (startAt === 'respond') {
    Object.assign(s, respondFor(demoEvent([]), 'organiser', 'Alex'));
    s.screen = 'respond';
    return s;
  }
  if (startAt === 'fresh') {
    Object.assign(s, respondFor(demoEvent([clone(ORG_RESP)]), 'organiser', 'Alex'));
    s.screen = 'event';
    return s;
  }
  if (startAt === 'join') {
    Object.assign(s, respondFor(demoEvent([clone(ORG_RESP)]), 'guest', ''));
    s.screen = 'join';
    return s;
  }
  if (startAt === 'guest') {
    Object.assign(s, respondFor(demoEvent([clone(ORG_RESP), clone(GUEST_RESP)]), 'guest', 'Jess'));
    s.screen = 'event';
    return s;
  }
  return s;
}
