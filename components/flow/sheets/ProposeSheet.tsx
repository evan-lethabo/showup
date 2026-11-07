// Ported mechanically from Main.dc.html (<sc-if> section). Values and handlers come from the page's
// renderVals() (see lib/ui), exactly as the template's {{holes}} did.
import { Fragment } from 'react';

export default function ProposeSheet({ v }: { v: any }) {
  return (
    <>
      <div className={v.propOverlayCls} onKeyDown={v.propKey}>
        <button type="button" className="scrim" tabIndex={-1} aria-label="Close" onClick={v.closePropose} />
        <div className="sheet glass" role="dialog" aria-modal="true" aria-labelledby="prop-title" tabIndex={-1} ref={v.setPropEl}>
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
            <select id="p-time" className="select" value={v.propTime} onChange={v.setPropTime}>
              {(v.propOptions || []).map((po: any, $index: number) => (
                <Fragment key={$index}>
                  <option value={po.id}>{po.label}</option>
                </Fragment>
              ))}
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
              min={v.propMin}
              max={v.propMax}
              value={v.propDeadline}
              onChange={v.setPropDeadline}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="p-min">
              Minimum attendance
            </label>
            <div className="inline-field">
              <span>Go ahead if at least</span>
              <input
                id="p-min"
                className="num"
                type="number"
                min="2"
                max="50"
                inputMode="numeric"
                value={v.propMin}
                onChange={v.setPropMin}
              />
              <span>people commit.</span>
            </div>
          </div>
          {v.hasPropError ? (
            <>
              <p className="form-error" role="alert">
                {v.propError}
              </p>
            </>
          ) : null}
          <p className="sheet-note">Prototype: saving only updates this page. No one is notified and no confirmation round starts.</p>
          <div className="sheet-actions">
            <button type="button" className="text-btn text-btn-muted" onClick={v.closePropose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={v.saveProposal}>
              Save proposal
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
