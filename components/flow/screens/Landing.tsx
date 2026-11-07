// Ported mechanically from Main.dc.html (<sc-if> section). Values and handlers come from the page's
// renderVals() (see lib/ui), exactly as the template's {{holes}} did.
import Words from '../../shared/Words';

export default function Landing({ v }: { v: any }) {
  return (
    <>
      <header className="wrap header">
        <button type="button" className="wordmark" onClick={v.goHome} aria-label="showup. home">
          showup
          <span className="dot">.</span>
        </button>
      </header>
      <main className="wrap page-main l-main">
        <div className="col-grid">
          <div className={`col-main ${v.screenCls}`}>
            <div className="l-form">
              <h1 className="display s-head" tabIndex={-1} ref={v.setHeadingEl}>
                <Words text="What are you planning?" />
              </h1>
              <div className="s-body l-form">
                <div className="field l-field">
                  <label className="field-label" htmlFor="event-name">
                    Event name
                  </label>
                  <input
                    id="event-name"
                    className="input-line input-lg vt-title"
                    type="text"
                    autoComplete="off"
                    maxLength={60}
                    placeholder="Weekend plans"
                    value={v.name}
                    onChange={v.setName}
                    onKeyDown={v.nameKey}
                  />
                  {v.hasNameError ? (
                    <>
                      <p className="field-error" role="alert">
                        {v.nameError}
                      </p>
                    </>
                  ) : null}
                </div>
                <div className="l-actions">
                  <button type="button" className="btn btn-primary" onClick={v.next}>
                    Next
                  </button>
                  {/* Plain <a>, not next/link: a full page load keeps Main's and Event's CSS apart. */}
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                  <a className="text-btn" href="/example" onClick={v.saveForReturn}>
                    See an example
                  </a>
                </div>
              </div>
            </div>
            {v.hasMyEvents ? (
              <>
                <section className="my-events s-body" aria-labelledby="my-h">
                  <h2 id="my-h" className="label">
                    Your events
                  </h2>
                  <div className="my-list">
                    {(v.myEvents || []).map((ev: any) => (
                      <div key={ev.key} className="my-item">
                        <a className="my-row glass-control" href={ev.href}>
                          <span className="my-name">{ev.name}</span>
                          <span className="my-role">{ev.roleLabel}</span>
                          <span className="my-status">{ev.status}</span>
                        </a>
                        <button
                          type="button"
                          className="ev-close my-close"
                          onClick={ev.onCancel}
                          aria-label={`Cancel ${ev.name}`}
                          title="Cancel event"
                        >
                          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
