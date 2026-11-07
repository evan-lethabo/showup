// @ts-nocheck
import { respondFor } from '../state';
import { joinStoredEvent, fetchOwnResponse } from '../services/event-api';
import { clearGuestCredential, forgetEditFragment, loadGuestCredential, saveGuestCredential } from '../services/guest-credential';
import { applyOwnResponse } from '../utils/response-sync';

function unreachable(linked) {
  return linked
    ? "We couldn't check that edit link. Try again in a moment."
    : "We couldn't load your saved response. Try again in a moment.";
}

export class JoinMixin {
  // A private edit link (verified first) wins over the identity this browser remembers.
  tryRestoreGuest() {
    var s = this.state;
    var ev = s.event;
    if (!ev || !ev.persisted || s.screen !== 'join') return;
    var linked = this.editCredential;
    var cred = linked || loadGuestCredential(ev.id);
    if (!cred) return;
    var self = this;
    this.setState({ restoring: true });
    fetchOwnResponse(ev.id, cred).then(
      function (r) {
        if (linked) {
          self.editCredential = null;
          forgetEditFragment();
        }
        if (r.ok) {
          if (linked) saveGuestCredential(ev.id, cred);
          self.restoreGuest(r.body);
          return;
        }
        var rejected = r.status === 401 || r.status === 403 || r.status === 404;
        if (!linked && rejected) clearGuestCredential(ev.id);
        self.setState({
          restoring: false,
          joinError: linked && rejected ? "That edit link isn't valid for this event." : rejected ? '' : unreachable(linked),
        });
      },
      function () {
        if (linked) {
          self.editCredential = null;
          forgetEditFragment();
        }
        self.setState({ restoring: false, joinError: unreachable(linked) });
      },
    );
  }

  restoreGuest(data) {
    var ev = this.state.event;
    var name = data.participant.name;
    var patch = Object.assign(respondFor(ev, 'guest', name), applyOwnResponse(ev.slots, data), {
      joinName: '',
      joinError: '',
      restoring: false,
      errors: {},
      formError: '',
      dirty: false,
      confirmSwitch: false,
      baseline: null,
      justSaved: false,
    });
    if (data.responded) {
      this.go(Object.assign(patch, { screen: 'event', phase: 'saved', editing: false }));
      return;
    }
    Object.assign(patch, { screen: 'respond', phase: 'editing', editing: false });
    patch.baseline = this.baselineOf(patch);
    this.go(patch);
  }

  switchGuest() {
    if (this.unsavedChanges()) {
      this.setState({ confirmSwitch: true });
      return;
    }
    this.leaveGuest();
  }

  // Forgets this event's guest on this browser only; their response stays on the server.
  leaveGuest() {
    var ev = this.state.event;
    clearGuestCredential(ev.id);
    this.go(
      Object.assign(respondFor(ev, 'guest', ''), {
        screen: 'join',
        joinName: '',
        joinError: '',
        joining: false,
        restoring: false,
        participantId: null,
        confirmSwitch: false,
        baseline: null,
        justSaved: false,
        errors: {},
        formError: '',
        noneWork: false,
        phase: 'editing',
        dirty: false,
        editing: false,
        sheet: null,
        linkMsg: '',
      }),
    );
  }

  switchVals(s) {
    var self = this;
    var ev = s.event;
    return {
      canSwitchGuest: !!(ev && ev.persisted) && s.mode === 'guest' && !!s.participantId && !!s.myName,
      switchLabel: 'Not ' + s.myName + '? Join as someone else',
      switchGuest: function () {
        self.switchGuest();
      },
      confirmSwitch: !!s.confirmSwitch,
      cancelSwitch: function () {
        self.setState({ confirmSwitch: false });
      },
      discardSwitch: function () {
        self.leaveGuest();
      },
    };
  }

  joinContinue() {
    var s = this.state;
    var n = (s.joinName || '').trim();
    if (!n) {
      this.setState({ joinError: 'Add your name to continue.' });
      return;
    }
    var ev = s.event;
    if (ev && ev.persisted) {
      if (s.joining || s.restoring) return;
      var self = this;
      this.setState({ joinError: '', joining: true });
      joinStoredEvent(ev.id, n).then(
        function (r) {
          if (!r.ok) {
            self.setState({ joining: false, joinError: r.status === 409 ? "That name's already taken." : r.message });
            return;
          }
          saveGuestCredential(ev.id, r.credential);
          var responses = (ev.responses || []).slice();
          if (
            !responses.some(function (x) {
              return x.who.toLowerCase() === r.name.toLowerCase();
            })
          )
            responses.push({ who: r.name, role: 'guest' });
          var patch = Object.assign(respondFor(Object.assign({}, ev, { responses: responses }), 'guest', r.name), {
            screen: 'respond',
            joinError: '',
            joining: false,
            participantId: r.participantId,
            errors: {},
            formError: '',
            noneWork: false,
            phase: 'editing',
            dirty: false,
            editing: false,
          });
          patch.baseline = self.baselineOf(patch);
          self.go(patch);
        },
        function () {
          self.setState({ joining: false, joinError: "We couldn't reach the server. Check your connection and try again." });
        },
      );
      return;
    }
    var taken = (ev.responses || []).some(function (r) {
      return r.who.toLowerCase() === n.toLowerCase();
    });
    if (taken) {
      this.setState({ joinError: 'Someone with that name has already responded. Try adding an initial.' });
      return;
    }
    this.go(
      Object.assign(respondFor(ev, 'guest', n), {
        screen: 'respond',
        joinError: '',
        errors: {},
        formError: '',
        noneWork: false,
        phase: 'editing',
        dirty: false,
        editing: false,
      }),
    );
  }

  previewGuest() {
    this.go(Object.assign(respondFor(this.state.event, 'guest', ''), { screen: 'join', joinName: '', joinError: '', reminderOpen: false }));
  }

  joinVals(s) {
    var self = this;
    return Object.assign(this.switchVals(s), {
      joinName: s.joinName,
      setJoinName: function (e) {
        self.setState({ joinName: e.target.value, joinError: '' });
      },
      joinKey: function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          self.joinContinue();
        }
      },
      hasJoinError: !!s.joinError,
      joinError: s.joinError,
      joinContinue: function () {
        self.joinContinue();
      },
      joinDisabled: !!s.joining || !!s.restoring,
      joinLabel: s.joining ? 'Joining…' : 'Continue',
    });
  }
}
