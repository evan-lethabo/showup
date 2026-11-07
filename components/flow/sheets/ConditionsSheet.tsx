// Ported mechanically from Main.dc.html (<sc-if> section). Values and handlers come from the page's
// renderVals() (see lib/ui), exactly as the template's {{holes}} did.
import { Fragment } from 'react';

export default function ConditionsSheet({ v }: { v: any }) {
  return (
    <>
      <div className={v.overlayCls} onKeyDown={v.sheetKey}>
        <button type="button" className="scrim" tabIndex={-1} aria-label="Close" onClick={v.closeSheet} />
        <div className="sheet glass" role="dialog" aria-modal="true" aria-labelledby="cond-title" tabIndex={-1} ref={v.setSheetEl}>
          <div className="sheet-intro">
            <h2 id="cond-title" className="section-h">
              What would make you go?
            </h2>
            <p>Only you see this. In small groups, the final group may hint at it.</p>
          </div>
          <textarea
            className="input sheet-input"
            rows={2}
            aria-label="What would make you go"
            placeholder="e.g. if Sam's going and there's at least 5 of us"
            value={v.sheetText}
            onChange={v.onSheetText}
          />
          {v.showOfflineNote ? (
            <>
              <p className="quiet">Interpreted offline — not by AI. Check the read-back before saving.</p>
            </>
          ) : null}
          {v.showInterpretBtn ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={v.interpretSheet}
                disabled={v.interpretBusy}
                aria-busy={v.interpretBusy}
              >
                {v.interpretLabel}
              </button>
            </>
          ) : null}
          {v.showLines ? (
            <ul className="cond-lines" role="status">
              {v.sheetLines.map((line: string, i: number) => (
                <li key={i} className="cond-text">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          {v.showNoCondition ? (
            <div className="cond-none">
              <p className="cond-text" role="status">
                We didn&apos;t find anything that changes how you&apos;re counted.
              </p>
              <div className="btn-row">
                <button type="button" className="btn btn-secondary btn-sm" onClick={v.noConditionYes}>
                  Yes
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={v.rephraseSheet}>
                  Rephrase
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={v.noConditionTentative}>
                  Count me as tentative
                </button>
              </div>
            </div>
          ) : null}
          {v.showReadback ? (
            <>
              <p className="cond-text" role="status">
                {v.sheetReadback}
              </p>
            </>
          ) : null}
          {v.showChips ? (
            <>
              <div className="cchips" aria-live="polite">
                {(v.sheetChips || []).map((c: any, $index: number) => (
                  <Fragment key={$index}>
                    <div className={c.cls}>
                      <button type="button" className="cchip-btn" aria-expanded={c.expanded} onClick={c.toggle}>
                        {c.label}
                      </button>
                      {c.editing ? (
                        <>
                          <div className="cchip-edit">
                            {c.showOptions ? (
                              <>
                                {(c.options || []).map((o: any, $index: number) => (
                                  <Fragment key={$index}>
                                    <button type="button" className={o.cls} aria-pressed={o.pressed} onClick={o.pick}>
                                      {o.name}
                                    </button>
                                  </Fragment>
                                ))}
                              </>
                            ) : null}
                            {c.showFreeName ? (
                              <>
                                <input
                                  className="input-line chip-input"
                                  type="text"
                                  maxLength={30}
                                  aria-label="Name"
                                  value={c.name}
                                  onChange={c.setName}
                                />
                              </>
                            ) : null}
                            {c.isMin ? (
                              <>
                                <div className="stepper">
                                  <button type="button" className="step-btn" aria-label="Fewer people" onClick={c.dec} disabled={c.atMinN}>
                                    −
                                  </button>
                                  <span className="step-val" aria-live="polite">
                                    {c.n}+ people
                                  </span>
                                  <button type="button" className="step-btn" aria-label="More people" onClick={c.inc} disabled={c.atMaxN}>
                                    +
                                  </button>
                                </div>
                              </>
                            ) : null}
                            <button type="button" className="text-btn add-range" onClick={c.remove}>
                              Remove
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </Fragment>
                ))}
              </div>
            </>
          ) : null}
          {v.showQuiet ? (
            <>
              <p className="quiet" role="status">
                {v.quietLine}
              </p>
            </>
          ) : null}
          <div className="sheet-actions">
            <button type="button" className="text-btn text-btn-muted" onClick={v.closeSheet}>
              Cancel
            </button>
            {v.showRephrase ? (
              <button type="button" className="text-btn" onClick={v.rephraseSheet}>
                Rephrase
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={v.confirmSheet} disabled={v.cannotConfirm}>
              Looks right
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
