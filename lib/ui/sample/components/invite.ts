// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/sample/components/invite.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { REMINDER, LINK } from '../constants';
/* Invite link and reminder (copy to clipboard) */
export class InviteMixin {
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

  inviteVals(s) {
    var self = this;
    return {
      linkMsg: s.linkMsg,
      copyLink: function () {
        self.copy(
          LINK,
          self.linkEl,
          'linkMsg',
          'Link copied.',
          "Couldn't copy automatically. The link is selected, so copy it from there.",
        );
      },
      setLinkEl: function (el) {
        self.linkEl = el;
      },
      selectAll: function (e) {
        try {
          e.target.select();
        } catch (err) {}
      },

      reminderOpen: s.reminderOpen,
      reminderExpanded: s.reminderOpen ? 'true' : 'false',
      reminderText: REMINDER,
      remMsg: s.remMsg,
      noop: function () {},
      toggleReminder: function () {
        self.setState({ reminderOpen: !self.state.reminderOpen, remMsg: '' });
      },
      copyReminder: function () {
        self.copy(
          REMINDER,
          self.remEl,
          'remMsg',
          'Reminder copied.',
          "Couldn't copy automatically. The text is selected, so copy it from the box.",
        );
      },
      setRemEl: function (el) {
        self.remEl = el;
      },
    };
  }
}
