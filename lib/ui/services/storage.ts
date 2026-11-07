// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/services/storage.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { EVENTS_KEY, EV_PREFIX } from '../config';
/* Device storage: the list of events on Landing and each event's saved data. */
export function store() {
  try {
    var ls = window.localStorage;
    var k = '__su_t';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return ls;
  } catch (e) {
    return null;
  }
}
export function loadMyEvents() {
  var ls = store();
  if (!ls) return null;
  try {
    return JSON.parse(ls.getItem(EVENTS_KEY) || '[]') || [];
  } catch (e) {
    return [];
  }
}
export function recordMyEvent(entry) {
  var ls = store();
  if (!ls) return;
  var list = loadMyEvents() || [];
  list = list.filter(function (x) {
    return !(x.id === entry.id && x.role === entry.role);
  });
  list.unshift(Object.assign({ updated: Date.now() }, entry));
  try {
    ls.setItem(EVENTS_KEY, JSON.stringify(list.slice(0, 20)));
  } catch (e) {}
}
export function saveEventData(ev) {
  var ls = store();
  if (!ls) return;
  try {
    ls.setItem(EV_PREFIX + ev.id, JSON.stringify(ev));
  } catch (e) {}
}
export function loadEventData(id) {
  var ls = store();
  if (!ls) return null;
  try {
    return JSON.parse(ls.getItem(EV_PREFIX + id) || 'null');
  } catch (e) {
    return null;
  }
}
