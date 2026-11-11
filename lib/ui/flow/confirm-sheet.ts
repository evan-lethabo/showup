// @ts-nocheck
import { cancelStoredEvent, closeProposal, leaveStoredEvent, removeGuest, withdrawProposal } from '../services/event-api';
import { removeOrganiserEvent } from '../services/organiser-events';
import { clearGuestCredential, loadGuestCredential } from '../services/guest-credential';
/* Confirm sheet: organiser cancels the event or removes a guest, or a guest leaves it. Also the "event cancelled" notice
   that other people see once the polling gets a 404, and the "you've been removed" notice for a removed guest. */
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
  openRemoveGuest(id, name) {
    this.setState({ removeTarget: { id: id, name: name } });
    this.openConfirm('remove');
  }
  // The organiser removed this guest: stop polling and say so. Dismissing it goes back to the join screen.
  showRemoved() {
    var s = this.state;
    // On the join screen a stale credential is just being restored (and cleared) by tryRestoreGuest, not a removal.
    if (s.mode !== 'guest' || s.screen === 'join') return;
    if (s.confirmOpen && (s.confirmKind === 'removed' || s.confirmBusy)) return;
    this.stopResultsPolling();
    this.setState({
      confirmTarget: null,
      confirmOpen: true,
      confirmClosing: false,
      confirmKind: 'removed',
      confirmBusy: false,
      confirmError: '',
    });
  }
  dismissRemoved() {
    var ev = this.state.event;
    if (ev) clearGuestCredential(ev.id);
    this.setState({ confirmOpen: false, confirmClosing: false, confirmKind: null });
    this.leaveGuest();
  }
  closeConfirm() {
    var self = this;
    if (!this.state.confirmOpen || this.state.confirmClosing || this.state.confirmBusy) return;
    if (this.state.confirmKind === 'gone') {
      this.leaveForHome();
      return;
    }
    if (this.state.confirmKind === 'removed') {
      this.dismissRemoved();
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
    if (s.confirmKind === 'remove') {
      this.confirmRemoveGuest(ev);
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

  confirmRemoveGuest(ev) {
    var self = this;
    var target = this.state.removeTarget;
    var token = this.organiserToken();
    if (!target) return;
    if (!token) {
      this.setState({ confirmError: "We couldn't verify your access on this device." });
      return;
    }
    this.setState({ confirmBusy: true, confirmError: '' });
    removeGuest(ev.id, token, target.id).then(function (r) {
      // 404 means they'd already left, which is the outcome we wanted.
      if (!r.ok && r.status !== 404) {
        self.setState({ confirmBusy: false, confirmError: r.message });
        return;
      }
      var res = self.state.results;
      var patch = { confirmBusy: false, confirmClosing: true };
      if (res && Array.isArray(res.people)) {
        patch.results = Object.assign({}, res, {
          people: res.people.filter(function (p) {
            return p.id !== target.id;
          }),
        });
      }
      self.setState(patch);
      self.timers.confirmClose = setTimeout(
        function () {
          self.setState({ confirmOpen: false, confirmClosing: false, removeTarget: null });
        },
        self.reduced() ? 150 : 200,
      );
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
    var removeName = (s.removeTarget && s.removeTarget.name) || 'this guest';
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
      remove: {
        title: 'Remove ' + removeName + '?',
        body: 'Their availability and answers will be deleted. They can still rejoin with the invite link.',
        yes: 'Remove',
        no: 'Cancel',
      },
      removed: {
        title: 'You\u2019ve been removed',
        body: 'The organiser removed you from this event, so your availability was deleted. You can join again with the link.',
        yes: 'OK',
        no: '',
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
      confirmHasNo: kind !== 'gone' && kind !== 'removed',
      confirmBusy: !!s.confirmBusy,
      confirmDanger: kind === 'cancel' || kind === 'remove',
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
        else if (self.state.confirmKind === 'removed') self.dismissRemoved();
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
