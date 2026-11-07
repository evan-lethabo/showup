// @ts-nocheck
// Maps between the Respond screen state and the stored-event response API (no raw condition text on save).

export function buildResponseBody(slots, state) {
  var days = [];
  if (state.noneWork) {
    slots.forEach(function (sl) {
      days.push({ date: sl.iso, willingness: 'no', available: [], favourite: [], conditions: [] });
    });
    return { days: days };
  }
  slots.forEach(function (sl) {
    var a = state.avail[sl.id] || 0;
    if (a === 0) return;
    var rs = (state.ranges[sl.id] || []).map(function (r) {
      return { start: r.s, end: r.e };
    });
    var fav = a === 2 ? rs : [];
    var conds = [];
    if (state.will[sl.id] === 'if' && state.conds[sl.id]) {
      (state.conds[sl.id] || []).forEach(function (c) {
        var row = { type: c.type, source: c.source === 'llm' ? 'llm' : 'fallback' };
        if (c.type === 'requires' || c.type === 'requires_any')
          row.people = (c.people || []).map(function (p) {
            return p.id ? { id: p.id } : { name: p.name };
          });
        else if (c.type === 'min_attendees') row.n = c.n;
        else if (c.type === 'time') {
          if (c.earliest_start != null) row.earliest_start = c.earliest_start;
          if (c.latest_end != null) row.latest_end = c.latest_end;
        } else if (c.type === 'unresolvable') row.summary = c.summary;
        conds.push(row);
      });
    }
    days.push({ date: sl.iso, willingness: state.will[sl.id], available: rs, favourite: fav, conditions: conds });
  });
  return { days: days };
}

/** Applies GET /response JSON onto respond screen maps (keyed by slot id). */
export function applyOwnResponse(slots, data) {
  var avail = {};
  var ranges = {};
  var openWheel = {};
  var will = {};
  var conds = {};
  var condText = {};
  var applied = {};
  slots.forEach(function (sl) {
    avail[sl.id] = 0;
    ranges[sl.id] = [];
    openWheel[sl.id] = null;
    will[sl.id] = null;
    conds[sl.id] = null;
    condText[sl.id] = '';
    applied[sl.id] = '';
  });
  var none = true;
  (data.days || []).forEach(function (d) {
    var sl = slots.filter(function (s) {
      return s.iso === d.date;
    })[0];
    if (!sl) return;
    none = false;
    var av = (d.available || []).map(function (r) {
      return { s: r.start, e: r.end };
    });
    var fav = (d.favourite || []).map(function (r) {
      return { s: r.start, e: r.end };
    });
    ranges[sl.id] = av.length ? av : [{ s: sl.win.s, e: sl.win.e }];
    avail[sl.id] = fav.length ? 2 : av.length ? 1 : 0;
    will[sl.id] = d.willingness;
    if (d.willingness === 'if' && d.conditions && d.conditions.length) {
      conds[sl.id] = d.conditions.map(function (c) {
        var row = { type: c.type, readback: c.readback, source: c.source };
        if (c.type === 'requires' || c.type === 'requires_any')
          row.people = (c.people || []).map(function (p) {
            return { name: p.name, pending: !!p.pending, id: p.pending ? undefined : p.id };
          });
        else if (c.type === 'min_attendees') row.n = c.n;
        else if (c.type === 'time') {
          if (c.earliest_start != null) row.earliest_start = c.earliest_start;
          if (c.latest_end != null) row.latest_end = c.latest_end;
        } else if (c.type === 'unresolvable') row.summary = c.summary;
        return row;
      });
      condText[sl.id] = d.conditions
        .map(function (c) {
          return c.readback;
        })
        .join(' ');
    }
  });
  return {
    avail: avail,
    ranges: ranges,
    openWheel: openWheel,
    will: will,
    conds: conds,
    condText: condText,
    applied: applied,
    noneWork:
      none &&
      (data.days || []).length > 0 &&
      data.days.every(function (d) {
        return d.willingness === 'no';
      }),
    phase: data.responded ? 'saved' : 'editing',
    editing: !!data.responded,
    participantId: data.participant && data.participant.id,
  };
}

export function condSummary(conds) {
  if (!conds || !conds.length) return '';
  return conds
    .map(function (c) {
      return c.readback || '';
    })
    .filter(Boolean)
    .join(' · ');
}
