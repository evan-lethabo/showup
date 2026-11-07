// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/sample/components/propose-sheet.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { SLOT_INFO } from '../constants';
import { dayBefore, prettyDate, reducedMotion } from '../helpers';
/* Propose-a-time sheet */
export class ProposeSheetMixin {
  openPropose() {
    var p = this.state.proposal;
    this.setState({
      proposeOpen: true,
      proposeClosing: false,
      formError: '',
      form: p ? Object.assign({}, p) : { time: 'sat', deadline: '2026-10-22', min: '4' },
    });
  }

  closePropose(extra) {
    var self = this;
    if (!this.state.proposeOpen || this.state.proposeClosing) return;
    this.setState({ proposeClosing: true });
    this.timers.close = setTimeout(
      function () {
        self.setState(Object.assign({ proposeOpen: false, proposeClosing: false, formError: '' }, extra || {}));
      },
      reducedMotion() ? 150 : 200,
    );
  }

  setForm(p) {
    this.setState({ form: Object.assign({}, this.state.form, p), formError: '' });
  }

  saveProposal() {
    var f = this.state.form;
    var max = dayBefore(SLOT_INFO[f.time].date);
    if (!f.deadline) {
      this.setState({ formError: 'Choose a reply-by date.' });
      return;
    }
    if (f.deadline < '2026-10-17' || f.deadline > max) {
      this.setState({ formError: 'Choose a reply-by date between today and ' + prettyDate(max) + ', before the event starts.' });
      return;
    }
    var n = parseInt(f.min, 10);
    if (isNaN(n) || n < 2 || n > 8 || String(n) !== String(f.min).trim()) {
      this.setState({ formError: 'Choose a minimum from 2 to 8 people.' });
      return;
    }
    this.closePropose({ proposal: { time: f.time, deadline: f.deadline, min: String(n) }, reminderOpen: false });
  }

  proposeVals(s) {
    var self = this;
    var f = s.form;
    return {
      proposeOpen: s.proposeOpen,
      overlayCls: 'overlay' + (s.proposeClosing ? ' is-closing' : ''),
      openPropose: function () {
        self.openPropose();
      },
      closePropose: function () {
        self.closePropose();
      },
      setSheetEl: function (el) {
        self.sheetEl = el;
      },
      sheetKey: function (e) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          self.closePropose();
        }
      },
      formTime: f.time,
      formDeadline: f.deadline,
      formMin: f.min,
      deadlineMax: dayBefore(SLOT_INFO[f.time].date),
      setTime: function (e) {
        self.setForm({ time: e.target.value });
      },
      setDeadline: function (e) {
        self.setForm({ deadline: e.target.value });
      },
      setMin: function (e) {
        self.setForm({ min: e.target.value });
      },
      hasFormError: !!s.formError,
      formError: s.formError,
      saveProposal: function () {
        self.saveProposal();
      },
    };
  }
}
