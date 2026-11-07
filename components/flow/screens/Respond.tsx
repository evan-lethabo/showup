// Ported mechanically from Main.dc.html (<sc-if> section). Values and handlers come from the page's
// renderVals() (see lib/ui), exactly as the template's {{holes}} did.
import TimeWheels from '../../shared/TimeWheels';
import { Fragment } from 'react';

export default function Respond({ v }: { v: any }) {
  return (
    <>
      <header className="wrap header">
        <button type="button" className="wordmark" onClick={v.goHome} aria-label="showup. home">
          showup
          <span className="dot">.</span>
        </button>
      </header>
      <main className="wrap page-main">
        <div className={`col-grid ${v.screenCls}`}>
          <div className="col-intro">
            {v.editingResponse ? (
              <>
                <button type="button" className="text-btn back-link" onClick={v.backToEvent}>
                  Back to event
                </button>
              </>
            ) : null}
            <p className="kicker vt-title">{v.eventName}</p>
            {v.showStartLine ? (
              <>
                <p className="eyebrow s-head">Start with yours.</p>
              </>
            ) : null}
            <h1 className="display s-head" tabIndex={-1} ref={v.setHeadingEl}>
              Which times work for you?
            </h1>
          </div>
          <section className="col-main s-body" aria-label="Candidate days">
            <p className="sr" aria-live="polite">
              {v.liveMsg}
            </p>
            <div className="days">
              {(v.slots || []).map((d: any, $index: number) => (
                <Fragment key={$index}>
                  <div className={d.cardCls}>
                    <div className="day-top">
                      <h2 className="day-title" id={d.titleId}>
                        <span className="t-long">{d.title}</span>
                        <span className="t-short">{d.short}</span>
                      </h2>
                      <div className="seg glass-control avail-seg" role="group" aria-labelledby={d.titleId}>
                        <span className={d.availThumbCls} style={{ transform: `translateX(${d.availThumbX}%)` }} aria-hidden="true">
                          <span className="t-silver glass-silver" />
                          <span className="t-red glass-red" />
                        </span>
                        <button type="button" className={d.notFreeCls} aria-pressed={d.notFreePressed} onClick={d.setNotFree} ref={d.setEl}>
                          Not free
                        </button>
                        <button type="button" className={d.freeCls} aria-pressed={d.freePressed} onClick={d.setFree}>
                          Free
                        </button>
                        <button type="button" className={d.favCls} aria-pressed={d.favPressed} onClick={d.setFav}>
                          Favourite
                        </button>
                      </div>
                    </div>
                    <div className={d.revealCls}>
                      <div className="reveal-inner">
                        <div className="reveal-body">
                          <button
                            type="button"
                            className={d.barCls}
                            onClick={d.tapBar}
                            onPointerDown={d.barDown}
                            onPointerMove={d.barMove}
                            onPointerUp={d.barUp}
                            onPointerCancel={d.barCancel}
                            onLostPointerCapture={d.barUp}
                            aria-label={d.barAria}
                          >
                            <span className="tl-track">
                              {(d.fills || []).map((f: any, $index: number) => (
                                <Fragment key={$index}>
                                  <span className={f.cls} style={{ left: `calc(${f.left}% + 3px)`, width: `calc(${f.width}% - 6px)` }} />
                                </Fragment>
                              ))}
                            </span>
                            <span className="tl-hours" aria-hidden="true">
                              {(d.ticks || []).map((t: any, $index: number) => (
                                <Fragment key={$index}>
                                  <span className={t.cls} style={{ left: `${t.left}%` }}>
                                    {t.label}
                                  </span>
                                </Fragment>
                              ))}
                            </span>
                          </button>
                          <div className="ranges">
                            {(d.ranges || []).map((r: any, $index: number) => (
                              <Fragment key={$index}>
                                <div className="range-row">
                                  <button
                                    type="button"
                                    className="range-label glass-control"
                                    aria-expanded={r.expanded}
                                    aria-label={r.aria}
                                    onClick={r.toggleWheels}
                                  >
                                    {r.label}
                                  </button>
                                  {r.canRemove ? (
                                    <>
                                      <button type="button" className="text-btn add-range" onClick={r.remove}>
                                        Remove
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                                {r.wheelsOpen ? (
                                  <>
                                    <div className="range-wheels">
                                      <TimeWheels wheels={r.wheels} />
                                      <button type="button" className="text-btn wheel-done" onClick={r.toggleWheels}>
                                        Done
                                      </button>
                                    </div>
                                  </>
                                ) : null}
                              </Fragment>
                            ))}
                            {d.canAddRange ? (
                              <>
                                <button type="button" className="text-btn add-range" onClick={d.addRange}>
                                  Add another time
                                </button>
                              </>
                            ) : null}
                          </div>
                          <div className="will-row">
                            <p className="will-q" id={d.qId}>
                              Would you actually go?
                            </p>
                            <div className="seg glass-control" role="group" aria-labelledby={d.qId}>
                              <span className={d.willThumbCls} style={{ transform: `translateX(${d.willThumbX}%)` }} aria-hidden="true">
                                <span className="t-silver glass-silver" />
                                <span className="t-red glass-red" />
                              </span>
                              <button type="button" className={d.yesCls} aria-pressed={d.yesPressed} onClick={d.pickYes}>
                                Yes
                              </button>
                              <button type="button" className={d.ifCls} aria-pressed={d.ifPressed} onClick={d.pickIf}>
                                If…
                              </button>
                              <button type="button" className={d.noCls} aria-pressed={d.noPressed} onClick={d.pickNo}>
                                No
                              </button>
                            </div>
                          </div>
                          {d.showError ? (
                            <>
                              <p className="field-error">Let us know whether you'd actually go.</p>
                            </>
                          ) : null}
                          {d.showConds ? (
                            <>
                              <div className="cond-sum">
                                <p className="cond-text">
                                  <span className="label">Only you see this: </span>
                                  {d.condText}
                                </p>
                                <div className="cond-actions">
                                  <button type="button" className="text-btn" onClick={d.editConds}>
                                    Edit
                                  </button>
                                  {d.canReuse ? (
                                    <>
                                      <button type="button" className="text-btn" onClick={d.reuse}>
                                        Use this for my other times too
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                                {d.hasApplied ? (
                                  <>
                                    <p className="small" role="status">
                                      {d.appliedNote}
                                    </p>
                                  </>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
            <div className="r-actions">
              {v.noneWork ? (
                <>
                  <div className="none-note" role="status">
                    <p>You're letting the organiser know none of these times work.</p>
                    <button type="button" className="text-btn" onClick={v.undoNone}>
                      Undo
                    </button>
                  </div>
                </>
              ) : null}
              {v.hasFormError ? (
                <>
                  <p className="form-error" role="alert">
                    {v.formError}
                  </p>
                </>
              ) : null}
              {v.showSubmitRow ? (
                <>
                  <div className="btn-row">
                    <button type="button" className="btn btn-primary" onClick={v.submit} disabled={v.saving} aria-busy={v.savingStr}>
                      {v.submitLabel}
                    </button>
                    {v.showNoneBtn ? (
                      <>
                        <button type="button" className="text-btn" onClick={v.markNone}>
                          None of these work for me
                        </button>
                      </>
                    ) : null}
                  </div>
                  {v.showDirtyNote ? (
                    <>
                      <p className="small">You've changed your answers since saving.</p>
                    </>
                  ) : null}
                </>
              ) : null}
              {v.showSaved ? (
                <>
                  <div className="saved" role="status">
                    <p className="label-red">Saved</p>
                    <h2 className="section-h" tabIndex={-1} ref={v.setSavedEl}>
                      Your response is in.
                    </h2>
                    <p>{v.savedSummary}</p>
                    <div className="btn-row">
                      {v.isPersisted ? (
                        <>
                          <button type="button" className="btn btn-primary" onClick={v.backToEventSaved}>
                            Back to event
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Plain <a>, not next/link: a full page load keeps Main's and Event's CSS apart. */}
                          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                          <a className="btn btn-primary" href="/example" onClick={v.saveForReturn}>
                            Continue to event
                          </a>
                        </>
                      )}
                      <button type="button" className="btn btn-secondary" onClick={v.editResponse}>
                        Edit response
                      </button>
                    </div>
                    {v.isPersisted ? null : (
                      <>
                        <p className="small">
                          Prototype: the event page shows a fixed sample with fictional responses. Your answers here don't change it.
                        </p>
                      </>
                    )}
                  </div>
                </>
              ) : null}
              {v.canSwitchGuest && v.confirmSwitch ? (
                <div className="none-note">
                  <p role="alert">Discard your unsaved changes?</p>
                  <div className="btn-row">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={v.cancelSwitch}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={v.discardSwitch}>
                      Discard
                    </button>
                  </div>
                </div>
              ) : null}
              {v.canSwitchGuest && !v.confirmSwitch ? (
                <div>
                  <button type="button" className="text-btn text-btn-muted" onClick={v.switchGuest}>
                    {v.switchLabel}
                  </button>
                </div>
              ) : null}
            </div>
          </section>
          <aside className="r-rail s-body" aria-label="How this works">
            <div className="rail-inner">
              <p className="label">How this works</p>
              <ol className="steps">
                <li className="step">
                  <span className="step-n">01</span>
                  <div>
                    <p className="step-t">Mark when you're free</p>
                    <p className="step-b">Every time you could physically make.</p>
                  </div>
                </li>
                <li className="step">
                  <span className="step-n">02</span>
                  <div>
                    <p className="step-t">Say if you'd actually go</p>
                    <p className="step-b">Being free isn't the same as wanting to go.</p>
                  </div>
                </li>
                <li className="step">
                  <span className="step-n">03</span>
                  <div>
                    <p className="step-t">Add what it depends on</p>
                    <p className="step-b">Optional, and only you can see it.</p>
                  </div>
                </li>
              </ol>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
