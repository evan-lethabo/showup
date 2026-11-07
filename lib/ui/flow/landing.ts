// @ts-nocheck
// Ported verbatim from archive/showup-standalone/js/components/landing.js. Only the export/import lines were added
// (the original files shared globals through classic <script> tags). Types come later.
import { loadEventData } from '../services/storage';
import { respondFor } from '../state';
import { loadOrganiserEvents } from '../services/organiser-events';
import { isoFromDate, slotFromIso } from '../utils/dates';
function tokenFromAdminUrl(url) {
  try {
    return new URL(url, 'http://local').searchParams.get('k');
  } catch (e) {
    return null;
  }
}
/* Landing screen */
export class LandingMixin {
  next() {
    var n = (this.state.name || '').trim();
    if (!n) {
      this.setState({ nameError: 'Give it a name to continue.' });
      return;
    }
    this.go({ name: n, nameError: '', screen: 'create' });
  }
  openMyEvent(entry) {
    var ev = loadEventData(entry.id);
    if (!ev) {
      this.setState({
        myEvents: (this.state.myEvents || []).filter(function (x) {
          return x !== entry;
        }),
      });
      return;
    }
    var mode = entry.role === 'organising' ? 'organiser' : 'guest';
    this.go(
      Object.assign(respondFor(ev, mode, entry.who || ev.organiser), { screen: 'event', name: ev.name, editing: false, phase: 'saved' }),
    );
  }

  landingVals(s) {
    var self = this;
    // Only real events created on this device, each opening its organiser link.
    var myEvents = (s.screen === 'landing' ? loadOrganiserEvents() : []).slice(0, 5).map(function (x) {
      var made = new Date(x.createdAt);
      return {
        key: x.eventId,
        name: x.title,
        href: x.adminUrl,
        roleLabel: 'Organising',
        onCancel: function () {
          self.openConfirm('cancel', { id: x.eventId, token: tokenFromAdminUrl(x.adminUrl) });
        },
        status: isNaN(made.getTime()) ? '' : 'Created ' + slotFromIso(isoFromDate(made)).short,
      };
    });
    return {
      name: s.name,
      setName: function (e) {
        self.setState({ name: e.target.value, nameError: '' });
      },
      nameKey: function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          self.next();
        }
      },
      hasNameError: !!s.nameError,
      nameError: s.nameError,
      next: function () {
        self.next();
      },
      hasMyEvents: s.screen === 'landing' && myEvents.length > 0,
      myEvents: myEvents,
    };
  }
}
