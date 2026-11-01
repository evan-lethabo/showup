// @ts-nocheck
import { castVote, createProposal, fetchProposal } from '../services/event-api';
import { loadGuestCredential } from '../services/guest-credential';
import { slotFromIso } from '../utils/dates';
import { fmtStart } from '../utils/format';
import { todayIso } from '../utils/dates';
/* Propose a time to everyone, collect I'm in / Can't make it, and show the confirmed result (stored events). */
export class RoundMixin {
  roundToken() {
    var s = this.state; var ev = s.event;
    if (!ev || !ev.persisted) return null;
    return s.mode === 'organiser' ? this.organiserToken() : loadGuestCredential(ev.id);
  }
  // Fetched alongside each results poll; late replies from an old loop are dropped by the generation check.
  refreshRound(gen, eventId) {
    var self = this;
    fetchProposal(eventId, this.roundToken()).then(function (r) {
      if (gen !== self.pollGen || !r.ok) return;
      if (JSON.stringify(r.proposal) !== JSON.stringify(self.state.round)) self.setState({ round: r.proposal });
    }, function () {});
  }
  openRoundSheet() {
    var best = this.state.results && this.state.results.best;
    this.setState({ roundSheetOpen: true, roundSheetClosing: false, roundForm: { slot: best ? best.date : '', deadline: '', min: '2' }, roundBusy: false, roundError: '' });
  }
  closeRoundSheet() {
    var self = this;
    if (!this.state.roundSheetOpen || this.state.roundSheetClosing || this.state.roundBusy) return;
    this.setState({ roundSheetClosing: true });
    this.timers.roundClose = setTimeout(function () { self.setState({ roundSheetOpen: false, roundSheetClosing: false, roundError: '' }); }, this.reduced() ? 150 : 200);
  }
  submitRound() {
    var self = this; var s = this.state; var ev = s.event; var best = s.results && s.results.best;
    if (s.roundBusy || !ev || !best) return;
    var f = s.roundForm || {};
    var pick = this.roundSlots(s).filter(function (x) { return x.date === (f.slot || best.date); })[0] || best;
    var n = parseInt(f.min, 10);
    if (isNaN(n) || n < 2 || String(n) !== String(f.min).trim()) { this.setState({ roundError: 'Choose a minimum of at least 2 people.' }); return; }
    var token = this.organiserToken();
    if (!token) { this.setState({ roundError: "We couldn't verify your access on this device." }); return; }
    this.setState({ roundBusy: true, roundError: '' });
    createProposal(ev.id, token, { date: pick.date, startMin: pick.startMin, deadline: f.deadline || undefined, minAttendees: n }).then(function (r) {
      if (!r.ok) { self.setState({ roundBusy: false, roundError: r.message }); return; }
      self.setState({ round: r.proposal, roundBusy: false, roundSheetClosing: true });
      self.timers.roundClose = setTimeout(function () { self.setState({ roundSheetOpen: false, roundSheetClosing: false }); }, self.reduced() ? 150 : 200);
    });
  }
  vote(v) {
    var self = this; var s = this.state; var ev = s.event;
    var cred = ev && loadGuestCredential(ev.id);
    if (s.roundBusy || !cred) return;
    this.setState({ roundBusy: true, roundError: '' });
    castVote(ev.id, cred, v).then(function (r) {
      if (!r.ok) { self.setState({ roundBusy: false, roundError: r.message }); return; }
      self.setState({ round: r.proposal, roundBusy: false, roundChanging: false });
    });
  }

  // One candidate per day (that day's best window); the overall best first in the list's labelling.
  roundSlots(s) {
    var r = s.results && s.event && s.results.eventId === s.event.id ? s.results : null;
    if (!r) return [];
    return (r.days || []).filter(function (d) { return d.best; }).map(function (d) {
      return { date: d.date, startMin: d.best.startMin, endMin: d.best.endMin };
    });
  }

  roundStatusLabel(s) {
    var p = s.round;
    if (p && p.status === 'open') return 'Time proposed';
    if (p && p.status === 'confirmed') return 'Confirmed';
    return 'Collecting responses';
  }

  roundVals(s) {
    var self = this; var ev = s.event; var p = s.round;
    var on = !!(ev && ev.persisted) && s.screen === 'event';
    var org = on && s.mode === 'organiser'; var guest = on && s.mode === 'guest';
    var best = s.results && ev && s.results.eventId === ev.id ? s.results.best : null;
    var when = p ? slotFromIso(p.date).title + ', ' + fmtStart(p.startMin) : '';
    var by = p && p.deadline ? 'Reply by ' + slotFromIso(p.deadline).short : 'No reply-by date';
    var open = on && !!p && p.status === 'open';
    var form = s.roundForm || {};
    var bestDate = best ? best.date : null;
    var tally = p && Array.isArray(p.tally) ? p.tally : [];
    var nIn = tally.filter(function (t) { return t.vote === 'in'; }).length;
    var nOut = tally.filter(function (t) { return t.vote === 'out'; }).length;
    var nPending = tally.length - nIn - nOut;
    return {
      roundSlotOptions: this.roundSlots(s).map(function (x) {
        return { value: x.date, label: slotFromIso(x.date).title + ', ' + fmtStart(x.startMin) + (x.date === bestDate ? ' (best so far)' : '') };
      }),
      roundSlot: form.slot || bestDate || '',
      setRoundSlot: function (e) { self.setState({ roundForm: Object.assign({}, self.state.roundForm, { slot: e.target.value }), roundError: '' }); },
      // Organiser only: the server never sends the tally to anyone else.
      roundHasTally: org && !!p && tally.length > 0,
      roundTallyLine: tally.length ? (nIn + nOut) + ' of ' + tally.length + ' replied \u00b7 ' + nIn + ' in \u00b7 ' + nOut + " can't \u00b7 " + nPending + ' pending' : '',
      roundTally: tally.map(function (t) {
        return { name: t.name, label: t.vote === 'in' ? 'In' : t.vote === 'out' ? "Can't make it" : 'Pending', cls: 'round-chip ' + (t.vote === 'in' ? 'is-in' : t.vote === 'out' ? 'is-out' : 'is-pending') };
      }),
      roundOn: on && !!p, roundWhen: when, roundBy: by, roundBusy: !!s.roundBusy,
      hasRoundError: !!s.roundError, roundError: s.roundError,
      roundMin: p ? p.minAttendees : 0,
      // Organiser
      roundCanPropose: org && !!best && (!p || p.status === 'failed'),
      roundProposeLabel: p && p.status === 'failed' ? 'Propose again' : 'Propose this time',
      roundOrgOpen: org && open,
      roundOrgFailed: org && !!p && p.status === 'failed',
      openRoundSheet: function () { self.openRoundSheet(); },
      askClosePoll: function () { self.openConfirm('closePoll'); },
      roundCanWithdraw: org && !!p && (p.status === 'open' || p.status === 'confirmed'),
      askWithdraw: function () { self.openConfirm('cancelTime'); },
      // Guest
      roundGuestAsk: guest && open && (p.myVote == null || !!s.roundChanging),
      roundGuestVoted: guest && open && p.myVote != null && !s.roundChanging,
      roundMyVote: p && p.myVote === 'in' ? "You said you're in. We'll check your conditions when the poll closes." : p && p.myVote === 'out' ? "You said you can't make it." : '',
      voteIn: function () { self.vote('in'); }, voteOut: function () { self.vote('out'); },
      changeVote: function () { self.setState({ roundChanging: true, roundError: '' }); },
      // Closed, same card for everyone (counts only)
      roundConfirmed: on && !!p && p.status === 'confirmed',
      roundConfirmedGoing: on && !!p && p.status === 'confirmed' && (p.myStatus === 'going'),
      roundConfirmedNot: on && !!p && p.status === 'confirmed' && p.myStatus !== 'going',
      roundConfirmedCount: p && p.confirmedCount ? p.confirmedCount + (p.confirmedCount === 1 ? ' person' : ' people') + ' going.' : '',
      roundFailedGuest: guest && !!p && p.status === 'failed',
      // Sheet
      roundSheetOpen: !!s.roundSheetOpen,
      roundOverlayCls: 'overlay' + (s.roundSheetClosing ? ' is-closing' : ''),
            roundDeadline: form.deadline || '', roundMinInput: form.min || '2',
      roundDeadlineMin: todayIso(), roundDeadlineMax: best ? best.date : '',
      setRoundDeadline: function (e) { self.setState({ roundForm: Object.assign({}, self.state.roundForm, { deadline: e.target.value }), roundError: '' }); },
      setRoundMin: function (e) { self.setState({ roundForm: Object.assign({}, self.state.roundForm, { min: e.target.value }), roundError: '' }); },
      closeRoundSheet: function () { self.closeRoundSheet(); },
      submitRound: function () { self.submitRound(); },
      setRoundSheetEl: function (el) { self.roundSheetEl = el; },
      roundSheetKey: function (e) { if (e.key === 'Escape') { e.stopPropagation(); self.closeRoundSheet(); } },
    };
  }
}
