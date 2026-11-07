// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/utils/format.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
export function joinList(list) {
  if (list.length <= 1) return list.join('');
  return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
}
export function chipLabel(c) {
  if (c.type === 'person') return c.known === false ? c.name + '?' : (c.name || 'Someone') + ' goes';
  return c.n + '+ people';
}
export function describe(cs) {
  return (cs || []).map(chipLabel).join(' · ');
}
export function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}
export function fmtShort(m) {
  var h = Math.floor(m / 60) % 24;
  var mm = m % 60;
  return (h % 12 || 12) + (mm ? ':' + pad2(mm) : '') + (h < 12 ? 'am' : 'pm');
}
export function fmtNum(m) {
  var h = Math.floor(m / 60) % 24;
  var mm = m % 60;
  return (h % 12 || 12) + (mm ? ':' + pad2(mm) : '');
}
export function suffix(m) {
  return Math.floor(m / 60) % 24 < 12 ? 'am' : 'pm';
}
export function fmtCompact(s, e) {
  return suffix(s) === suffix(e) ? fmtNum(s) + ' – ' + fmtNum(e) + suffix(e) : fmtShort(s) + ' – ' + fmtShort(e);
}
/** A start time on its own: "7pm", "7:30pm". */
export function fmtStart(m) {
  return fmtShort(m);
}
export function fmtTick(m) {
  var h = Math.floor(m / 60) % 24;
  return (h % 12 || 12) + (h < 12 ? 'a' : 'p');
}
export function rangeText(r) {
  return fmtShort(r.s) + ' – ' + fmtShort(r.e);
}
