// @ts-nocheck
import { cancelStoredEvent, closeProposal, leaveStoredEvent, withdrawProposal } from '../services/event-api';
import { removeOrganiserEvent } from '../services/organiser-events';
import { clearGuestCredential, loadGuestCredential } from '../services/guest-credential';
/* Confirm sheet: organiser cancels the event, or a guest leaves it. Also the "event cancelled" notice
   that other people see once the polling gets a 404. */
export class ConfirmSheetMixin {
  // target: { id, token } for an event that isn't the one on screen (the home-screen list); otherwise the open event.
  openConfirm(kind, target) {
    this.setState({
      confirmTarget: target || null,
      confirmOpen: true,
      confirmClosing: false,
      confirmKind: kind,
      confirmBusy: false,
      confirmError: '',
    });
  }
  closeConfirm() {
    var self = this;
    if (!this.state.confirmOpen || this.state.confirmClosing || this.state.confirmBusy) return;
    if (this.state.confirmKind === 'gone') {
      this.leaveForHome();
      return;
    }
    this.setState({ confirmClosing: true });
    this.timers.confirmClose = setTimeout(
      function () {
        self.setState({ confirmOpen: false, confirmClosing: false, confirmError: '' });
      },
      this.reduced() ? 150 : 200,
    );
  }
  leaveForHome() {
    this.stopResultsPolling();
    try {
      window.location.assign('/');
    } catch (e) {}
  }
  confirmAction() {
    var self = this;
    var s = this.state;
    var t = s.confirmTarget;
    var ev = t ? { id: t.id } : s.event;
    if (s.confirmBusy || !ev || (!t && !ev.persisted)) return;
    if (s.confirmKind === 'closePoll') {
      this.confirmClosePoll(ev);
      return;
    }
    if (s.confirmKind === 'cancelTime') {
      this.confirmClosePoll(ev, withdrawProposal);
      return;
    }
    var cancel = s.confirmKind === 'cancel';
    var token = t ? t.token : cancel ? this.organiserToken() : loadGuestCredential(ev.id);
    if (!token) {
      this.setState({ confirmError: "We couldn't verify your access on this device." });
      return;
    }
    this.setState({ confirmBusy: true, confirmError: '' });
    (cancel ? cancelStoredEvent(ev.id, token) : leaveStoredEvent(ev.id, token)).then(function (r) {
      // 404 on cancel and 401 on leave mean it's already gone, which is the outcome we wanted.
      var gone = r.ok || (cancel ? r.status === 404 : r.status === 401);
      if (!gone) {
        self.setState({ confirmBusy: false, confirmError: r.message });
        return;
      }
      if (cancel) removeOrganiserEvent(ev.id);
      else clearGuestCredential(ev.id);
      if (t) {
        self.setState({ confirmOpen: false, confirmClosing: false, confirmBusy: false, confirmTarget: null });
        return;
      }
      self.leaveForHome();
    });
  }

  // Close the poll, or (with `call` = withdrawProposal) cancel the proposed time; both answer with the new proposal state.
  confirmClosePoll(ev, call) {
    var self = this;
    var token = this.organiserToken();
    if (!token) {
      this.setState({ confirmError: "We couldn't verify your access on this device." });
      return;
    }
    this.setState({ confirmBusy: true, confirmError: '' });
    (call || closeProposal)(ev.id, token).then(function (r) {
      if (!r.ok) {
        self.setState({ confirmBusy: false, confirmError: r.message });
        return;
      }
      self.setState({ round: r.proposal, confirmBusy: false, confirmClosing: true });
      self.timers.confirmClose = setTimeout(
        function () {
          self.setState({ confirmOpen: false, confirmClosing: false });
        },
        self.reduced() ? 150 : 200,
      );
    });
  }

  confirmVals(s) {
    var self = this;
    var ev = s.event;
    var persisted = !!(ev && ev.persisted);
    var kind = s.confirmKind;
    var copy = {
      cancel: {
        title: 'Cancel this event?',
        body: 'This will delete the event for everyone who has joined, including their availability. This can’t be undone.',
        yes: 'Yes, cancel event',
        no: 'Keep event',
      },
      leave: {
        title: 'Leave this event?',
        body: 'Your availability will be deleted and you’ll be removed from the event. To rejoin, you’ll need the link or QR code again.',
        yes: 'Confirm',
        no: 'Cancel',
      },
      closePoll: {
        title: 'Close the poll now?',
        body: 'We\u2019ll check everyone\u2019s conditions against the people who said they\u2019re in, then confirm the time or let it fail. This can\u2019t be undone.',
        yes: 'Close poll',
        no: 'Keep open',
      },
      cancelTime: {
        title: 'Cancel this time?',
        body: 'The proposed time and everyone\u2019s answers will be cleared, and you\u2019ll need to propose a time again. Guests will see it disappear.',
        yes: 'Cancel this time',
        no: 'Keep it',
      },
      gone: {
        title: 'This event was cancelled',
        body: 'The organiser has cancelled it, so it’s no longer available.',
        yes: 'Back to home',
        no: '',
      },
    }[kind] || { title: '', body: '', yes: '', no: '' };
    return {
      confirmOpen: !!s.confirmOpen,
      confirmOverlayCls: 'overlay' + (s.confirmClosing ? ' is-closing' : ''),
      confirmTitle: copy.title,
      confirmBody: copy.body,
      confirmYes: s.confirmBusy ? 'Working…' : copy.yes,
      confirmNo: copy.no,
      confirmHasNo: kind !== 'gone',
      confirmBusy: !!s.confirmBusy,
      confirmDanger: kind === 'cancel',
      hasConfirmError: !!s.confirmError,
      confirmError: s.confirmError,
      showLeaveEvent: persisted && s.screen === 'event' && s.mode === 'guest',
      eventCloseLabel: 'Leave event',
      openEventClose: function () {
        self.openConfirm('leave');
      },
      closeConfirm: function () {
        self.closeConfirm();
      },
      confirmAction: function () {
        if (self.state.confirmKind === 'gone') self.leaveForHome();
        else self.confirmAction();
      },
      setConfirmEl: function (el) {
        self.confirmEl = el;
      },
      confirmKey: function (e) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          self.closeConfirm();
        }
      },
    };
  }
}
