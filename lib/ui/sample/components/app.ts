// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/sample/components/app.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
/* App shell: render values */
export class AppMixin {
  shellVals(s) {
    var p = s.proposal;
    return {
      statusLabel: p ? 'Time proposed (prototype)' : 'Collecting responses',
    };
  }

  renderVals() {
    var s = this.state;
    return Object.assign({}, this.shellVals(s), this.resultsVals(s), this.inviteVals(s), this.proposeVals(s));
  }
}
