// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/utils/recommend.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { fmtCompact } from './format';
/* Who would actually go on a day: drop anyone whose conditions fail until nothing changes. */
export function dayStats(ev, slotId) {
  var resp = ev.responses || [];
  var free = resp.filter(function (r) {
    return (r.avail[slotId] || 0) > 0;
  });
  var cand = free.filter(function (r) {
    return r.will[slotId] === 'yes' || r.will[slotId] === 'if';
  });
  var changed = true;
  while (changed) {
    changed = false;
    var names = cand.map(function (r) {
      return r.who.toLowerCase();
    });
    var size = cand.length;
    var next = cand.filter(function (r) {
      if (r.will[slotId] !== 'if') return true;
      return (r.conds[slotId] || []).every(function (c) {
        if (c.type === 'person') return names.indexOf(String(c.name).toLowerCase()) >= 0;
        return size >= parseInt(c.n, 10);
      });
    });
    if (next.length !== cand.length) {
      changed = true;
      cand = next;
    }
  }
  return { free: free.length, go: cand.length, viable: cand };
}
export function bestWindow(ev, slotId, viable) {
  var w = ev.win;
  var best = null;
  var cur = null;
  var max = 0;
  for (var t = w.s; t < w.e; t += 15) {
    var n = viable.filter(function (r) {
      return (r.ranges[slotId] || []).some(function (rg) {
        return rg.s <= t && rg.e >= t + 15;
      });
    }).length;
    if (n > max) {
      max = n;
      best = { s: t, e: t + 15 };
      cur = best;
    } else if (n === max && n > 0 && cur && cur.e === t) {
      cur.e = t + 15;
      if (cur.e - cur.s > best.e - best.s) best = cur;
    } else if (n === max && n > 0) {
      cur = { s: t, e: t + 15 };
    } else cur = null;
  }
  return best;
}
/* Per day: the window where the most people would go (or, if nobody would, where most are free), counting who covers all of it. */
export function coverCount(list, slotId, w) {
  return list.filter(function (r) {
    return (r.ranges[slotId] || []).some(function (rg) {
      return rg.s <= w.s && rg.e >= w.e;
    });
  }).length;
}
export function dayDots(ev, d) {
  var freeList = (ev.responses || []).filter(function (r) {
    return (r.avail[d.slot.id] || 0) > 0;
  });
  var w = d.viable.length ? bestWindow(ev, d.slot.id, d.viable) : null;
  if (!w || coverCount(d.viable, d.slot.id, w) === 0) {
    w = freeList.length ? bestWindow(ev, d.slot.id, freeList) : null;
  }
  if (!w) return { id: d.slot.id, title: d.slot.title, time: '', free: 0, go: 0 };
  return {
    id: d.slot.id,
    title: d.slot.title,
    time: fmtCompact(w.s, w.e),
    free: coverCount(freeList, d.slot.id, w),
    go: coverCount(d.viable, d.slot.id, w),
  };
}
export function summarise(ev) {
  var days = ev.slots.map(function (sl) {
    var st = dayStats(ev, sl.id);
    return { slot: sl, free: st.free, go: st.go, viable: st.viable };
  });
  var best = null;
  days.forEach(function (d) {
    if (d.go > 0 && (!best || d.go > best.go || (d.go === best.go && d.free > best.free))) best = d;
  });
  return { days: days, best: best };
}
