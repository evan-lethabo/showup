// Ported mechanically from Main.dc.html (<sc-if> section). Values and handlers come from the page's
// renderVals() (see lib/ui), exactly as the template's {{holes}} did.
import TimeWheels from '../../shared/TimeWheels';
import { Fragment } from 'react';

export default function Create({ v }: { v: any }) {
  return (
    <>
      <header className="wrap header">
        <button type="button" className="wordmark" onClick={v.goHome} aria-label="showup. home">
          showup
          <span className="dot">.</span>
        </button>
        {v.isEditingEvent ? (
          <button type="button" className="text-btn" onClick={v.cancelEditEvent}>
            Cancel
          </button>
        ) : null}
      </header>
      <main className="wrap page-main">
        <div className="col-grid">
          <div className={`col-main c-col ${v.screenCls}`}>
            <div>
              <label className="sr" htmlFor="c-name">
                Event name
              </label>
              <input
                id="c-name"
                className="name-title vt-title"
                type="text"
                maxLength={60}
                value={v.name}
                onChange={v.setName}
                ref={v.setHeadingEl}
              />
              {v.hasNameError ? (
                <>
                  <p className="field-error" role="alert">
                    {v.nameError}
                  </p>
                </>
              ) : null}
            </div>
            <section className="c-sec s-head" aria-labelledby="days-h">
              <div className="c-sec-head">
                <h2 id="days-h" className="comp-h">
                  Which days?
                </h2>
                <p className="small" aria-live="polite">
                  {v.daysCount}
                </p>
              </div>
              <div className="cal glass">
                <div className="cal-head">
                  {v.calHasPrev ? (
                    <>
                      <button type="button" className="text-btn cal-nav" onClick={v.calPrev} aria-label={v.calPrevAria}>
                        {v.calPrevLabel}
                      </button>
                    </>
                  ) : null}
                  {v.calNoPrev ? (
                    <>
                      <span className="cal-nav-spacer" aria-hidden="true" />
                    </>
                  ) : null}
                  <p className="cal-title" aria-live="polite">
                    {v.calTitle}
                  </p>
                  <button type="button" className="text-btn cal-nav" onClick={v.calNext} aria-label={v.calNextAria}>
                    {v.calNextLabel}
                  </button>
                </div>
                <div className="cal-dow" aria-hidden="true">
                  <span>M</span>
                  <span>T</span>
                  <span>W</span>
                  <span>T</span>
                  <span>F</span>
                  <span>S</span>
                  <span>S</span>
                </div>
                <div className="cal-grid" role="group" aria-labelledby="days-h">
                  {(v.calCells || []).map((cc: any, $index: number) => (
                    <Fragment key={$index}>
                      {cc.isBlank ? (
                        <>
                          <span className="cal-blank" aria-hidden="true" />
                        </>
                      ) : null}
                      {cc.isDay ? (
                        <>
                          <button
                            type="button"
                            className={cc.cls}
                            aria-pressed={cc.pressed}
                            aria-label={cc.aria}
                            disabled={cc.disabled}
                            onClick={cc.toggle}
                          >
                            {cc.d}
                          </button>
                        </>
                      ) : null}
                    </Fragment>
                  ))}
                </div>
              </div>
            </section>
            <div className="s-body">
              <section className="c-sec" aria-labelledby="time-h">
                <h2 id="time-h" className="comp-h">
                  What time?
                </h2>
                <div className="time-mode" role="group" aria-label="Apply time to">
                  <button type="button" className={v.timeAllCls} aria-pressed={v.timeAllPressed} onClick={v.setTimeAll}>
                    Same for all days
                  </button>
                  <button type="button" className={v.timeCustomCls} aria-pressed={v.timeCustomPressed} onClick={v.setTimeCustom}>
                    Custom
                  </button>
                </div>
                {v.isCustomTime && (
                  <div className="field">
                    <label className="field-label" htmlFor="c-time-day">
                      Set the time for
                    </label>
                    <select
                      id="c-time-day"
                      className="select"
                      value={v.timeDayValue}
                      onChange={v.setTimeDay}
                      disabled={!v.timeDayOptions.length}
                    >
                      {v.timeDayOptions.length ? (
                        v.timeDayOptions.map((o: any) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))
                      ) : (
                        <option value="">Pick days first</option>
                      )}
                    </select>
                  </div>
                )}
                <TimeWheels wheels={v.createWheels} />
                <p className="window-len" aria-live="polite">
                  {v.windowLen}
                </p>
              </section>
              <section className="c-sec">
                <div className="field">
                  <label className="field-label" htmlFor="c-length">
                    How long is the event?
                  </label>
                  <select id="c-length" className="select" value={v.durationValue} onChange={v.setDuration}>
                    {(v.durationOptions || []).map((o: any) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="small">Optional. With no length, people only need to be free when it starts.</p>
                </div>
              </section>
              <section className="c-sec">
                <div className="field org-field">
                  <label className="field-label" htmlFor="c-org">
                    Your name
                  </label>
                  <input
                    id="c-org"
                    className="input-line"
                    type="text"
                    maxLength={30}
                    autoComplete="given-name"
                    value={v.orgName}
                    onChange={v.setOrgName}
                  />
                </div>
              </section>
              <div className="more">
                <button type="button" className="text-btn text-btn-muted" aria-expanded={v.moreExpanded} onClick={v.toggleMore}>
                  More options
                </button>
                {v.moreOpen ? (
                  <>
                    <div className="more-body">
                      <div className="field">
                        <label className="field-label" htmlFor="c-note">
                          Note
                        </label>
                        <textarea id="c-note" className="input" rows={3} value={v.note} onChange={v.setNote} />
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
              <div className="c-actions">
                <button type="button" className="btn btn-primary" onClick={v.createEvent} disabled={v.createDisabled}>
                  {v.createLabel}
                </button>
                {v.cannotCreate ? (
                  <>
                    <p className="small">{v.createHint}</p>
                  </>
                ) : null}
                {v.hasEditResetWarning ? (
                  <p className="small" role="status">
                    {v.editResetWarning}
                  </p>
                ) : null}
                {v.hasCreateError ? (
                  <p className="field-error" role="alert">
                    {v.createError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
