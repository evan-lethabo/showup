// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/sample/components/results.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { dotRowsFrom } from '../../utils/dot-rows';
import { DOT_DAYS, SLOT_INFO, PEOPLE, WAITING } from '../constants';
import { prettyDate } from '../helpers';
/* Results: dot rows, who responded, proposal status */
export class ResultsMixin {
  resultsVals(s) {
    var self = this;
    var p = s.proposal;
    var roster = !!this.props.showRoster;
    var people = PEOPLE.map(function (n) {
      return { name: n, waiting: false };
    });
    if (roster)
      people = people.concat(
        WAITING.map(function (n) {
          return { name: n, waiting: true };
        }),
      );
    return {
      dotRows: dotRowsFrom(DOT_DAYS, 'sat', s.grown, s.settled),
      people: people.map(function (pp) {
        var on = s.activePerson === pp.name;
        return {
          initial: pp.name.charAt(0),
          tip: pp.waiting ? pp.name + ' · not yet' : pp.name,
          aria: pp.waiting ? pp.name + ', not responded yet' : pp.name,
          cls: 'av glass-silver' + (pp.waiting ? ' is-waiting' : '') + (on ? ' is-on' : ''),
          pressed: on ? 'true' : 'false',
          toggle: function () {
            self.setState({ activePerson: self.state.activePerson === pp.name ? null : pp.name });
          },
        };
      }),
      proposeLabel: p ? 'Change proposal' : 'Propose a time',
      hasProposal: !!p,
      proposalText: p
        ? SLOT_INFO[p.time].label + '. Replies by ' + prettyDate(p.deadline) + '. Goes ahead if at least ' + p.min + ' people commit.'
        : '',
      withdraw: function () {
        self.setState({ proposal: null });
      },
    };
  }
}
