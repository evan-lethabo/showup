// Ported mechanically from Main.dc.html (whole template). Values and handlers come from the page's
// renderVals() (see lib/ui), exactly as the template's {{holes}} did.
import Landing from './screens/Landing';
import Create from './screens/Create';
import Join from './screens/Join';
import Respond from './screens/Respond';
import EventPage from './screens/EventPage';
import ConditionsSheet from './sheets/ConditionsSheet';
import ProposeSheet from './sheets/ProposeSheet';
import ConfirmSheet from './sheets/ConfirmSheet';
import ProposeTimeSheet from './sheets/ProposeTimeSheet';

export default function FlowView({ v }: { v: any }) {
  return (
    <>
      <div className="su">
        <div className="ambient" aria-hidden="true" />
        <div className="layer">
          {v.isLanding ? <Landing v={v} /> : null}
          {v.isCreate ? <Create v={v} /> : null}
          {v.isJoin ? <Join v={v} /> : null}
          {v.isRespond ? <Respond v={v} /> : null}
          {v.isEvent ? <EventPage v={v} /> : null}
          {v.sheetOpen ? <ConditionsSheet v={v} /> : null}
          {v.proposeOpen ? <ProposeSheet v={v} /> : null}
          {v.roundSheetOpen ? <ProposeTimeSheet v={v} /> : null}
          {v.confirmOpen ? <ConfirmSheet v={v} /> : null}
        </div>
      </div>
    </>
  );
}
