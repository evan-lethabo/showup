// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/utils/dates.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { DAYS, DOW, MON } from '../data/constants';
import { pad2 } from './format';
export function dateFromIso(iso) {
  var p = iso.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}
export function isoFromDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
/** Today's date in the device's own timezone (not UTC, which is a different day for part of every day). */
export function todayIso() {
  return isoFromDate(new Date());
}
export function slotFromIso(iso) {
  var d = dateFromIso(iso);
  return {
    id: 'd' + iso.replace(/-/g, ''),
    iso: iso,
    day: DAYS[d.getDay()],
    title: DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()],
    short: DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()],
  };
}
