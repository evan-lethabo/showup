// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/components/event-page.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { FRESH_LINK } from '../config';
import { clone } from '../utils/helpers';
import { fmtCompact, fmtStart } from '../utils/format';
import { dateFromIso, isoFromDate, slotFromIso } from '../utils/dates';
import { fetchResults } from '../services/event-api';

var RESULTS_POLL_MS = 3000;
import { bestWindow, dayDots, summarise } from '../utils/recommend';
import { recordMyEvent, saveEventData } from '../services/storage';
import { dotRowsFrom } from '../utils/dot-rows';
/* Event page (in the flow): results, invite link, reminder */
export class EventPageMixin {
  flash(key, msg, ms) {
    var self = this;
    var p = {};
    p[key] = msg;
    this.setState(p);
    if (this.timers[key]) clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(function () {
      var q = {};
      q[key] = '';
      self.setState(q);
    }, ms || 2400);
  }
  legacyCopy(el) {
    if (!el) return false;
    try {
      if (el.select) {
        el.focus();
        el.select();
      } else {
        var r = document.createRange();
        r.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
      return document.execCommand('copy');
    } catch (e) {
      return false;
    }
  }
  copy(text, el, key, okMsg, failMsg) {
    var self = this;
    var done = function (ok) {
      self.flash(key, ok ? okMsg : failMsg, ok ? 2400 : 6000);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            done(true);
          },
          function () {
            done(self.legacyCopy(el));
          },
        );
        return;
      }
    } catch (e) {}
    done(this.legacyCopy(el));
  }
  dayBefore(iso) {
    var d = dateFromIso(iso);
    return isoFromDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
  }
  withdraw() {
    var ev = clone(this.state.event);
    ev.proposal = null;
    saveEventData(ev);
    recordMyEvent({ id: ev.id, name: ev.name, role: 'organising', who: this.state.myName, status: 'Collecting responses' });
    this.setState({ event: ev });
  }
  organiserToken() {
    var s = this.state;
    var ev = s.event;
    if (!ev || !ev.persisted || s.mode !== 'organiser' || !ev.links || !ev.links.organiserPath) return null;
    try {
      return new URL(ev.links.organiserPath, 'http://local').searchParams.get('k');
    } catch (e) {
      return null;
    }
  }
  // Stored events: one chained-timeout loop while the event or Join screen shows. Each restart bumps the
  // generation, which stops the old loop and makes its late replies ignored. Called after every update.
  syncResultsPolling() {
    var s = this.state;
    var ev = s.event;
    var key = ev && ev.persisted && !s.eventGone && (s.screen === 'event' || s.screen === 'join') ? ev.id + '|' + s.mode : null;
    if (key === this.pollKey) return;
    this.stopResultsPolling();
    this.pollKey = key;
    if (key) this.pollResults(this.pollGen, ev.id);
  }
  stopResultsPolling() {
    this.pollGen = (this.pollGen || 0) + 1;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.pollKey = null;
  }
  pollResults(gen, eventId) {
    var self = this;
    var next = function () {
      if (gen !== self.pollGen) return;
      self.pollTimer = setTimeout(function () {
        self.pollTimer = null;
        if (gen === self.pollGen) self.pollResults(gen, eventId);
      }, RESULTS_POLL_MS);
    };
    var failed = function () {
      if (gen !== self.pollGen) return;
      if (!self.state.resultsError) self.setState({ resultsError: true });
      next();
    };
    if (typeof this.refreshRound === 'function') this.refreshRound(gen, eventId);
    fetchResults(eventId, this.organiserToken()).then(function (r) {
      if (gen !== self.pollGen) return;
      if (!r.ok && r.status === 404 && !self.state.confirmBusy) {
        // The organiser cancelled the event: stop polling and tell the person.
        self.stopResultsPolling();
        self.setState({
          eventGone: true,
          confirmOpen: true,
          confirmClosing: false,
          confirmKind: 'gone',
          confirmBusy: false,
          confirmError: '',
        });
        return;
      }
      if (!r.ok || !r.body || r.body.eventId !== eventId) {
        failed();
        return;
      }
      // The organiser edited the event: reload so this page shows the new details (and a guest is asked to reply again).
      var cur = self.state.event;
      if (typeof r.body.rev === 'string' && cur && cur.rev && r.body.rev !== cur.rev && !self.state.editingEvent) {
        self.stopResultsPolling();
        try {
          window.location.reload();
        } catch (e) {}
        return;
      }
      if (self.state.resultsError || JSON.stringify(r.body) !== JSON.stringify(self.state.results))
        self.setState({ results: r.body, resultsError: false });
      next();
    }, failed);
  }

  resultsVals(s) {
    var self = this;
    var ev = s.event;
    var on = !!(ev && ev.persisted) && (s.screen === 'event' || s.screen === 'join');
    var r = on && s.results && s.results.eventId === ev.id ? s.results : null;
    var days = r ? r.days : [];
    var scale = Math.max(1, r ? r.respondedCount : 1);
    var pct = function (n) {
      return String(Math.round((n / scale) * 1000) / 10);
    };
    var best = r && r.best;
    var rows = days.map(function (d) {
      var b = d.best;
      var info = slotFromIso(d.date);
      var isBest = !!(best && best.date === d.date);
      return {
        key: d.date,
        isBest: isBest,
        cls: 'lr-row' + (isBest ? ' is-best' : '') + (b ? '' : ' is-none'),
        label: info.short + ' · ' + (b ? fmtStart(b.startMin) : 'No time fits'),
        counts: b ? b.free + ' free · ' + b.coming + ' coming' + (b.maybe > 0 ? ' · ' + b.maybe + ' maybe' : '') : '',
        hasBar: !!b,
        freePct: b ? pct(b.free) : '0',
        comingPct: b ? pct(b.coming) : '0',
        free: b ? b.free : 0,
        coming: b ? b.coming : 0,
        maybe: b ? b.maybe : 0,
        names: b && Array.isArray(b.names) ? b.names : [],
        day: info.title,
        time: b ? fmtStart(b.startMin) : 'No time fits',
        aria: b ? info.title + ': ' + b.free + ' free, ' + b.coming + ' coming' : info.title + ': no time fits',
      };
    });
    return {
      showLiveResults: on,
      resultsLoading: on && !r && !s.resultsError,
      resultsFailed: on && !r && !!s.resultsError,
      retryResults: function () {
        self.stopResultsPolling();
        self.syncResultsPolling();
      },
      resultsEmpty: !!r && r.respondedCount === 0,
      resultsNoBest: !!r && r.respondedCount > 0 && !best,
      resultsHasBest: !!best,
      resultsBestLine: best
        ? 'Best time: ' + slotFromIso(best.date).short.split(' ')[0] + ' ' + fmtStart(best.startMin) + ' · ' + best.coming + ' coming'
        : '',
      resultsBestDay: best ? slotFromIso(best.date).day : '',
      resultsBestTime: best ? fmtStart(best.startMin) : '',
      resultsBestDate: best ? slotFromIso(best.date).short : '',
      resultsBestCount: best ? best.coming + (best.coming === 1 ? ' person could make this work.' : ' people could make this work.') : '',
      resultsRows: r && r.respondedCount > 0 ? rows : [],
      // Silver circles like the example page: who has joined, and whether they've responded. Never their answers.
      showPeople: !!r && Array.isArray(r.people) && r.people.length > 0,
      resultsPeople:
        r && Array.isArray(r.people)
          ? r.people.map(function (p) {
              // Only the organiser's results carry ids, and only the organiser can remove someone.
              var removable = s.mode === 'organiser' && typeof p.id === 'string';
              return {
                key: p.id || p.name,
                removable: removable,
                remove: removable
                  ? function () {
                      self.openRemoveGuest(p.id, p.name);
                    }
                  : null,
                removeAria: 'Remove ' + p.name,
                name: p.name,
                initial: p.name.charAt(0).toUpperCase(),
                cls: 'av glass-silver lr-av' + (p.responded ? '' : ' is-waiting'),
                tip: p.responded ? p.name : p.name + ' \u00b7 not replied yet',
                aria: p.name + (p.responded ? ', has responded' : ', has not responded yet'),
              };
            })
          : [],
    };
  }

  renderValsReminder() {
    var ev = this.state.event;
    return (
      "Hey, we're trying to lock in a time for " + ((ev && ev.name) || 'Weekend plans') + '. Add your availability when you get a chance!'
    );
  }

  eventContext(s) {
    var ev = s.event;
    var isEvent = s.screen === 'event' && !!ev;
    var orgView = isEvent && s.mode === 'organiser';
    var guestView = isEvent && s.mode === 'guest';
    var nResp = ev ? (ev.responses || []).length : 0;
    // Stored events carry names only, not answers; the legacy summary needs answers and would invent results.
    var legacy = isEvent && !ev.persisted;
    var sum = legacy ? summarise(ev) : { days: [], best: null };
    var showResults = legacy && (guestView || nResp >= 2);
    var best = sum.best;
    var bw = best ? bestWindow(ev, best.slot.id, best.viable) : null;
    var prop = ev && ev.proposal;
    var propSlot = prop
      ? ev.slots.filter(function (x) {
          return x.id === prop.slotId;
        })[0]
      : null;
    return {
      ev: ev,
      isEvent: isEvent,
      orgView: orgView,
      guestView: guestView,
      nResp: nResp,
      sum: sum,
      showResults: showResults,
      best: best,
      bw: bw,
      prop: prop,
      propSlot: propSlot,
    };
  }

  eventVals(s, x) {
    var self = this;
    var ev = x.ev,
      isEvent = x.isEvent,
      orgView = x.orgView,
      guestView = x.guestView,
      nResp = x.nResp,
      sum = x.sum,
      showResults = x.showResults,
      best = x.best,
      bw = x.bw,
      prop = x.prop,
      propSlot = x.propSlot;
    var persisted = !!(ev && ev.persisted);
    var links = (ev && ev.links) || {};
    var people = isEvent
      ? (ev.responses || []).map(function (r) {
          var on = s.activePerson === r.who;
          return {
            name: r.who,
            initial: r.who.charAt(0).toUpperCase(),
            cls: 'av glass-silver' + (on ? ' is-on' : ''),
            pressed: on ? 'true' : 'false',
            toggle: function () {
              self.setState({ activePerson: self.state.activePerson === r.who ? null : r.who });
            },
          };
        })
      : [];
    var live = persisted && s.results && s.results.eventId === ev.id ? s.results : null;
    var legacyCount =
      orgView && nResp === 0
        ? 'No responses yet.'
        : orgView && nResp <= 1
          ? 'Just you so far.'
          : nResp + (nResp === 1 ? ' response' : ' responses');
    return Object.assign(this.resultsVals(s), {
      evStatusLabel: persisted ? this.roundStatusLabel(s) : orgView && prop ? 'Time proposed (prototype)' : 'Collecting responses',
      evGridCls: 'ev-grid ' + ((showResults || persisted) && orgView ? 'is-full ' : '') + this.screenClsOf(s),
      countLine: !persisted ? legacyCount : live ? live.respondedCount + (live.respondedCount === 1 ? ' response' : ' responses') : '',
      showGuestStatus: guestView,
      guestStatus: persisted && !s.justSaved ? "You've responded." : 'Response saved.',
      showFresh: orgView && !persisted && nResp <= 1,
      showInviteBottom: orgView && persisted,
      showResults: showResults,
      showOrgSide: orgView && (persisted || nResp >= 2),
      isOrgView: orgView,
      isGuestView: guestView,
      hasBest: !!best,
      noBest: !best,
      bestDay: best ? best.slot.day : '',
      bestTime: bw ? fmtCompact(bw.s, bw.e) : '',
      bestDate: best ? best.slot.short || best.slot.title : '',
      bestLine: best ? best.go + (best.go === 1 ? ' person could make this work.' : ' people could make this work.') : '',
      dotRows: isEvent
        ? dotRowsFrom(
            sum.days.map(function (d) {
              return dayDots(ev, d);
            }),
            best ? best.slot.id : null,
            s.discsGrown,
            s.dotsSettled,
          )
        : [],
      people: people,
      linkMsg: s.linkMsg,
      // Stored events have real links; the seeded previews keep the prototype's sample URL.
      isPersisted: persisted,
      isPrototype: !persisted,
      shareLinkText: persisted ? location.host + links.guestPath : 'showup.example/e/N8R2VQ',
      shareLinkTitle: persisted ? undefined : 'Prototype URL, not a live link',
      guestUrl: persisted && links.guestPath ? location.origin + links.guestPath : '',
      copyLink: function () {
        self.copy(
          persisted ? location.origin + links.guestPath : FRESH_LINK,
          self.linkEl,
          'linkMsg',
          'Link copied.',
          "Couldn't copy automatically. The link is selected, so copy it from there.",
        );
      },
      canCopyOrgLink: orgView && persisted && !!links.organiserPath,
      copyOrgLink: function () {
        self.copy(
          location.origin + links.organiserPath,
          null,
          'linkMsg',
          'Organiser link copied. Keep it private.',
          "Couldn't copy automatically. Your organiser link is this page's address.",
        );
      },
      setLinkEl: function (el) {
        self.linkEl = el;
      },
      editMyResponse: function () {
        self.editMyResponse();
      },
      previewGuest: function () {
        self.previewGuest();
      },
      proposeLabel: prop ? 'Change proposal' : 'Propose a time',
      hasProposal: orgView && !!prop,
      proposalText:
        prop && propSlot
          ? propSlot.title +
            '. Replies by ' +
            prop.deadline.split('-').reverse().slice(0, 2).join('/') +
            '. Goes ahead if at least ' +
            prop.min +
            ' people commit.'
          : '',
      withdraw: function () {
        self.withdraw();
      },
      reminderOpen: s.reminderOpen,
      reminderExpanded: s.reminderOpen ? 'true' : 'false',
      reminderText:
        "Hey, we're trying to lock in a time for " +
        ((ev && ev.name) || 'Weekend plans') +
        '. Add your availability when you get a chance!',
      remMsg: s.remMsg,
      noop: function () {},
      selectAll: function (e) {
        try {
          e.target.select();
        } catch (err) {}
      },
      toggleReminder: function () {
        self.setState({ reminderOpen: !self.state.reminderOpen, remMsg: '' });
      },
      copyReminder: function () {
        self.copy(
          self.renderValsReminder(),
          self.remEl,
          'remMsg',
          'Reminder copied.',
          "Couldn't copy automatically. The text is selected, so copy it from the box.",
        );
      },
      setRemEl: function (el) {
        self.remEl = el;
      },
    });
  }
}
