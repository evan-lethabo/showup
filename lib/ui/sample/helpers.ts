// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/sample/helpers.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { DAYS, MONTHS } from './constants';
export function dayBefore(iso) {
  var p = iso.split('-').map(Number);
  var d = new Date(p[0], p[1] - 1, p[2] - 1);
  var mm = String(d.getMonth() + 1);
  if (mm.length < 2) mm = '0' + mm;
  var dd = String(d.getDate());
  if (dd.length < 2) dd = '0' + dd;
  return d.getFullYear() + '-' + mm + '-' + dd;
}
export function prettyDate(iso) {
  var p = iso.split('-').map(Number);
  var d = new Date(p[0], p[1] - 1, p[2]);
  return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
}
export function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}
