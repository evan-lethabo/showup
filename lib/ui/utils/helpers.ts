// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/utils/helpers.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
export function clone(o) {
  return JSON.parse(JSON.stringify(o));
}
export function cloneConds(cs) {
  return (cs || []).map(function (c) {
    return Object.assign({}, c);
  });
}
export function sameConds(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}
export function steps(a, b, step) {
  var out = [];
  for (var v = a; v <= b; v += step) out.push(v);
  return out;
}
export function mergeRanges(rs) {
  var a = rs.slice().sort(function (x, y) {
    return x.s - y.s;
  });
  var out = [];
  a.forEach(function (r) {
    var last = out[out.length - 1];
    if (last && r.s <= last.e) last.e = Math.max(last.e, r.e);
    else out.push({ s: r.s, e: r.e });
  });
  return out;
}
export function emptyMaps(slots) {
  var o = { avail: {}, ranges: {}, openWheel: {}, will: {}, conds: {}, condText: {}, applied: {} };
  slots.forEach(function (s) {
    o.avail[s.id] = 0;
    o.ranges[s.id] = [];
    o.openWheel[s.id] = null;
    o.will[s.id] = null;
    o.conds[s.id] = null;
    o.condText[s.id] = '';
    o.applied[s.id] = '';
  });
  return o;
}
export function newId() {
  return Math.random().toString(36).slice(2, 8);
}
