// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/components/respond.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { STATE_LABELS } from '../data/constants';
import { clone, mergeRanges, emptyMaps } from '../utils/helpers';
import { joinList, describe, fmtTick, rangeText } from '../utils/format';
import { recordMyEvent, saveEventData } from '../services/storage';
import { saveOwnResponse, fetchOwnResponse } from '../services/event-api';
import { editLink, loadGuestCredential } from '../services/guest-credential';
import { applyOwnResponse, buildResponseBody, condSummary } from '../utils/response-sync';
import { minuteInWindow, untilFromWheel, wheelMinute } from '../utils/wheel-time';
import { DRAG_PX, middleRange, moveEndpoint, nearestEndpoint, pointerMinute, shiftRange, snapMinute } from '../utils/timeline';
/* Respond screen: days, availability, willingness, submit */
export class RespondMixin {
  slotById(id) {
    var l = this.state.slots;
    for (var i = 0; i < l.length; i++) {
      if (l[i].id === id) return l[i];
    }
    return null;
  }
  focusSlot(id) {
    var el = this.slotEls[id];
    if (!el) return;
    try {
      el.scrollIntoView({ block: 'center', behavior: this.motion() });
      el.focus({ preventScroll: true });
    } catch (e) {}
  }
  withKey(field, id, val) {
    var o = Object.assign({}, this.state[field]);
    o[id] = val;
    return o;
  }
  change(patch) {
    if (this.state.phase === 'saved' && this.state.mode === 'participant') patch.dirty = true;
    this.setState(patch);
  }
  // Stored events: `baseline` is the response as last loaded or saved, in the shape the API takes.
  baselineOf(st) {
    return JSON.stringify(buildResponseBody(st.slots, st));
  }
  unsavedChanges() {
    var s = this.state;
    return !!(s.event && s.event.persisted) && s.screen === 'respond' && s.baseline != null && this.baselineOf(s) !== s.baseline;
  }

  myResponse() {
    var s = this.state;
    if (!s.event) return null;
    var role = s.mode === 'organiser' ? 'organiser' : 'guest';
    return (
      (s.event.responses || []).filter(function (r) {
        return r.role === role && r.who === s.myName;
      })[0] || null
    );
  }
  editMyResponse() {
    var s = this.state;
    var self = this;
    var ev = s.event;
    if (ev && ev.persisted) {
      var cred = loadGuestCredential(ev.id);
      if (!cred) {
        this.setState({ formError: 'Open this event from your invitation link and enter your name again.' });
        return;
      }
      fetchOwnResponse(ev.id, cred).then(
        function (r) {
          if (!r.ok) {
            self.setState({ formError: 'Your guest access expired. Open the invitation link and enter your name again.' });
            return;
          }
          var data = r.body;
          var patch = Object.assign(
            {
              screen: 'respond',
              editing: true,
              phase: 'editing',
              errors: {},
              formError: '',
              reminderOpen: false,
              confirmSwitch: false,
              justSaved: false,
              slots: clone(ev.slots),
              win: clone(ev.win),
              myName: data.participant.name,
              participantId: data.participant.id,
            },
            applyOwnResponse(ev.slots, data),
          );
          patch.phase = 'editing';
          patch.editing = true;
          patch.baseline = self.baselineOf(patch);
          self.go(patch);
        },
        function () {
          self.setState({ formError: "We couldn't load your response. Try again in a moment." });
        },
      );
      return;
    }
    var mine = this.myResponse();
    var maps = emptyMaps(s.event.slots);
    if (mine) {
      ['avail', 'ranges', 'will', 'conds', 'condText'].forEach(function (k) {
        Object.assign(maps[k], clone(mine[k] || {}));
      });
    }
    this.go(
      Object.assign(
        {
          screen: 'respond',
          editing: !!mine,
          phase: 'editing',
          errors: {},
          formError: '',
          noneWork: false,
          reminderOpen: false,
          slots: clone(s.event.slots),
          win: clone(s.event.win),
        },
        maps,
      ),
    );
  }

  setAvail(id, a) {
    var s = this.state;
    var prev = s.avail[id] || 0;
    if (prev === a) return;
    var slot = this.slotById(id);
    var patch = { avail: this.withKey('avail', id, a), formError: '', liveMsg: slot.day + ': ' + STATE_LABELS[a] };
    if (prev === 0 && a > 0) {
      patch.ranges = this.withKey('ranges', id, [{ s: s.win.s, e: s.win.e }]);
      patch.openWheel = this.withKey('openWheel', id, null);
    }
    if (a > 0) patch.noneWork = false;
    if (a === 0) {
      patch.errors = this.withKey('errors', id, false);
      patch.applied = this.withKey('applied', id, '');
      patch.openWheel = this.withKey('openWheel', id, null);
    }
    this.change(patch);
  }
  setRanges(id, rs) {
    var merged = mergeRanges(rs);
    var patch = { ranges: this.withKey('ranges', id, merged) };
    if (merged.length !== (this.state.ranges[id] || []).length) patch.openWheel = this.withKey('openWheel', id, null);
    this.change(patch);
  }
  barRanges(id) {
    var w = this.state.win;
    var rs = mergeRanges(this.state.ranges[id] || []);
    return rs.length ? rs : [{ s: w.s, e: w.e }];
  }
  barRawMinute(e) {
    var w = this.state.win;
    var rect = e.currentTarget.getBoundingClientRect();
    return pointerMinute(e.clientX, rect.left, rect.width, w);
  }
  barMinute(e) {
    var w = this.state.win;
    return snapMinute(this.barRawMinute(e), w);
  }
  tapBar(id, e) {
    if (!e || e.detail === 0) {
      this.toggleWheels(id, 0);
      return;
    }
    if (this.barGesture === 'moved') return;
    var rs = this.barRanges(id);
    var hit = this.barMinute(e);
    this.setRanges(id, moveEndpoint(rs, nearestEndpoint(rs, hit), hit, this.state.win));
  }
  // A press becomes a drag once it moves DRAG_PX mostly sideways; mostly vertical is left to page scrolling.
  // Either way the gesture is no longer a tap, so the click that may follow is ignored.
  barDown(id, e) {
    this.barGesture = null;
    if (!e.isPrimary || e.button !== 0) return;
    var rs = this.barRanges(id);
    // Pressing the middle of a range (not its edges) means a drag carries the whole range, keeping its length.
    var raw = this.barRawMinute(e);
    var mid = middleRange(this.state.ranges[id] && this.state.ranges[id].length ? rs : [], raw);
    this.barGesture = {
      id: id,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      base: rs,
      orig: this.state.ranges[id],
      target: nearestEndpoint(rs, this.barMinute(e)),
      shift: mid >= 0 ? { idx: mid, grab: raw } : null,
      dragging: false,
      last: null,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}
  }
  barMove(id, e) {
    var g = this.barGesture;
    if (!g || g === 'moved' || g.id !== id || g.pointerId !== e.pointerId) return;
    if (!g.dragging) {
      var dx = Math.abs(e.clientX - g.x);
      var dy = Math.abs(e.clientY - g.y);
      if (Math.max(dx, dy) < DRAG_PX) return;
      if (dx <= dy) {
        this.barGesture = 'moved';
        return;
      }
      g.dragging = true;
      this.setState({ barDrag: id });
    }
    if (g.shift) {
      var step = Math.round((this.barRawMinute(e) - g.shift.grab) / 30);
      if (step === g.last) return;
      g.last = step;
      this.setRanges(id, shiftRange(g.base, g.shift.idx, step * 30, this.state.win));
      return;
    }
    var hit = this.barMinute(e);
    if (hit === g.last) return;
    g.last = hit;
    this.setRanges(id, moveEndpoint(g.base, g.target, hit, this.state.win));
  }
  barEnd(id, e, cancelled) {
    var g = this.barGesture;
    if (!g || g === 'moved' || g.id !== id || g.pointerId !== e.pointerId) return;
    this.barGesture = g.dragging ? 'moved' : null;
    if (!g.dragging) return;
    if (cancelled) this.setRanges(id, g.orig || g.base);
    this.setState({ barDrag: null });
  }
  setRangeEdge(id, idx, edge, val) {
    var w = this.state.win;
    var rs = clone(this.state.ranges[id] || []);
    var r = rs[idx];
    if (!r) return;
    if (edge === 's') {
      r.s = Math.max(w.s, Math.min(val, w.e - 60));
      if (r.e < r.s + 60) r.e = r.s + 60;
    } else {
      r.e = Math.min(w.e, Math.max(val, w.s + 60));
      if (r.e < r.s + 60) r.s = r.e - 60;
    }
    this.setRanges(id, rs);
  }
  toggleWheels(id, idx) {
    var cur = this.state.openWheel[id];
    this.setState({ openWheel: this.withKey('openWheel', id, cur === idx ? null : idx) });
  }
  addRangeFor(id) {
    var w = this.state.win;
    var rs = mergeRanges(this.state.ranges[id] || []);
    if (rs.length !== 1) return null;
    var r = rs[0];
    if (r.s - w.s >= 120) return [{ s: w.s, e: w.s + 60 }, r];
    if (w.e - r.e >= 120) return [r, { s: w.e - 60, e: w.e }];
    var len = r.e - r.s;
    var b = Math.round((r.s + len / 3) / 60) * 60;
    var c = Math.round((r.e - len / 3) / 60) * 60;
    if (b - r.s >= 60 && r.e - c >= 60 && c - b >= 60)
      return [
        { s: r.s, e: b },
        { s: c, e: r.e },
      ];
    return null;
  }
  addRange(id) {
    var nx = this.addRangeFor(id);
    if (!nx) return;
    this.change({ ranges: this.withKey('ranges', id, nx), openWheel: this.withKey('openWheel', id, null) });
  }
  removeRange(id, idx) {
    var rs = clone(this.state.ranges[id] || []);
    if (rs.length < 2) return;
    rs.splice(idx, 1);
    this.change({ ranges: this.withKey('ranges', id, rs), openWheel: this.withKey('openWheel', id, null) });
  }
  pick(id, w) {
    if (w === 'if') {
      this.openSheet(id);
      return;
    }
    this.change({ will: this.withKey('will', id, w), errors: this.withKey('errors', id, false), formError: '' });
  }

  markNone() {
    var avail = {};
    var ow = {};
    this.state.slots.forEach(function (sl) {
      avail[sl.id] = 0;
      ow[sl.id] = null;
    });
    this.change({ avail: avail, openWheel: ow, noneWork: true, errors: {}, formError: '' });
  }

  submit() {
    var s = this.state;
    var self = this;
    var avIds = s.slots
      .filter(function (x) {
        return s.avail[x.id] > 0;
      })
      .map(function (x) {
        return x.id;
      });
    if (!avIds.length && !s.noneWork) {
      this.setState({ formError: 'Mark at least one day, or let us know none of them work.' });
      return;
    }
    var missing = avIds.filter(function (id) {
      return !s.will[id];
    });
    if (missing.length) {
      var errors = {};
      missing.forEach(function (id) {
        errors[id] = true;
      });
      this.setState({
        errors: errors,
        formError:
          "Tell us whether you'd actually go on " +
          joinList(
            missing.map(function (id) {
              return self.slotById(id).day;
            }),
          ) +
          '.',
      });
      this.focusSlot(missing[0]);
      return;
    }
    this.setState({ phase: 'saving', formError: '', errors: {} });
    var ev = s.event;
    if (ev && ev.persisted) {
      var cred = loadGuestCredential(ev.id);
      if (!cred) {
        this.setState({ phase: 'editing', formError: 'Your guest access expired. Open the invitation link and enter your name again.' });
        return;
      }
      if (s.participantId && cred.indexOf(s.participantId + '.') !== 0) {
        this.setState({
          phase: 'editing',
          formError: 'This browser switched to a different guest for this event. Reload the page to continue.',
        });
        return;
      }
      saveOwnResponse(ev.id, cred, buildResponseBody(s.slots, s)).then(
        function (r) {
          if (!r.ok) {
            self.setState({ phase: 'editing', formError: r.message });
            return;
          }
          var data = r.body;
          var responses = (ev.responses || []).slice();
          if (
            !responses.some(function (x) {
              return x.who === data.participant.name;
            })
          )
            responses.push({ who: data.participant.name, role: 'guest' });
          var participants = (ev.participants || []).map(function (p) {
            return p.name === data.participant.name ? { name: p.name, responded: true } : p;
          });
          self.go(
            Object.assign(applyOwnResponse(ev.slots, data), {
              event: Object.assign({}, ev, { responses: responses, participants: participants }),
              screen: 'event',
              mode: 'guest',
              phase: 'saved',
              dirty: false,
              editing: false,
              formError: '',
              baseline: null,
              confirmSwitch: false,
              editLinkMsg: '',
              justSaved: true,
            }),
          );
        },
        function () {
          self.setState({ phase: 'editing', formError: "We couldn't reach the server. Check your connection and try again." });
        },
      );
      return;
    }
    this.timer = setTimeout(function () {
      if (self.state.mode === 'participant') {
        self.setState({ phase: 'saved', dirty: false });
        return;
      }
      self.saveToEvent();
    }, 700);
  }
  saveToEvent() {
    var s = this.state;
    var ev = clone(s.event);
    var role = s.mode === 'organiser' ? 'organiser' : 'guest';
    var mine = {
      who: s.myName,
      role: role,
      avail: clone(s.avail),
      ranges: clone(s.ranges),
      will: clone(s.will),
      conds: clone(s.conds),
      condText: clone(s.condText),
    };
    var idx = -1;
    ev.responses.forEach(function (r, i) {
      if (r.role === role && r.who === s.myName) idx = i;
    });
    if (idx >= 0) ev.responses[idx] = mine;
    else ev.responses.push(mine);
    saveEventData(ev);
    recordMyEvent({
      id: ev.id,
      name: ev.name,
      role: role === 'organiser' ? 'organising' : 'invited',
      who: s.myName,
      status: ev.proposal ? 'Time proposed' : 'Collecting responses',
    });
    this.go({ event: ev, screen: 'event', phase: 'saved', dirty: false, editing: false });
  }
  savedSummary() {
    var s = this.state;
    if (s.noneWork) return "You've let the organiser know none of these times work.";
    var free = s.slots.filter(function (x) {
      return s.avail[x.id] > 0;
    });
    var day = function (x) {
      return x.day;
    };
    var fav = free
      .filter(function (x) {
        return s.avail[x.id] === 2;
      })
      .map(day);
    var yes = free
      .filter(function (x) {
        return s.will[x.id] === 'yes';
      })
      .map(day);
    var ifs = free
      .filter(function (x) {
        return s.will[x.id] === 'if';
      })
      .map(day);
    var no = free
      .filter(function (x) {
        return s.will[x.id] === 'no';
      })
      .map(day);
    var out =
      "You're free " +
      free
        .map(function (x) {
          return x.day + ' ' + (s.ranges[x.id] || []).map(rangeText).join(' and ');
        })
        .join(', and ') +
      '.';
    if (fav.length) out += ' ' + joinList(fav) + (fav.length > 1 ? ' are your favourites.' : ' is your favourite.');
    if (yes.length && ifs.length) out += " You'd go on " + joinList(yes) + ', and on ' + joinList(ifs) + ' if your conditions are met.';
    else if (yes.length) out += " You'd go on " + joinList(yes) + '.';
    else if (ifs.length) out += " You'd go on " + joinList(ifs) + ' if your conditions are met.';
    if (no.length) out += " You'd rather not go on " + joinList(no) + '.';
    return out;
  }

  respondVals(s) {
    var self = this;
    var participant = s.mode === 'participant';
    var w = s.win;
    var span = Math.max(1, w.e - w.s);
    var hours = [];
    for (var hh = Math.ceil(w.s / 60) * 60; hh <= w.e; hh += 60) hours.push(hh);
    var tickStep = hours.length > 10 ? 2 : 1;
    var ticks = hours
      .filter(function (v, i) {
        return i % tickStep === 0 || i === hours.length - 1;
      })
      .map(function (v) {
        return {
          label: fmtTick(v),
          left: String(((v - w.s) / span) * 100),
          cls: 'tl-h' + (v === w.s ? ' is-first' : '') + (v === w.e ? ' is-last' : ''),
        };
      });
    var slots =
      s.screen === 'respond'
        ? s.slots.map(function (sl) {
            var a = s.avail[sl.id] || 0;
            var wv = s.will[sl.id];
            var c = s.conds[sl.id];
            var open = a > 0;
            var fav = a === 2;
            var rs = s.ranges[sl.id] || [];
            var ow = s.openWheel[sl.id];
            var showConds = open && wv === 'if' && !!(c && c.length);
            var at = self.segThumb(a, fav);
            var wIdx = wv === 'yes' ? 0 : wv === 'if' ? 1 : wv === 'no' ? 2 : -1;
            var wt = self.segThumb(wIdx, false);
            var ranges = rs.map(function (r, ri) {
              var wheelsOpen = open && ow === ri;
              var wheels = [];
              if (wheelsOpen) {
                wheels = [
                  {
                    key: 'r-' + sl.id + '-' + ri + '-s',
                    label: 'From',
                    value: wheelMinute(r.s),
                    min: wheelMinute(w.s),
                    max: wheelMinute(w.e),
                    onChange: function (v) {
                      self.setRangeEdge(sl.id, ri, 's', minuteInWindow(v, self.state.win));
                    },
                  },
                  {
                    key: 'r-' + sl.id + '-' + ri + '-e',
                    label: 'Until',
                    value: wheelMinute(r.e),
                    min: wheelMinute(w.s),
                    max: wheelMinute(w.e),
                    onChange: function (v) {
                      var current = (self.state.ranges[sl.id] || [])[ri];
                      if (current) self.setRangeEdge(sl.id, ri, 'e', untilFromWheel(v, current.s));
                    },
                  },
                ];
              }
              return {
                label: rangeText(r),
                aria: rangeText(r) + '. Change times',
                expanded: wheelsOpen ? 'true' : 'false',
                wheelsOpen: wheelsOpen,
                wheels: wheels,
                canRemove: rs.length > 1,
                toggleWheels: function () {
                  self.toggleWheels(sl.id, ri);
                },
                remove: function () {
                  self.removeRange(sl.id, ri);
                },
              };
            });
            return {
              id: sl.id,
              title: sl.title,
              short: sl.short || sl.title,
              titleId: 'dt-' + sl.id,
              qId: 'q-' + sl.id,
              cardCls: 'day glass' + (open ? '' : ' is-slim'),
              availThumbCls: at.cls,
              availThumbX: at.x,
              notFreeCls: 'seg-opt' + (a === 0 ? ' is-on' : ''),
              notFreePressed: a === 0 ? 'true' : 'false',
              freeCls: 'seg-opt' + (a === 1 ? ' is-on' : ''),
              freePressed: a === 1 ? 'true' : 'false',
              favCls: 'seg-opt' + (a === 2 ? ' is-on-red' : ''),
              favPressed: a === 2 ? 'true' : 'false',
              setNotFree: function () {
                self.setAvail(sl.id, 0);
              },
              setFree: function () {
                self.setAvail(sl.id, 1);
              },
              setFav: function () {
                self.setAvail(sl.id, 2);
              },
              setEl: function (el) {
                self.slotEls[sl.id] = el;
              },
              revealCls: 'reveal' + (open ? ' is-open' : ''),
              fills: rs.map(function (r) {
                return {
                  cls: 'tl-fill ' + (fav ? 'glass-red' : 'glass-silver'),
                  left: String(((r.s - w.s) / span) * 100),
                  width: String(((r.e - r.s) / span) * 100),
                };
              }),
              ticks: ticks,
              barAria:
                sl.day + ' timeline. Tap an hour to move the nearest end of your time. Currently ' + rs.map(rangeText).join(' and ') + '.',
              tapBar: function (e) {
                self.tapBar(sl.id, e);
              },
              barCls: 'tl' + (s.barDrag === sl.id ? ' is-dragging' : ''),
              barDown: function (e) {
                self.barDown(sl.id, e);
              },
              barMove: function (e) {
                self.barMove(sl.id, e);
              },
              barUp: function (e) {
                self.barEnd(sl.id, e, false);
              },
              barCancel: function (e) {
                self.barEnd(sl.id, e, true);
              },
              ranges: ranges,
              canAddRange: open && !!self.addRangeFor(sl.id),
              addRange: function () {
                self.addRange(sl.id);
              },
              willThumbCls: wt.cls,
              willThumbX: wt.x,
              yesCls: 'seg-opt' + (wv === 'yes' ? ' is-on' : ''),
              yesPressed: wv === 'yes' ? 'true' : 'false',
              ifCls: 'seg-opt' + (wv === 'if' ? ' is-on' : ''),
              ifPressed: wv === 'if' ? 'true' : 'false',
              noCls: 'seg-opt' + (wv === 'no' ? ' is-on' : ''),
              noPressed: wv === 'no' ? 'true' : 'false',
              pickYes: function () {
                self.pick(sl.id, 'yes');
              },
              pickIf: function () {
                self.pick(sl.id, 'if');
              },
              pickNo: function () {
                self.pick(sl.id, 'no');
              },
              showError: open && !!s.errors[sl.id],
              showConds: showConds,
              condText: s.event && s.event.persisted ? condSummary(c) : describe(c),
              editConds: function () {
                self.openSheet(sl.id);
              },
              canReuse: showConds && self.reuseTargets(sl.id).length > 0,
              reuse: function () {
                self.reuse(sl.id);
              },
              hasApplied: showConds && !!s.applied[sl.id],
              appliedNote: s.applied[sl.id],
            };
          })
        : [];
    var saving = s.phase === 'saving';
    var savedClean = participant && s.phase === 'saved' && !s.dirty;
    var ev = s.event;
    var cred = ev && ev.persisted && s.screen === 'event' && s.mode === 'guest' && s.participantId ? loadGuestCredential(ev.id) : null;
    if (cred && cred.indexOf(s.participantId + '.') !== 0) cred = null;
    var link = cred ? editLink(location.origin, ev.id, cred) : '';
    return {
      showEditLink: !!cred,
      editLinkText: link,
      editLinkMsg: s.editLinkMsg,
      copyEditLink: function () {
        self.copy(link, null, 'editLinkMsg', 'Edit link copied. Keep it private.', "Couldn't copy automatically. Your edit link: " + link);
      },
      editingResponse: s.screen === 'respond' && s.editing,
      backToEvent: function () {
        self.go({ screen: 'event', editing: false, sheet: null });
      },
      showStartLine: s.mode === 'organiser' && !s.editing,
      slots: slots,
      liveMsg: s.liveMsg,
      noneWork: s.noneWork,
      hasFormError: !!s.formError,
      formError: s.formError,
      showSubmitRow: !savedClean,
      showNoneBtn: !s.noneWork,
      showDirtyNote: participant && s.phase === 'saved' && s.dirty,
      saving: saving,
      savingStr: saving ? 'true' : 'false',
      submitLabel: saving ? 'Saving…' : s.editing || (participant && s.phase === 'saved') ? 'Save changes' : 'Submit response',
      showSaved: savedClean,
      savedSummary: savedClean ? this.savedSummary() : '',
      isPersisted: !!(s.event && s.event.persisted),
      backToEventSaved: function () {
        self.go({ screen: 'event', editing: false, sheet: null });
      },
      submit: function () {
        self.submit();
      },
      markNone: function () {
        self.markNone();
      },
      undoNone: function () {
        self.change({ noneWork: false });
      },
      editResponse: function () {
        if (self.state.slots[0]) self.focusSlot(self.state.slots[0].id);
      },
      setSavedEl: function (el) {
        self.savedEl = el;
      },
    };
  }
}
