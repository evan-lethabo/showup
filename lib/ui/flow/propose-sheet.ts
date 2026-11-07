// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/components/propose-sheet.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { clone } from '../utils/helpers';
import { todayIso } from '../utils/dates';
import { summarise } from '../utils/recommend';
import { recordMyEvent, saveEventData } from '../services/storage';
/* Propose-a-time sheet (in the flow) */
export class ProposeSheetMixin {
  openPropose() {
    var ev = this.state.event;
    var sum = summarise(ev);
    var first = (sum.best || sum.days[0]).slot;
    var today = todayIso();
    var def = ev.proposal
      ? clone(ev.proposal)
      : { slotId: first.id, deadline: this.dayBefore(first.iso) < today ? today : this.dayBefore(first.iso), min: '2' };
    this.setState({ proposeOpen: true, proposeClosing: false, propForm: def, propError: '' });
  }
  closePropose(extra) {
    var self = this;
    if (!this.state.proposeOpen || this.state.proposeClosing) return;
    this.setState({ proposeClosing: true });
    this.timers.close = setTimeout(
      function () {
        self.setState(Object.assign({ proposeOpen: false, proposeClosing: false, propError: '' }, extra || {}));
      },
      this.reduced() ? 150 : 200,
    );
  }
  setProp(p) {
    this.setState({ propForm: Object.assign({}, this.state.propForm, p), propError: '' });
  }
  saveProposal() {
    var f = this.state.propForm;
    var ev = clone(this.state.event);
    var sl = ev.slots.filter(function (x) {
      return x.id === f.slotId;
    })[0];
    var max = this.dayBefore(sl.iso);
    if (!f.deadline || f.deadline < todayIso() || f.deadline > max) {
      this.setState({ propError: 'Choose a reply-by date between today and the day before the event.' });
      return;
    }
    var n = parseInt(f.min, 10);
    if (isNaN(n) || n < 2 || String(n) !== String(f.min).trim()) {
      this.setState({ propError: 'Choose a minimum of at least 2 people.' });
      return;
    }
    ev.proposal = { slotId: f.slotId, deadline: f.deadline, min: String(n) };
    saveEventData(ev);
    recordMyEvent({ id: ev.id, name: ev.name, role: 'organising', who: this.state.myName, status: 'Time proposed' });
    this.closePropose({ event: ev, reminderOpen: false });
  }

  proposeVals(s, x) {
    var self = this;
    var ev = x.ev,
      sum = x.sum,
      best = x.best;
    var pf = s.propForm || {};
    var pfSlot =
      ev && pf.slotId
        ? ev.slots.filter(function (x) {
            return x.id === pf.slotId;
          })[0]
        : null;
    return {
      proposeOpen: s.proposeOpen,
      propOverlayCls: 'overlay' + (s.proposeClosing ? ' is-closing' : ''),
      openPropose: function () {
        self.openPropose();
      },
      closePropose: function () {
        self.closePropose();
      },
      setPropEl: function (el) {
        self.propEl = el;
      },
      propKey: function (e) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          self.closePropose();
        }
      },
      propOptions: ev
        ? sum.days.map(function (d) {
            return { id: d.slot.id, label: d.slot.title + (best && best.slot.id === d.slot.id ? ' (best so far)' : '') };
          })
        : [],
      propTime: pf.slotId || '',
      propDeadline: pf.deadline || '',
      propMin: pf.min || '2',
      propMin: todayIso(),
      propMax: pfSlot ? this.dayBefore(pfSlot.iso) : '',
      setPropTime: function (e) {
        self.setProp({ slotId: e.target.value });
      },
      setPropDeadline: function (e) {
        self.setProp({ deadline: e.target.value });
      },
      setPropMin: function (e) {
        self.setProp({ min: e.target.value });
      },
      hasPropError: !!s.propError,
      propError: s.propError,
      saveProposal: function () {
        self.saveProposal();
      },
    };
  }
}
