// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/components/app.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { FAMILY, STORE_KEY, DOTS_KEY } from '../config';
import { loadMyEvents, recordMyEvent } from '../services/storage';
import { baseState } from '../state';
import { eventDetails } from '../utils/persisted-event';
/* App shell: state, lifecycle, screen changes, render values */
export class AppMixin {
  reduced() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }
  motion() {
    return this.reduced() ? 'auto' : 'smooth';
  }

  maybeGrowDiscs() {
    var self = this;
    if (this.state.discsGrown || this.state.screen !== 'event' || this.timers.grow) return;
    this.timers.grow = setTimeout(function () {
      self.setState({ discsGrown: true });
      self.timers.settle = setTimeout(function () {
        self.setState({ dotsSettled: true });
      }, 1200);
      try {
        window.sessionStorage.setItem(DOTS_KEY, '1');
      } catch (e) {}
    }, 80);
  }

  /* Screen changes: View Transitions where supported, otherwise a fade. */
  go(patch) {
    var self = this;
    var apply = function (anim, done) {
      self.setState(Object.assign({}, patch, { leaving: false, anim: anim }), done);
    };
    if (document.startViewTransition) {
      try {
        document.startViewTransition(function () {
          return new Promise(function (res) {
            var fin = false;
            var f = function () {
              if (!fin) {
                fin = true;
                res();
              }
            };
            apply('vt', f);
            setTimeout(f, 250);
          });
        });
        return;
      } catch (e) {}
    }
    if (this.reduced()) {
      apply('fade');
      return;
    }
    this.setState({ leaving: true });
    setTimeout(function () {
      apply('fade');
    }, 160);
  }

  goHome() {
    var keep = { discsGrown: this.state.discsGrown };
    this.go(Object.assign(baseState(), keep, { myEvents: loadMyEvents() || [] }));
  }

  saveForReturn() {
    try {
      var s = Object.assign({}, this.state, {
        sheet: null,
        sheetClosing: false,
        proposeOpen: false,
        proposeClosing: false,
        leaving: false,
        anim: '',
        family: FAMILY,
      });
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (e) {}
    if (this.state.mode === 'participant' && this.state.phase === 'saved') {
      recordMyEvent({ id: 'sample', name: 'Weekend plans', role: 'invited', who: 'You', status: 'Collecting responses', sample: true });
    }
  }

  segThumb(idx, red) {
    return { cls: 'seg-thumb' + (idx < 0 ? ' is-empty' : '') + (red ? ' is-red' : ''), x: String(Math.max(0, idx) * 100) };
  }
  screenClsOf(s) {
    return 'screen' + (s.leaving ? ' is-leaving' : '') + (s.anim === 'vt' ? ' is-entering-vt' : s.anim === 'fade' ? ' is-entering' : '');
  }

  shellVals(s, x) {
    var self = this;
    var ev = x.ev,
      isEvent = x.isEvent;
    return {
      isLanding: s.screen === 'landing',
      isCreate: s.screen === 'create',
      isRespond: s.screen === 'respond',
      isJoin: s.screen === 'join',
      isEvent: isEvent,
      screenCls:
        'screen' + (s.leaving ? ' is-leaving' : '') + (s.anim === 'vt' ? ' is-entering-vt' : s.anim === 'fade' ? ' is-entering' : ''),
      setHeadingEl: function (el) {
        self.headingEl = el;
      },
      saveForReturn: function () {
        self.saveForReturn();
      },
      goHome: function () {
        self.goHome();
      },
      eventName: (ev && ev.name) || s.name || 'Your event',
      organiser: ev ? ev.organiser : '',
      hasEventDetails: !!(ev && ev.persisted),
      eventDetails: ev && ev.persisted ? eventDetails(ev) : '',
    };
  }

  renderVals() {
    var s = this.state;
    var x = this.eventContext(s);
    return Object.assign(
      {},
      this.shellVals(s, x),
      this.landingVals(s),
      this.createVals(s),
      this.joinVals(s),
      this.respondVals(s),
      this.eventVals(s, x),
      this.proposeVals(s, x),
      this.confirmVals(s),
      this.roundVals(s),
      this.sheetVals(s),
    );
  }
}
