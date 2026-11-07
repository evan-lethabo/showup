// Ported mechanically from Event.dc.html (<sc-if> section). Values and handlers come from the page's
// renderVals() (see lib/ui), exactly as the template's {{holes}} did.

export default function ProposeSheet({ v }: { v: any }) {
  return (
    <>
      <div className={v.overlayCls} onKeyDown={v.sheetKey}>
        <button type="button" className="scrim" tabIndex={-1} aria-label="Close" onClick={v.closePropose} />
        <div className="sheet glass" role="dialog" aria-modal="true" aria-labelledby="prop-title" tabIndex={-1} ref={v.setSheetEl}>
          <div className="sheet-head">
            <p className="label">Weekend plans</p>
            <button type="button" className="text-btn" onClick={v.closePropose}>
              Close
            </button>
          </div>
          <div className="sheet-intro">
            <h2 id="prop-title" className="section-h">
              Propose a time
            </h2>
            <p>Pick a time and a reply deadline. People will be asked to commit, subject to their conditions.</p>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="p-time">
              Time
            </label>
            <select id="p-time" className="select" value={v.formTime} onChange={v.setTime}>
              <option value="sat">Saturday 24 Oct, 7 – 11pm (best so far)</option>
              <option value="fri">Friday 23 Oct, 7 – 11pm</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="p-deadline">
              Reply by
            </label>
            <input
              id="p-deadline"
              className="input-line"
              type="date"
              min="2026-10-17"
              max={v.deadlineMax}
              value={v.formDeadline}
              onChange={v.setDeadline}
            />
            <p className="small">Replies close at the end of this day, Sydney time.</p>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="p-min">
              Minimum attendance
            </label>
            <div className="inline-field">
              <span>Go ahead if at least</span>
              <input id="p-min" className="num" type="number" min="2" max="8" inputMode="numeric" value={v.formMin} onChange={v.setMin} />
              <span>people commit.</span>
            </div>
          </div>
          {v.hasFormError ? (
            <>
              <p className="form-error" role="alert">
                {v.formError}
              </p>
            </>
          ) : null}
          <p className="sheet-note">Prototype: saving only updates this page. No one is notified and no confirmation round starts.</p>
          <div className="sheet-actions">
            <button type="button" className="btn btn-primary" onClick={v.saveProposal}>
              Save proposal
            </button>
            <button type="button" className="btn btn-secondary" onClick={v.closePropose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
